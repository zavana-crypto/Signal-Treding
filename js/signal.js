/* =========================================
   ADVANCED MATHEMATICS & SMC
   ========================================= */
function calcATRArray(data, period) {
    let results = new Array(data.length).fill(0), trs = new Array(data.length).fill(0);
    for (let i = 1; i < data.length; i++) { trs[i] = Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i-1].close), Math.abs(data[i].low - data[i-1].close)); }
    let sum = 0; for(let i = 1; i <= period; i++) sum += trs[i]; results[period] = sum / period;
    let alpha = 1 / period; for (let i = period + 1; i < data.length; i++) results[i] = (trs[i] - results[i-1]) * alpha + results[i-1];
    return results;
}

function calcEMA(data, period) {
    let emaArr = new Array(data.length).fill(0), k = 2 / (period + 1), ema = data[0].close;
    for (let i = 0; i < data.length; i++) { ema = (data[i].close - ema) * k + ema; emaArr[i] = ema; }
    return emaArr;
}

function calcVWAP(data) {
    let vwapArr = new Array(data.length).fill(0), cumVol = 0, cumPV = 0;
    for (let i = 0; i < data.length; i++) { let typical = (data[i].high + data[i].low + data[i].close) / 3; cumVol += data[i].volume; cumPV += typical * data[i].volume; vwapArr[i] = cumVol === 0 ? typical : cumPV / cumVol; }
    return vwapArr;
}

function calcOBV(data) {
    let obvArr = new Array(data.length).fill(0), currentObv = 0;
    for(let i=1; i<data.length; i++) {
        if(data[i].close > data[i-1].close) currentObv += data[i].volume;
        else if(data[i].close < data[i-1].close) currentObv -= data[i].volume;
        obvArr[i] = currentObv;
    }
    return obvArr;
}

function calcADX(data, period=14) {
    let adxArr = new Array(data.length).fill(0), plusDI = new Array(data.length).fill(0), minusDI = new Array(data.length).fill(0);
    if (data.length <= period) return {adx: adxArr, pDI: plusDI, mDI: minusDI};
    let tr = new Array(data.length).fill(0), plusDM = new Array(data.length).fill(0), minusDM = new Array(data.length).fill(0);

    for (let i = 1; i < data.length; i++) {
        const hd = data[i].high - data[i-1].high, ld = data[i-1].low - data[i].low;
        tr[i] = Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i-1].close), Math.abs(data[i].low - data[i-1].close));
        plusDM[i] = (hd > ld && hd > 0) ? hd : 0; minusDM[i] = (ld > hd && ld > 0) ? ld : 0;
    }
    let sTR = 0, sPDM = 0, sMDM = 0;
    for(let i=1; i<=period; i++) { sTR += tr[i]; sPDM += plusDM[i]; sMDM += minusDM[i]; }

    for(let i=period; i<data.length; i++) {
        if (i > period) { sTR = sTR - (sTR/period) + tr[i]; sPDM = sPDM - (sPDM/period) + plusDM[i]; sMDM = sMDM - (sMDM/period) + minusDM[i]; }
        plusDI[i] = sTR === 0 ? 0 : 100 * (sPDM / sTR); minusDI[i] = sTR === 0 ? 0 : 100 * (sMDM / sTR);
    }
    let dx = new Array(data.length).fill(0);
    for(let i=period; i<data.length; i++) { let sum = plusDI[i] + minusDI[i]; dx[i] = sum === 0 ? 0 : 100 * Math.abs(plusDI[i] - minusDI[i]) / sum; }
    let sDx = 0; for(let i=period; i<period*2 && i<data.length; i++) sDx += dx[i];
    let cAdx = sDx / period;
    for(let i=period*2; i<data.length; i++) { cAdx = ((cAdx * (period-1)) + dx[i]) / period; adxArr[i] = cAdx; }
    return { adx: adxArr, pDI: plusDI, mDI: minusDI };
}

function calcOrderBlocks(data, lookback = 30) {
    let obBull = null, obBear = null;
    const end = data.length - 1, start = Math.max(1, end - lookback);
    for (let i = start; i < end - 1; i++) {
        const isDown = data[i].close < data[i].open, isUp = data[i].close > data[i].open;
        if (isDown && data[i+1].close > data[i].high && data[i+1].volume > data[i].volume * 1.5) obBull = { top: data[i].high, bottom: data[i].low, time: data[i].time };
        if (isUp && data[i+1].close < data[i].low && data[i+1].volume > data[i].volume * 1.5) obBear = { top: data[i].high, bottom: data[i].low, time: data[i].time };
    }
    return { obBull, obBear };
}

function calcCoinglassProxies(data, i, obvArr, atr) {
    const current = data[i];
    const takerBuy = current.takerBuy || 0;
    const takerSell = current.volume - takerBuy;
    const volDelta = takerBuy - takerSell;
    const isOIRising = current.volume > (data[i-1]?.volume || 0) * 1.2;
    
    let liqImbalance = 'NEUTRAL';
    let shortHeat = 0, longHeat = 0;
    for (let j = Math.max(0, i-15); j <= i; j++) {
        if (data[j].close < data[j].open) shortHeat += data[j].volume;
        else longHeat += data[j].volume;
    }

    if (shortHeat > longHeat * 1.5) liqImbalance = 'HEAVY_SHORTS (Squeeze Up Potential)';
    else if (longHeat > shortHeat * 1.5) liqImbalance = 'HEAVY_LONGS (Flush Down Potential)';

    const shortLiq = current.high + (atr * 1.2);
    const longLiq = current.low - (atr * 1.2);

    return { volDelta, isOIRising, liqImbalance, shortLiq, longLiq };
}

function detectMarketStructure(data, lookback=60) {
    const end = data.length - 1; const start = Math.max(3, end - lookback);
    let swingHighs = [], swingLows = [];
    for (let i = start+2; i < end-2; i++) {
        if (data[i].high > data[i-1].high && data[i].high > data[i-2].high && data[i].high > data[i+1].high && data[i].high > data[i+2].high) swingHighs.push({ price: data[i].high, idx: i });
        if (data[i].low < data[i-1].low && data[i].low < data[i-2].low && data[i].low < data[i+1].low && data[i].low < data[i+2].low) swingLows.push({ price: data[i].low, idx: i });
    }
    let structure = 'RANGING';
    if (swingHighs.length >= 2 && swingLows.length >= 2) {
        const lSH = swingHighs[swingHighs.length-1].price, pSH = swingHighs[swingHighs.length-2].price;
        const lSL = swingLows[swingLows.length-1].price, pSL = swingLows[swingLows.length-2].price;
        if (lSH > pSH && lSL > pSL) structure = 'BULLISH'; else if (lSH < pSH && lSL < pSL) structure = 'BEARISH'; 
    }
    return { structure, swingHighs, swingLows };
}

function detectLiquiditySweep(current, swingHighs, swingLows) {
    let sweepBull = false, sweepBear = false;
    let sweptLow = 0, sweptHigh = 0;
    
    for(let i = Math.max(0, swingLows.length - 3); i < swingLows.length; i++) {
        let sl = swingLows[i].price;
        if (current.low < sl && current.close > sl) { sweepBull = true; sweptLow = sl; break; }
    }
    for(let i = Math.max(0, swingHighs.length - 3); i < swingHighs.length; i++) {
        let sh = swingHighs[i].price;
        if (current.high > sh && current.close < sh) { sweepBear = true; sweptHigh = sh; break; }
    }
    return { sweepBull, sweepBear, sweptLow, sweptHigh };
}

/* =========================================
   PROFESSIONAL TRADING ENGINE & ANALYZER
   ========================================= */
function analyzeQuantum(sym, data, tf = CURRENT_TF, isBackground = false, fullScan = false) {
    if (data.length < 60) return;

    const i = data.length - 1;
    const current = data[i]; const prev = i > 0 ? data[i-1] : current;

    const emaFastArr = calcEMA(data, tf.emaF);
    const emaSlowArr = calcEMA(data, tf.emaS);
    const ema200Arr = calcEMA(data, 200); 
    const vwapArr = calcVWAP(data);
    const atrArr = calcATRArray(data, 14);
    const obvArr = calcOBV(data);
    const adxData = calcADX(data, tf.adxLookback);
    const orderBlk = calcOrderBlocks(data, 30);
    const mktStr = detectMarketStructure(data, 60);
    const sweeps = detectLiquiditySweep(current, mktStr.swingHighs, mktStr.swingLows);

    const emaFast = emaFastArr[i], emaSlow = emaSlowArr[i], ema200 = ema200Arr[i];
    const atr = atrArr[i], obv = obvArr[i];
    const adx = adxData.adx[i], pDI = adxData.pDI[i], mDI = adxData.mDI[i];
    const vwap = vwapArr[i];

    const volAvg = i > 3 ? (data[i-1].volume + data[i-2].volume + data[i-3].volume) / 3 : current.volume;
    const isHighVolume = current.volume > (volAvg * 1.3); 

    let isWashTrading = false;
    if (current.volume > (volAvg * 4) && Math.abs(current.close - current.open) < (atr * 0.3)) {
        isWashTrading = true;
    }

    let tradeClass = "SWING TRADING";
    if (tf.agg <= 15 && (atr / current.close) > 0.005) tradeClass = "ULTRA-SCALP / HFT";
    else if (tf.agg <= 60) tradeClass = "INTRADAY MOMENTUM";
    else if (tf.agg >= 1440) tradeClass = "LONG TERM HOLD";

    const cgProxies = calcCoinglassProxies(data, i, obvArr, atr);

    if (sym === "BTCUSDT") {
        MacroEnvironment.btcTrendDir = emaFast > emaSlow ? 1 : (emaFast < emaSlow ? -1 : 0);
        MacroEnvironment.btcAtrPct = (atr / current.close) * 100;
        MacroEnvironment.globalRiskStatus = (adx > 45 || current.high - current.low > atr * 3) ? 'SHOCK' : 'NORMAL';
    }

    let buyScore = 0, sellScore = 0;
    let buyFactors = [], sellFactors = [];

    const isUptrend = emaFast > emaSlow;
    const structureBull = mktStr.structure === 'BULLISH';
    const structureBear = mktStr.structure === 'BEARISH';
    const isTrending = adx > 20; 

    if (isUptrend && current.close > ema200) { buyScore += 15; buyFactors.push(`Trend Sejalan (EMA ${tf.emaF}/${tf.emaS})`); }
    if (!isUptrend && current.close < ema200) { sellScore += 15; sellFactors.push(`Trend Bearish (EMA ${tf.emaF}/${tf.emaS})`); }
    
    if (structureBull) { buyScore += 15; buyFactors.push('Market Structure: Higher Highs'); }
    if (structureBear) { sellScore += 15; sellFactors.push('Market Structure: Lower Lows'); }

    if (cgProxies.volDelta > 0 && cgProxies.isOIRising) { buyScore += 20; buyFactors.push('🔥 Taker Buy Spiking + OI Naik (Smart Money Long)'); }
    if (cgProxies.volDelta < 0 && cgProxies.isOIRising) { sellScore += 20; sellFactors.push('🩸 Taker Sell Spiking + OI Naik (Smart Money Short)'); }
    
    if (cgProxies.liqImbalance === 'HEAVY_SHORTS (Squeeze Up Potential)') { buyScore += 15; buyFactors.push('⚠️ Coinglass: Heavy Shorts (Short Squeeze Target)'); }
    if (cgProxies.liqImbalance === 'HEAVY_LONGS (Flush Down Potential)') { sellScore += 15; sellFactors.push('⚠️ Coinglass: Heavy Longs (Liquidation Target)'); }

    if (isTrending) {
        if (pDI > mDI && pDI > 25) { 
            if (isHighVolume) { buyScore += 10; buyFactors.push(`Momentum Valid & High Volume`); }
            else { buyScore -= 15; buyFactors.push(`⚠️ Weak Momentum (Fake Breakout Risk)`); }
        }
        if (mDI > pDI && mDI > 25) { 
            if (isHighVolume) { sellScore += 10; sellFactors.push(`Momentum Valid & High Volume`); }
            else { sellScore -= 15; sellFactors.push(`⚠️ Weak Momentum (Fake Breakout Risk)`); }
        }
    } else {
        if (Math.abs(cgProxies.volDelta) > (current.volume * 0.4)) {
            buyFactors.push('⚠️ Early Breakout Attempt'); sellFactors.push('⚠️ Early Breakdown Attempt');
        } else {
            buyScore -= 10; sellScore -= 10; 
        }
    }

    if (orderBlk.obBull && current.low <= orderBlk.obBull.top && current.close >= orderBlk.obBull.bottom) { buyScore += 20; buyFactors.push('✅ Pantulan Akurat Bullish Order Block'); }
    if (orderBlk.obBear && current.high >= orderBlk.obBear.bottom && current.close <= orderBlk.obBear.top) { sellScore += 20; sellFactors.push('🚫 Rejeksi Akurat Bearish Order Block'); }
    
    if (sweeps.sweepBull && cgProxies.volDelta > 0) { buyScore += 30; buyFactors.push('🐋 Bullish Liquidity Sweep (Stop Hunt Valid)'); }
    if (sweeps.sweepBear && cgProxies.volDelta < 0) { sellScore += 30; sellFactors.push('🐋 Bearish Liquidity Sweep (Stop Hunt Valid)'); }

    for (const [narrative, coins] of Object.entries(NARRATIVE_MAP)) {
        if (coins.includes(sym) && NARRATIVE_STRENGTH[narrative] > 4) {
            buyScore += 15; buyFactors.push(`🚀 Narrative Boost (${narrative.replace('_', ' ')})`);
        }
    }
    if (isWashTrading) {
        buyScore -= 40; sellScore -= 40;
        buyFactors.push("🚨 Anti-Manipulasi: Wash Trading / Fake Volume Terdeteksi");
        sellFactors.push("🚨 Anti-Manipulasi: Wash Trading / Fake Volume Terdeteksi");
    }

    if (tf.agg <= 60) {
        if (current.low <= vwap && current.close > vwap) { buyScore += 15; buyFactors.push('✅ VWAP Bounce Support'); }
        if (current.high >= vwap && current.close < vwap) { sellScore += 15; sellFactors.push('🚫 VWAP Rejection'); }
    }

    buyScore = Math.max(0, Math.min(100, buyScore));
    sellScore = Math.max(0, Math.min(100, sellScore));

    const isVolatile = (current.high - current.low) > (atr * 1.5);
    const baseThreshold = tf.agg <= 15 ? 55 : (tf.agg <= 240 ? 60 : 65);
    const activeThreshold = isVolatile ? baseThreshold - 5 : baseThreshold + 5; 

    let confidence = Math.max(buyScore, sellScore);
    let dominantDir = buyScore > sellScore ? 'LONG' : (sellScore > buyScore ? 'SHORT' : 'NEUTRAL');
    let signal = 'WAIT', subSignal = 'STANDBY';
    let activeFactors = dominantDir === 'LONG' ? buyFactors : sellFactors;

    if (confidence >= activeThreshold + 15) {
        signal = dominantDir === 'LONG' ? 'BUY' : 'SELL';
        subSignal = 'HIGH_CONFIDENCE';
    } else if (confidence >= activeThreshold) {
        signal = dominantDir === 'LONG' ? 'BUY' : 'SELL';
        subSignal = 'CONFIRMED';
    } else if (confidence >= activeThreshold - 15) {
        signal = 'WAIT';
        subSignal = 'PRE_SIGNAL'; 
    } else {
        signal = 'WAIT';
        subSignal = 'WATCHLIST'; 
    }

    const currPrice = current.close;
    let stopLoss, target;

    if (dominantDir === 'LONG') {
        stopLoss = sweeps.sweepBull ? (current.low - (atr * 0.2)) : (orderBlk.obBull ? Math.min(orderBlk.obBull.bottom, cgProxies.longLiq) : cgProxies.longLiq);
        target = cgProxies.shortLiq > currPrice ? cgProxies.shortLiq : currPrice + (atr * 2);
    } else {
        stopLoss = sweeps.sweepBear ? (current.high + (atr * 0.2)) : (orderBlk.obBear ? Math.max(orderBlk.obBear.top, cgProxies.shortLiq) : cgProxies.shortLiq);
        target = cgProxies.longLiq < currPrice ? cgProxies.longLiq : currPrice - (atr * 2);
    }

    let aiNote = '', exitAdvice = 'NEUTRAL', actionColor = 'var(--text-secondary)';
    const userPos = userPositions[sym];
    const isShock = MacroEnvironment.globalRiskStatus === 'SHOCK' && tf.agg > 60; 

    if (userPos) {
        const entry = userPos.entry, type = userPos.type || 'BUY', lev = userPos.leverage || 1;
        const pnl = type === 'SELL' ? ((entry - currPrice) / entry) * 100 * lev : ((currPrice - entry) / entry) * 100 * lev;
        const pnlStr = pnl >= 0 ? `<span style="color:var(--binance-green)">+${pnl.toFixed(2)}%</span>` : `<span style="color:var(--binance-red)">${pnl.toFixed(2)}%</span>`;

        const riskBreached = (type === 'BUY' && currPrice < stopLoss) || (type === 'SELL' && currPrice > stopLoss);

        if (type === 'BUY') {
            if (signal === 'SELL' && subSignal === 'HIGH_CONFIDENCE') { exitAdvice = 'EMERGENCY CLOSE'; actionColor = 'var(--danger)'; } 
            else if (riskBreached || pnl < -15 * lev) { exitAdvice = 'CUT LOSS'; actionColor = 'var(--danger)'; } 
            else if (currPrice >= target) { exitAdvice = adx > 35 ? 'TRAILING STOP (MOMENTUM)' : 'TAKE PROFIT SEKARANG'; actionColor = 'var(--accent)'; } 
            else { exitAdvice = 'HOLD POSITION'; actionColor = 'var(--quantum-cyan)'; }
        } else {
            if (signal === 'BUY' && subSignal === 'HIGH_CONFIDENCE') { exitAdvice = 'EMERGENCY CLOSE'; actionColor = 'var(--danger)'; } 
            else if (riskBreached || pnl < -15 * lev) { exitAdvice = 'CUT LOSS'; actionColor = 'var(--danger)'; } 
            else if (currPrice <= target) { exitAdvice = adx > 35 ? 'TRAILING STOP (MOMENTUM)' : 'TAKE PROFIT SEKARANG'; actionColor = 'var(--accent)'; } 
            else { exitAdvice = 'HOLD POSITION'; actionColor = 'var(--quantum-cyan)'; }
        }

        const labelMod = userPos.isAuto ? '<span style="background:var(--quantum-cyan); color:#000; padding:2px 4px; border-radius:2px; font-size:9px; margin-right:4px;">AUTO</span>' : '';

        aiNote = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                <span style="background:rgba(255, 255, 255, 0.1); color:var(--text-primary); padding:3px 6px; border-radius:4px; font-weight:bold; border: 1px solid var(--text-secondary);">${labelMod} 🔒 AKTIF</span>
                <span style="font-family:'JetBrains Mono', monospace; font-size:11px; color:var(--quantum-cyan); font-weight:700;">ROE: ${pnlStr}</span>
            </div>
            <div style="font-size:12px; margin-bottom:4px; color:var(--text-primary); line-height:1.4;">Eksekusi: <b style="color:${actionColor}">${exitAdvice}</b></div>
            <div class="audit-section" style="margin-top: 8px;">
                <div class="audit-title" style="color:${actionColor}">ANALISIS POSISI</div>
                <div style="font-size:11px; color:var(--text-primary); line-height:1.5; margin-top:2px;">Matriks mendukung arah Anda. Abaikan fluktuasi minor, perhatikan level dinamis.</div>
            </div>`;
    } else {
        let badgeTxt = '⏳ WATCHLIST', badgeClass = 'var(--text-secondary)';
        if (signal === 'BUY') { badgeTxt = subSignal === 'HIGH_CONFIDENCE' ? '🟢 STRONG BUY' : '🟢 BUY EXECUTE'; badgeClass = 'var(--binance-green)'; }
        else if (signal === 'SELL') { badgeTxt = subSignal === 'HIGH_CONFIDENCE' ? '🔴 STRONG SHORT' : '🔴 SHORT EXECUTE'; badgeClass = 'var(--binance-red)'; }
        else if (subSignal === 'PRE_SIGNAL') { badgeTxt = dominantDir === 'LONG' ? '⚡ PRE-BUY (EARLY)' : '⚡ PRE-SHORT (EARLY)'; badgeClass = 'var(--warning)'; }

        const factorHtml = activeFactors.slice(0,4).map(f => `<div class="factor-item"><span class="factor-icon">▰</span><span>${f}</span></div>`).join('');
        
        aiNote = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                <span style="background:rgba(255,255,255,0.05); color:${badgeClass}; padding:3px 6px; border-radius:4px; font-weight:bold; border: 1px solid ${badgeClass};">${badgeTxt}</span>
                <span style="font-family:'JetBrains Mono', monospace; font-size:11px; color:${badgeClass}; font-weight:700;">CONF: ${confidence}%</span>
            </div>
            <div style="font-size:10px; color:var(--accent); margin-bottom:6px; font-weight:700; letter-spacing:0.5px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">🎯 Rekomendasi: ${tradeClass}</div>
            <div class="audit-section">
                <div class="audit-title">V3 MATRIX FACTORS</div>
                <div class="factor-list">${factorHtml || '<span style="color:gray; font-size:11px;">Mencari anomali volume...</span>'}</div>
            </div>
            <div class="audit-section" style="margin-top: 4px;">
                <div class="audit-row"><span class="audit-label">Target (Liq Pool)</span><span class="audit-val" style="color:var(--binance-green)">${formatPrecision(target)}</span></div>
                <div class="audit-row"><span class="audit-label">Stop (Dyn OB)</span><span class="audit-val" style="color:var(--binance-red)">${formatPrecision(stopLoss)}</span></div>
                <div class="audit-row" style="margin-top:4px; border-top:1px dashed rgba(255,255,255,0.05); padding-top:6px;">
                    <span class="audit-label" style="font-size:10px;">Status</span>
                    <span class="audit-val" style="font-size:10px; font-weight:normal; color:var(--text-secondary); max-width:65%; text-align:right;">${signal !== 'WAIT' ? 'Eksekusi Valid' : 'Menunggu Pemicu Volatilitas'}</span>
                </div>
            </div>`;
    }

    MTF_MATRIX.set(`${sym}_${tf.label}`, signal);

    const lastState = {
        signal, confidence, subSignal, isShock,
        price: currPrice, volume: current.volume, volDelta: cgProxies.volDelta,
        stopLoss, target, exitAdvice, note: aiNote
    };

    if (isBackground) { updateMatrixUI(sym); return; }
    analysisResults.set(sym, lastState);

    updateCardUI(sym, lastState, tf);
    updateMatrixUI(sym);

    if (typeof AutoEngine !== 'undefined') {
        try { AutoEngine.processSignal(sym, lastState, tf, current.close, atr); } catch(e){}
    }
}