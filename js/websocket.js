/* =========================================
   DATA FETCH & WEB SOCKET
   ========================================= */
const lastCalcTime = new Map();

async function changeTimeframe(tf) {
    CURRENT_TF = tf;
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('active', b.textContent === tf.label));
    document.getElementById('strategyLabel').textContent = `MODE: ${tf.type} (${tf.label})`;
    
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    if (binanceSocket) { binanceSocket.close(); binanceSocket = null; }
    
    for (let i = 0; i < COINS.length; i += 3) {
        const chunk = COINS.slice(i, i + 3);
        await Promise.all(chunk.map(async (sym) => {
            const hist = await fetchHistory(sym, tf.ws, tf.limit); 
            if (hist && hist.length > 0) { 
                marketData.set(sym, hist);
                const cObj = charts.get(sym);
                if (cObj) { 
                    if (cObj.series) { cObj.series.setData(hist); cObj.chart.timeScale().fitContent(); }
                    if (cObj.rsiSeries) {
                        const rsiData = calcRSI(hist, 14).map((val, idx) => ({time: hist[idx].time, value: val}));
                        cObj.rsiSeries.setData(rsiData.filter(d => d.value > 0));
                    }
                    analyzeQuantum(sym, hist, tf, false, true); 
                }
            }
        }));
    }
    connectWebSocket(tf); 
}

function connectWebSocket(tf) {
    if (binanceSocket) { binanceSocket.close(); binanceSocket = null; }
    lastSocketTime = Date.now();
    const streams = COINS.map(s => `${s.toLowerCase()}@kline_${tf.ws}`).join('/');
    
    try {
        binanceSocket = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
        binanceSocket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.data && msg.data.k) {
                const k = msg.data.k;
                const candle = { time: Math.floor(k.t / 1000), open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: parseFloat(k.c), volume: parseFloat(k.v), takerBuy: parseFloat(k.V) };
                lastSocketTime = Date.now();
                handleStream(msg.data.s, candle);
            }
        };
        binanceSocket.onclose = () => setTimeout(() => connectWebSocket(tf), 3000); 
        binanceSocket.onerror = () => startPolling(tf); 
    } catch(e) { startPolling(tf); }
}

function startPolling(tf) {
    if (pollingInterval) clearInterval(pollingInterval);
    lastSocketTime = Date.now();
    pollingInterval = setInterval(() => {
        COINS.forEach((sym, index) => {
            setTimeout(async () => {
                try {
                    const hist = await fetchHistory(sym, tf.ws, 2);
                    if (hist && hist.length > 0) { lastSocketTime = Date.now(); handleStream(sym, hist[hist.length - 1]); }
                } catch (err) {}
            }, index * 100);
        });
    }, 1500); 
}

function handleStream(sym, candle) {
    const arr = marketData.get(sym);
    if (!arr) return;
    const last = arr[arr.length-1];
    
    if (candle.time < last.time) return;
    let isNewCandle = false;
    
    if (candle.time === last.time) { arr[arr.length-1] = candle; } 
    else { arr.push(candle); if (arr.length > 1500) arr.shift(); isNewCandle = true; }
    
    const pEl = document.getElementById(`price-${sym}`);
    if (pEl) {
        const prev = parseFloat(pEl.getAttribute('data-p') || 0);
        if (candle.close !== prev) {
            pEl.textContent = formatPrecision(candle.close);
            pEl.className = `price-main ${candle.close >= prev ? 'c-up' : 'c-down'}`;
            pEl.setAttribute('data-p', candle.close);
        }
    }

    const cObj = charts.get(sym);
    if (cObj && cObj.series) requestAnimationFrame(() => { 
        try { 
            cObj.series.update(candle); 
            if (cObj.rsiSeries) { const rsiArr = calcRSI(arr, 14); cObj.rsiSeries.update({ time: candle.time, value: rsiArr[rsiArr.length-1] }); }
        } catch (e) {} 
    });
    
    const now = Date.now();
    const lastCalc = lastCalcTime.get(sym) || 0;
    const prevCandle = arr.length > 1 ? arr[arr.length-2] : candle;
    const isVolSpike = candle.volume > (prevCandle.volume * 2.0); 
    
    let throttleLimit = 2000;
    if (CURRENT_TF.agg <= 15) {
        throttleLimit = isVolSpike ? 400 : 1200; 
    } else if (CURRENT_TF.agg <= 60) {
        throttleLimit = isVolSpike ? 800 : 2000; 
    }

    if (typeof AutoEngine !== 'undefined') {
        try { AutoEngine.onTick(sym, candle.close); } catch(e){}
    }

    if (isNewCandle || (now - lastCalc) > throttleLimit) {
         lastCalcTime.set(sym, now);
         analyzeQuantum(sym, arr, CURRENT_TF, false, false); 
         if (userPositions[sym]) renderPosBox(sym);
    }
}