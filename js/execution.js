/* ===================================================================================
   PATCH UTAMA: PROFESSIONAL PORTFOLIO & AUTO EXECUTION ENGINE
   =================================================================================== */
const AutoEngine = {
    isActive: true,
    mode: 'PAPER', 
    maxRiskPerTradePct: 0.02, 
    _liveConnected: null,
    
    state: {
        balance: 100.0,
        availableBalance: 100.0,
        usedMargin: 0.0,
        unrealizedPnl: 0.0,
        equity: 100.0,
        peakEquity: 100.0,
        dailyLossDate: new Date().toLocaleDateString('id-ID'),
        dailyLossUsd: 0.0,
        allocated: { scalp: 25, intraday: 25, swing: 30, hold: 20 },
        history: [],
        cooldowns: {},
        metrics: { maxDrawdown: 0, totalTrades: 0, winningTrades: 0, totalProfitUsd: 0, totalLossUsd: 0 },
        pausedCoins: {}
    },

    init() {
        const savedState = localStorage.getItem('zavana_portfolio_state_v4');
        if (savedState) {
            try {
                const parsed = JSON.parse(savedState);
                this.state = { ...this.state, ...parsed, metrics: { ...this.state.metrics, ...parsed.metrics }};
            } catch(e){}
        }

        // LOAD STATUS AUTO-TRADE TERAKHIR (Memori)
        const savedAuto = localStorage.getItem('zavana_auto_active');
        if (savedAuto !== null) {
            this.isActive = savedAuto === 'true';
        } else {
            this.isActive = true; // Otomatis aktif di awal
        }
        
        // Sinkronisasi Switch UI
        setTimeout(() => {
            const toggle = document.getElementById('masterAutoToggle');
            if (toggle) {
                toggle.checked = this.isActive;
                document.getElementById('autoStatusBar').style.display = this.isActive ? 'flex' : 'none';
            }
        }, 100);

        const savedMode = localStorage.getItem('zavana_trading_mode');
        if (savedMode) {
            this.mode = savedMode;
            setTimeout(() => {
                if (this.mode === 'LIVE') {
                    document.getElementById('currentModeLabel').textContent = 'LIVE TRADING';
                    document.getElementById('currentModeLabel').style.color = 'var(--danger)';
                    const btn = document.getElementById('modeToggleBtn');
                    if (btn) { btn.textContent = 'LIVE MODE'; btn.style.borderColor = 'var(--danger)'; btn.style.color = 'var(--danger)'; }
                }
            }, 500);
        }

        this.syncPositions();
        this.updateEquity(); 

        // Auto-Sync Data Saldo dari Server Node.js (Binance) Setiap 5 Detik
        setInterval(() => {
            if (this.mode === 'LIVE') this.syncLiveAccount();
        }, 5000);
        if (this.mode === 'LIVE') this.syncLiveAccount();
    },

    async syncLiveAccount() {
        const url = localStorage.getItem('zavana_webhook_url');
        const secret = localStorage.getItem('zavana_webhook_secret');
        if (!url || !secret) return;
        try {
            const balanceUrl = url.replace('/webhook', '/api/balance');
            // Tambahan header bypass untuk Ngrok / LocalTunnel agar tidak diblokir
            const res = await fetch(balanceUrl, { headers: { 'Authorization': secret, 'Bypass-Tunnel-Reminder': 'true', 'ngrok-skip-browser-warning': 'true' } });
            if (res.ok) {
                const data = await res.json();
                this.state.balance = data.totalWalletBalance || 0;
                this.state.unrealizedPnl = data.totalUnrealizedProfit || 0;
                this.state.availableBalance = data.availableBalance || 0;
                this.state.equity = this.state.balance + this.state.unrealizedPnl;
                
                if (data.activePositions) this.state.realBinancePositions = data.activePositions;

                this.updateUI();
                if (this._liveConnected !== true) {
                    this._liveConnected = true;
                    showToast("✅ KONEKSI BINANCE BERHASIL! Saldo Sinkron.");
                }
            } else {
                const errText = await res.text();
                console.error("Gagal Sync Saldo:", errText);
                if (this._liveConnected !== false) {
                    this._liveConnected = false;
                    showToast("❌ KONEKSI BINANCE DITOLAK: Cek API Key atau IP Address Anda.");
                }
            }
        } catch (e) {
            console.error("Koneksi API Saldo Gagal:", e.message);
            if (this._liveConnected !== false) {
                this._liveConnected = false;
                showToast("❌ SERVER MATI: Pastikan Node.js menyala & Webhook URL benar.");
            }
        }
    },

    saveState() {
        localStorage.setItem('zavana_portfolio_state_v4', JSON.stringify(this.state));
        this.updateUI();
    },

    sendWebhook(payload) {
        if (this.mode !== 'LIVE') return;
        const url = localStorage.getItem('zavana_webhook_url');
        const secret = localStorage.getItem('zavana_webhook_secret');
        if (!url) return;

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': secret, 'Bypass-Tunnel-Reminder': 'true', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify(payload)
        }).catch(e => console.error("Webhook error:", e));
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
        
        // Jika LIVE, gunakan data saldo Binance murni, jangan hitungan lokal
        if (this.mode !== 'LIVE') {
            this.state.unrealizedPnl = totalUnrealized;
            this.state.equity = this.state.balance + totalUnrealized;
            this.state.availableBalance = this.state.balance - currentUsedMargin; 
        }
        this.state.usedMargin = currentUsedMargin;
        
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

        // REVISI: Cek apakah koin sedang di-pause manual
        if (this.state.pausedCoins && this.state.pausedCoins[sym]) return;

        if (res.signal === 'BUY' || res.signal === 'SELL') {
            // REVISI: Batasi Maksimal 3 Posisi Bersamaan
            const activeAutoCount = Object.values(userPositions).filter(p => p.isAuto).length;
            if (activeAutoCount >= 3) return; // Jangan buka posisi baru jika sudah ada 3 koin aktif

            // REVISI: Filter Akhir Pekan (Sabtu = 6, Minggu = 0)
            const day = new Date().getDay();
            const isWeekend = (day === 0 || day === 6);
            if (isWeekend) return; // Larang Open Posisi baru saat Weekend

            // REVISI: Eksekusi lebih cepat untuk mengejar awal mula trend breakout
            if (res.confidence >= 60) {
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

        // REVISI: Fixed Margin $50 (Modal Maksimal $50 per posisi)
        let marginRequired = 50.0;
        
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
        
        // REVISI: Frontend tetap mencatat posisi untuk kalkulasi Trailing Stop secara lokal
        userPositions[sym] = {
            isAuto: true, type: type, entry: price, size: positionSize, positionValue: positionValueUsd,
            sl: sl, tp: tp, leverage: safeLeverage, margin: 'Isolated', marginUsd: marginRequired,
            liqPrice: liqPrice, unrealizedPnl: 0, roi: 0, bucket: bucket, time: Date.now(),
            highestPrice: price, lowestPrice: price, atrAtEntry: atr,
            partialClosed: false
        };
        this.syncPositions();
        this.updateEquity(); 
        this.saveState();
        
        if (this.mode === 'LIVE') {
            showToast(`🚀 [LIVE SIGNAL SENT] OPEN ${type} ${sym} @ ${formatPrecision(price)}`);
            this.sendWebhook({
                action: 'OPEN',
                symbol: sym,
                type: type,
                price: price,
                leverage: safeLeverage,
                marginUsd: marginRequired
            });
        } else {
            showToast(`🤖 [EXECUTED] ${type} ${sym} @ ${formatPrecision(price)}<br>Size: ${positionSize.toFixed(4)} | Lev: ${safeLeverage}x | Margin: $${marginRequired.toFixed(2)}`);
        }
        if (typeof playAlertSound === 'function') playAlertSound('OPEN');
        renderPosBox(sym);
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
            // REVISI: Take Profit Partial (50%) saat untung mencapai 2 ATR
            if (priceMoveAtr > 2.0 && !pos.partialClosed) {
                this.closePartialTrade(sym, currentPrice, 0.5, 'Take Profit Partial (50%)');
                pos.partialClosed = true;
            }
            
            // REVISI: Advanced Multi-Stage Trailing Stop (Kunci profit maksimum)
            if (priceMoveAtr > 4.0) {
                const newTrailingSl = pos.highestPrice - (atr * 0.5); // Super ketat saat profit meledak
                if (newTrailingSl > pos.sl) pos.sl = newTrailingSl;
            } else if (priceMoveAtr > 2.0) {
                const newTrailingSl = pos.highestPrice - (atr * 1.0); // Kawal dengan jarak normal
                if (newTrailingSl > pos.sl) pos.sl = newTrailingSl;
            } else if (priceMoveAtr > 1.0) {
                if (pos.sl < pos.entry) pos.sl = pos.entry + (atr * 0.05); // Segera amankan Breakeven
            }
        } else {
            const priceMoveAtr = (pos.entry - currentPrice) / atr;
            if (priceMoveAtr > 2.0 && !pos.partialClosed) {
                this.closePartialTrade(sym, currentPrice, 0.5, 'Take Profit Partial (50%)');
                pos.partialClosed = true;
            }
            
            if (priceMoveAtr > 4.0) {
                const newTrailingSl = pos.lowestPrice + (atr * 0.5);
                if (newTrailingSl < pos.sl) pos.sl = newTrailingSl; 
            } else if (priceMoveAtr > 2.0) {
                const newTrailingSl = pos.lowestPrice + (atr * 1.0);
                if (newTrailingSl < pos.sl) pos.sl = newTrailingSl; 
            } else if (priceMoveAtr > 1.0) {
                if (pos.sl > pos.entry) pos.sl = pos.entry - (atr * 0.05);
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

        // REVISI: Sistem Pembatasan Kerugian Harian (Max Daily Drawdown)
        const today = new Date().toLocaleDateString('id-ID');
        if (this.state.dailyLossDate !== today) { 
            this.state.dailyLossDate = today; 
            this.state.dailyLossUsd = 0.0; 
        }
        if (realizedPnlUsd < 0) {
            this.state.dailyLossUsd += Math.abs(realizedPnlUsd);
            if (this.state.dailyLossUsd >= 15.0) { // Jika rugi mencapai $15 dalam sehari
                if (typeof toggleAutoTrading === 'function') toggleAutoTrading(false); // Matikan Saklar Auto Trade
                showToast("🛑 BATAS RUGI HARIAN ($15) TERCAPAI! Bot dimatikan untuk melindungi modal.");
            }
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

        if (this.mode === 'LIVE') {
            showToast(`🚀 [LIVE SIGNAL SENT] CLOSE ${sym} (${reason})`);
            this.sendWebhook({
                action: 'CLOSE',
                symbol: sym,
                type: pos.type,
                exitPrice: exitPrice,
                reason: reason
            });
        } else {
            showToast(`🤖 [CLOSED] ${sym} (${reason}). Realized: <b style="color:${realizedPnlUsd >= 0 ? 'var(--binance-green)' : 'var(--binance-red)'}">${realizedPnlUsd > 0 ? '+' : ''}${realizedPnlUsd.toFixed(2)} USDT</b>`);
        }
        if (typeof playAlertSound === 'function') playAlertSound('CLOSE');
        renderPosBox(sym);
    },

    closePartialTrade(sym, exitPrice, fraction, reason) {
        const pos = userPositions[sym];
        if(!pos) return;

        const closedSize = pos.size * fraction;
        const closedMargin = pos.marginUsd * fraction;
        const realizedPnlUsd = pos.type === 'BUY' ? (exitPrice - pos.entry) * closedSize : (pos.entry - exitPrice) * closedSize;
        
        this.state.balance += realizedPnlUsd;
        this.state.usedMargin -= closedMargin;
        pos.size -= closedSize; // Sisakan 50%
        pos.marginUsd -= closedMargin; // Sisakan margin 50%
        
        if (realizedPnlUsd > 0) {
            this.state.metrics.totalProfitUsd += realizedPnlUsd;
        } else {
            this.state.metrics.totalLossUsd += Math.abs(realizedPnlUsd);
        }

        this.state.history.push({
            time: new Date().toLocaleString('id-ID'), sym: sym, type: pos.type, entry: pos.entry,
            exit: exitPrice, size: closedSize, pnlUsd: realizedPnlUsd, roiPct: (realizedPnlUsd / closedMargin) * 100,
            reason: reason, leverage: pos.leverage, marginUsd: closedMargin
        });

        this.syncPositions();
        this.updateEquity(); 
        this.saveState();

        if (this.mode === 'LIVE') {
            showToast(`🚀 [LIVE SIGNAL SENT] PARTIAL CLOSE 50% ${sym}`);
            this.sendWebhook({ action: 'PARTIAL_CLOSE', symbol: sym, type: pos.type, fraction: fraction, reason: reason });
        } else {
            showToast(`🤖 [PARTIAL CLOSE 50%] ${sym}. Realized: <b style="color:${realizedPnlUsd >= 0 ? 'var(--binance-green)' : 'var(--binance-red)'}">${realizedPnlUsd > 0 ? '+' : ''}${realizedPnlUsd.toFixed(2)} USDT</b>`);
        }
        if (typeof playAlertSound === 'function') playAlertSound('CLOSE');
        renderPosBox(sym);
    },

    closeAllPositions() {
        if(confirm("🚨 EMERGENCY: Yakin ingin menutup SEMUA posisi aktif saat ini?")) {
            let count = 0;
            // Karena menghapus item dari objek saat di-loop bisa bermasalah, kita simpan keys-nya dulu
            const symbols = Object.keys(userPositions);
            for (let sym of symbols) {
                const pos = userPositions[sym];
                // Ambil harga terkini (mark price) atau fallback ke harga entry
                const currentPrice = pos.markPrice || (typeof analysisResults !== 'undefined' ? analysisResults.get(sym)?.price : pos.entry) || pos.entry;
                this.closeTrade(sym, currentPrice, 'EMERGENCY CLOSE ALL');
                count++;
            }
            if (count > 0) showToast(`🛑 EMERGENCY: ${count} Posisi sedang ditutup!`);
            else showToast("Tidak ada posisi aktif yang perlu ditutup.");
        }
    },

    updateUI() {
        const balEl = document.getElementById('navBalanceDisplay');
        if (balEl) balEl.textContent = `${this.state.equity.toFixed(2)} USDT`;
        if (typeof renderReportDashboard === 'function') renderReportDashboard();

        const syncText = document.getElementById('syncModeText');
        if (syncText) {
            syncText.textContent = this.mode === 'LIVE' ? 'LIVE BINANCE (SYNCED)' : 'PAPER TRADING (LOCAL)';
            syncText.style.color = this.mode === 'LIVE' ? 'var(--danger)' : 'var(--warning)';
        }
    }
};

window.toggleAutoTrading = function(isActive) {
    AutoEngine.isActive = isActive;
    localStorage.setItem('zavana_auto_active', isActive);
    document.getElementById('autoStatusBar').style.display = isActive ? 'flex' : 'none';
    showToast(isActive ? "🤖 Mesin Portofolio Auto-Execution AKTIF." : "🛑 Mesin Auto-Execution DIMATIKAN.");
};

window.toggleTradingMode = function() {
    if (AutoEngine.mode === 'PAPER') {
        const url = localStorage.getItem('zavana_webhook_url');
        if (!url) {
            alert("Harap isi Webhook URL di menu Settings terlebih dahulu untuk mengaktifkan LIVE TRADING.");
            return;
        }
        if (confirm("PERINGATAN: Anda akan beralih ke LIVE TRADING. Sinyal akan dikirim ke server Node.js Anda untuk dieksekusi di Binance menggunakan dana sungguhan. Lanjutkan?")) {
            AutoEngine.mode = 'LIVE';
            document.getElementById('currentModeLabel').textContent = 'LIVE TRADING';
            document.getElementById('currentModeLabel').style.color = 'var(--danger)';
            const btn = document.getElementById('modeToggleBtn');
            if (btn) { btn.textContent = 'LIVE MODE'; btn.style.borderColor = 'var(--danger)'; btn.style.color = 'var(--danger)'; }
            showToast("⚠️ BERALIH KE LIVE TRADING MODE");
            AutoEngine.syncLiveAccount(); // Tarik saldo seketika!
        }
    } else {
        AutoEngine.mode = 'PAPER';
        document.getElementById('currentModeLabel').textContent = 'PAPER TRADING';
        document.getElementById('currentModeLabel').style.color = 'var(--warning)';
        const btn = document.getElementById('modeToggleBtn');
        if (btn) { btn.textContent = 'PAPER MODE'; btn.style.borderColor = 'var(--warning)'; btn.style.color = 'var(--warning)'; }
        showToast("✅ KEMBALI KE PAPER TRADING");
    }
    localStorage.setItem('zavana_trading_mode', AutoEngine.mode);
};

window.closeAllPositions = function() {
    AutoEngine.closeAllPositions();
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
        const simulatedMargin = 50; 
        const posSize = (simulatedMargin * leverage) / val;

        userPositions[sym] = { 
            isAuto: false, 
            entry: val, size: posSize, marginUsd: simulatedMargin, tf: CURRENT_TF.label, 
            type: actionType || 'BUY', margin: marginMode, leverage: leverage 
        };
        localStorage.setItem('zavana_positions_lux', JSON.stringify(userPositions));
            
            if (AutoEngine.mode === 'LIVE') {
                AutoEngine.sendWebhook({ action: 'OPEN', symbol: sym, type: actionType || 'BUY', price: val, leverage: leverage, marginUsd: simulatedMargin });
                showToast(`🚀 [LIVE MANUAL] OPEN ${actionType || 'BUY'} ${sym} SENT!`);
            } else {
                showToast(`[MANUAL PAPER] Posisi ${sym} Berhasil Disimpan!`);
            }
            
        renderPosBox(sym);
        const hist = marketData.get(sym);
        if (hist) analyzeQuantum(sym, hist, CURRENT_TF, false, false);
    }
};

window.clearPos = function(sym) {
        const pos = userPositions[sym];
        if (!pos) {
            if (AutoEngine.mode === 'LIVE') {
                AutoEngine.sendWebhook({ action: 'CLOSE', symbol: sym, type: 'UNKNOWN', exitPrice: 0, reason: 'Remote Close via Web/HP' });
                showToast(`🚀 [REMOTE] Sinyal CLOSE ${sym} dikirim ke Binance!`);
                setTimeout(() => AutoEngine.syncLiveAccount(), 2000);
            }
            return;
        }
        const currentPrice = pos.markPrice || (typeof analysisResults !== 'undefined' ? analysisResults.get(sym)?.price : pos.entry) || pos.entry;
        
        // Gunakan mesin AutoEngine untuk menutup agar tercatat di History dan Webhook terkirim
        AutoEngine.closeTrade(sym, currentPrice, 'Ditutup Manual via Web');
};