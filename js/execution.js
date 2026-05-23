/* ===================================================================================
   PATCH UTAMA: PROFESSIONAL PORTFOLIO & AUTO EXECUTION ENGINE
   =================================================================================== */
const AutoEngine = {
    isActive: false,
    mode: 'PAPER', 
    maxRiskPerTradePct: 0.02, 
    
    state: {
        balance: 100.0,
        availableBalance: 100.0,
        usedMargin: 0.0,
        unrealizedPnl: 0.0,
        equity: 100.0,
        peakEquity: 100.0,
        allocated: { scalp: 25, intraday: 25, swing: 30, hold: 20 },
        history: [],
        cooldowns: {},
        metrics: { maxDrawdown: 0, totalTrades: 0, winningTrades: 0, totalProfitUsd: 0, totalLossUsd: 0 }
    },

    init() {
        const savedState = localStorage.getItem('zavana_portfolio_state_v4');
        if (savedState) {
            try {
                const parsed = JSON.parse(savedState);
                this.state = { ...this.state, ...parsed, metrics: { ...this.state.metrics, ...parsed.metrics }};
            } catch(e){}
        }
        this.syncPositions();
        this.updateEquity(); 
    },

    saveState() {
        localStorage.setItem('zavana_portfolio_state_v4', JSON.stringify(this.state));
        this.updateUI();
    },

    resetPaperAccount() {
        if(confirm("Reset akun Futures Simulation ke 100 USDT? Semua riwayat dan posisi akan dihapus permanen.")) {
            this.state = {
                balance: 100.0, availableBalance: 100.0, usedMargin: 0.0, unrealizedPnl: 0.0, equity: 100.0, peakEquity: 100.0,
                allocated: { scalp: 25, intraday: 25, swing: 30, hold: 20 },
                history: [], cooldowns: {},
                metrics: { maxDrawdown: 0, totalTrades: 0, winningTrades: 0, totalProfitUsd: 0, totalLossUsd: 0 }
            };
            for(let sym in userPositions) { if(userPositions[sym].isAuto) delete userPositions[sym]; }
            this.syncPositions();
            this.saveState();
            showToast("Akun Futures (Simulation) direset ke 100 USDT.");
            setTimeout(() => location.reload(), 1000);
        }
    },

    syncPositions() {
        localStorage.setItem('zavana_positions_lux', JSON.stringify(userPositions));
    },

    updateEquity() {
        let totalUnrealized = 0;
        let currentUsedMargin = 0;
        
        for (let sym in userPositions) {
            const pos = userPositions[sym];
            if (pos.isAuto) {
                const markPrice = analysisResults.get(sym)?.price || pos.entry;
                const pnl = pos.type === 'BUY' ? (markPrice - pos.entry) * pos.size : (pos.entry - markPrice) * pos.size;
                pos.unrealizedPnl = pnl;
                pos.roi = (pnl / pos.marginUsd) * 100;
                pos.markPrice = markPrice;
                totalUnrealized += pnl;
                currentUsedMargin += pos.marginUsd;

                if (pos.roi <= -95) {
                    this.closeTrade(sym, markPrice, 'LIQUIDATED (Margin Call)');
                    continue; 
                }
            }
        }
        
        this.state.unrealizedPnl = totalUnrealized;
        this.state.usedMargin = currentUsedMargin;
        this.state.equity = this.state.balance + totalUnrealized;
        this.state.availableBalance = this.state.balance - currentUsedMargin; 
        
        if (this.state.availableBalance < 0) this.state.availableBalance = 0;
        if (this.state.equity > this.state.peakEquity) this.state.peakEquity = this.state.equity;
        
        this.updateUI();
    },

    allocateCapital() {
        if (MacroEnvironment.globalRiskStatus === 'SHOCK') {
            this.state.allocated = { scalp: 40, intraday: 30, swing: 20, hold: 10 };
        } else if (MacroEnvironment.btcTrendDir === 1) {
            this.state.allocated = { scalp: 15, intraday: 25, swing: 35, hold: 25 }; 
        } else {
            this.state.allocated = { scalp: 25, intraday: 25, swing: 30, hold: 20 }; 
        }
    },

    processSignal(sym, res, tf, currentPrice, atr) {
        if (!this.isActive) return;
        const now = Date.now();
        if (this.state.cooldowns[sym] && now - this.state.cooldowns[sym] < 1800000) return; 

        const hasPos = userPositions[sym];
        
        if (hasPos && hasPos.isAuto) {
            const isLong = hasPos.type === 'BUY';
            const isShort = hasPos.type === 'SELL';
            
            if (isLong && res.signal === 'SELL' && res.confidence > 70) {
                this.closeTrade(sym, currentPrice, 'Reversal Sinyal Bearish Valid');
            } else if (isShort && res.signal === 'BUY' && res.confidence > 70) {
                this.closeTrade(sym, currentPrice, 'Reversal Sinyal Bullish Valid');
            }
            return; 
        }

        if (this.state.availableBalance < 2) return;

        if (res.signal === 'BUY' || res.signal === 'SELL') {
            if (res.confidence >= 65) {
                const riskReward = Math.abs(currentPrice - res.target) / (Math.abs(currentPrice - res.stopLoss) || 1);
                if (riskReward >= 1.2) { 
                    this.executeTrade(sym, res.signal, currentPrice, res.stopLoss, res.target, tf.agg, res.confidence, atr);
                }
            }
        }
    },

    executeTrade(sym, type, price, sl, tp, tfAgg, conf, atr) {
        this.allocateCapital(); 
        
        let bucket = 'swing';
        if (tfAgg <= 15) bucket = 'scalp';
        else if (tfAgg <= 60) bucket = 'intraday';
        else if (tfAgg >= 1440) bucket = 'hold';

        const riskLimitUsd = this.state.equity * this.maxRiskPerTradePct;
        const slDistancePct = Math.abs(price - sl) / price;
        
        let safeLeverage = Math.floor(0.15 / slDistancePct); 
        if (safeLeverage > 50) safeLeverage = 50; 
        if (safeLeverage < 1) safeLeverage = 1;

        let marginRequired = riskLimitUsd / (slDistancePct * safeLeverage);
        const bucketCapitalLimit = (this.state.equity * (this.state.allocated[bucket] / 100)) * 0.8; 
        if (marginRequired > bucketCapitalLimit) marginRequired = bucketCapitalLimit;
        
        if (marginRequired > this.state.availableBalance) {
            marginRequired = this.state.availableBalance * 0.95; 
        }
        if (marginRequired < 1) return; 

        const positionValueUsd = marginRequired * safeLeverage;
        const positionSize = positionValueUsd / price;
        const mmr = 0.005; 
        const liqPrice = type === 'BUY' ? price * (1 - (1/safeLeverage) + mmr) : price * (1 + (1/safeLeverage) - mmr);

        this.state.availableBalance -= marginRequired;
        this.state.usedMargin += marginRequired;
        
        if (this.mode === 'PAPER') {
            userPositions[sym] = {
                isAuto: true, type: type, entry: price, size: positionSize, positionValue: positionValueUsd,
                sl: sl, tp: tp, leverage: safeLeverage, margin: 'Isolated', marginUsd: marginRequired,
                liqPrice: liqPrice, unrealizedPnl: 0, roi: 0, bucket: bucket, time: Date.now(),
                highestPrice: price, lowestPrice: price, atrAtEntry: atr
            };
            this.syncPositions();
            this.updateEquity(); 
            this.saveState();
            showToast(`🤖 [EXECUTED] ${type} ${sym} @ ${formatPrecision(price)}<br>Size: ${positionSize.toFixed(4)} | Lev: ${safeLeverage}x | Margin: $${marginRequired.toFixed(2)}`);
            renderPosBox(sym);
        }
    },

    onTick(sym, currentPrice) {
        if (!this.isActive) return;
        this.updateEquity();

        const pos = userPositions[sym];
        if (!pos || !pos.isAuto) return;

        const isLong = pos.type === 'BUY';
        
        if (currentPrice > pos.highestPrice) pos.highestPrice = currentPrice;
        if (currentPrice < pos.lowestPrice) pos.lowestPrice = currentPrice;

        const atr = pos.atrAtEntry || (currentPrice * 0.01); 
        let closeReason = null;

        if (isLong) {
            const priceMoveAtr = (currentPrice - pos.entry) / atr;
            if (priceMoveAtr > 3) {
                const newTrailingSl = pos.highestPrice - (atr * 1.5);
                if (newTrailingSl > pos.sl) pos.sl = newTrailingSl;
            } else if (priceMoveAtr > 1.5) {
                if (pos.sl < pos.entry) pos.sl = pos.entry + (atr * 0.1);
            }
        } else {
            const priceMoveAtr = (pos.entry - currentPrice) / atr;
            if (priceMoveAtr > 3) {
                const newTrailingSl = pos.lowestPrice + (atr * 1.5);
                if (newTrailingSl < pos.sl) pos.sl = newTrailingSl; 
            } else if (priceMoveAtr > 1.5) {
                if (pos.sl > pos.entry) pos.sl = pos.entry - (atr * 0.1);
            }
        }

        if ((isLong && currentPrice <= pos.sl) || (!isLong && currentPrice >= pos.sl)) {
            const isProfit = isLong ? pos.sl >= pos.entry : pos.sl <= pos.entry;
            closeReason = isProfit ? 'Trailing Stop Hit (Locked Profit)' : 'Stop Loss Terkena';
        }
        else if ((isLong && currentPrice >= pos.tp) || (!isLong && currentPrice <= pos.tp)) {
            closeReason = 'Target Profit (TP) Tercapai';
        }
        else if (Date.now() - pos.time > 172800000 && Math.abs(pos.roi) < 5) {
            closeReason = 'Time Stop (Stagnan > 48 Jam)';
        }

        if (closeReason) {
            this.closeTrade(sym, currentPrice, closeReason);
        }
    },

    closeTrade(sym, exitPrice, reason) {
        const pos = userPositions[sym];
        if(!pos) return;

        const realizedPnlUsd = pos.type === 'BUY' ? (exitPrice - pos.entry) * pos.size : (pos.entry - exitPrice) * pos.size;
        this.state.balance += realizedPnlUsd;
        
        const currentDrawdown = ((this.state.peakEquity - this.state.equity) / this.state.peakEquity) * 100;
        if (currentDrawdown > this.state.metrics.maxDrawdown) this.state.metrics.maxDrawdown = currentDrawdown;

        this.state.metrics.totalTrades += 1;
        if (realizedPnlUsd > 0) {
            this.state.metrics.winningTrades += 1;
            this.state.metrics.totalProfitUsd += realizedPnlUsd;
        } else {
            this.state.metrics.totalLossUsd += Math.abs(realizedPnlUsd);
        }

        this.state.history.push({
            time: new Date().toLocaleString('id-ID'), sym: sym, type: pos.type, entry: pos.entry,
            exit: exitPrice, size: pos.size, pnlUsd: realizedPnlUsd, roiPct: (realizedPnlUsd / pos.marginUsd) * 100,
            reason: reason, leverage: pos.leverage, marginUsd: pos.marginUsd
        });

        this.state.cooldowns[sym] = Date.now();
        delete userPositions[sym];
        this.syncPositions();
        this.updateEquity(); 
        this.saveState();

        showToast(`🤖 [CLOSED] ${sym} (${reason}). Realized: <b style="color:${realizedPnlUsd >= 0 ? 'var(--binance-green)' : 'var(--binance-red)'}">${realizedPnlUsd > 0 ? '+' : ''}${realizedPnlUsd.toFixed(2)} USDT</b>`);
        renderPosBox(sym);
    },

    updateUI() {
        const balEl = document.getElementById('navBalanceDisplay');
        if (balEl) balEl.textContent = `${this.state.equity.toFixed(2)} USDT`;
        if (typeof renderReportDashboard === 'function') renderReportDashboard();
    }
};

window.toggleAutoTrading = function(isActive) {
    AutoEngine.isActive = isActive;
    document.getElementById('autoStatusBar').style.display = isActive ? 'flex' : 'none';
    showToast(isActive ? "🤖 Mesin Portofolio Auto-Execution AKTIF." : "🛑 Mesin Auto-Execution DIMATIKAN.");
};

window.toggleTradingMode = function() {
    if (AutoEngine.mode === 'PAPER') {
        alert("Sistem Manajemen Portofolio saat ini mengunci ke mode Paper Trading (Simulasi Compounding). Mode LIVE TRADING membutuhkan VPS Node.js eksternal agar kunci API Binance aman.");
    }
};

window.toggleOrderInput = function(sym) {
    const type = document.getElementById(`pos-type-${sym}`).value;
    const input = document.getElementById(`pos-entry-input-${sym}`);
    if (type === 'MARKET') { input.disabled = true; input.placeholder = "Otomatis Market"; input.value = ''; } 
    else { input.disabled = false; input.placeholder = "Ketik Harga Limit..."; }
};

window.setPos = function(sym, actionType) {
    const orderType = document.getElementById(`pos-type-${sym}`).value;
    const marginMode = document.getElementById(`pos-margin-${sym}`).value;
    const leverage = parseInt(document.getElementById(`pos-lev-${sym}`).value) || 20;
    let val = orderType === 'MARKET' ? (analysisResults.get(sym)?.price || 0) : parseFloat(document.getElementById(`pos-entry-input-${sym}`).value);
    
    if (val > 0) {
        const simulatedMargin = 10; 
        const posSize = (simulatedMargin * leverage) / val;

        userPositions[sym] = { 
            isAuto: false, 
            entry: val, size: posSize, marginUsd: simulatedMargin, tf: CURRENT_TF.label, 
            type: actionType || 'BUY', margin: marginMode, leverage: leverage 
        };
        localStorage.setItem('zavana_positions_lux', JSON.stringify(userPositions));
        renderPosBox(sym);
        const hist = marketData.get(sym);
        if (hist) analyzeQuantum(sym, hist, CURRENT_TF, false, false);
        showToast(`[MANUAL] Posisi ${sym} Berhasil Disimpan!`);
    }
};

window.clearPos = function(sym) {
    delete userPositions[sym];
    localStorage.setItem('zavana_positions_lux', JSON.stringify(userPositions));
    AutoEngine.updateEquity(); 
    renderPosBox(sym);
    const hist = marketData.get(sym);
    if (hist) analyzeQuantum(sym, hist, CURRENT_TF, false, false);
    showToast(`Posisi ${sym} Ditutup`);
};