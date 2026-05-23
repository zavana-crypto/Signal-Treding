/* =========================================
   CARD GRID & CHART RENDERING
   ========================================= */
function renderGrid() {
    const grid = document.getElementById('grid'); grid.innerHTML = ''; 
    if (!Array.isArray(COINS) || COINS.length === 0) {
        COINS = DEFAULT_COINS.slice();
        localStorage.setItem('zavana_coins_fixed_v6', JSON.stringify(COINS));
    }
    if (COINS.length === 1 && COINS[0] === 'BTCUSDT') {
        COINS = DEFAULT_COINS.slice();
        localStorage.setItem('zavana_coins_fixed_v6', JSON.stringify(COINS));
    }
    COINS.forEach(sym => {
        const s = sym.trim().toUpperCase(); const base = s.replace('USDT','');
        
        // REVISI: Mencegah 404 Console Error pada koin baru hasil Discovery Engine
        const defaultSvg = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjRkNENTM1Ij48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMiIvPjwvc3ZnPg==";
        let icon = defaultSvg;
        
        const isPredefined = PRIORITY_COINS.includes(s) || Object.values(NARRATIVE_MAP).some(list => list.includes(s));
        if (isPredefined) {
            icon = `https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`;
        }
        if (s === "PAXGUSDT") icon = "https://assets.coincap.io/assets/icons/paxg@2x.png";
        if (s === "XAUTUSDT") icon = "https://s2.coinmarketcap.com/static/img/coins/64x64/5186.png"; 
        const isGold = s === "PAXGUSDT" || s === "XAUTUSDT";
         
        const card = document.createElement('div'); card.className = 'card'; card.id = `card-${s}`;
        const tfDots = TIMEFRAMES.map(t => `<div id="mtx-${s}-${t.label}" class="m-dot" title="Switch to ${t.label}" onclick="quickSwitchTF('${t.label}')"></div>`).join('');

        card.innerHTML = `
            <div class="sniper-tag" id="tag-${s}">INIT...</div>
            <div class="card-header">
                <div class="coin-meta">
                    <img src="${icon}" class="coin-icon" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjRkNENTM1Ij48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMiIvPjwvc3ZnPg=='">
                    <div>
                        <div class="coin-title" style="${isGold ? 'color:var(--gold)' : ''}">${base}/USDT</div>
                        <div class="coin-vol">Vol: <span id="vol-${s}">--</span> | Flow: <span id="delta-${s}" style="font-weight: bold;">--</span></div>
                    </div>
                </div>
                <div class="price-meta"><div class="price-main" id="price-${s}">---</div><div class="price-change" id="chg-${s}">--%</div></div>
            </div>
            <div class="matrix-strip">${tfDots}</div>
            <div class="chart-container">
                <div id="chart-${s}" style="position:relative; width:100%; height:260px;"></div>
                <div id="visual-${s}" class="visual-arrow">➤</div>
                <div id="msg-${s}" class="visual-msg">KALKULASI QUANTITATIVE DATA...</div>
            </div>
            <div class="pos-tracker-box">
                <div class="pos-title"><span style="font-size:14px; margin-top:-2px;">🎯</span> BINANCE FUTURES MARGIN TRACKER</div>
                <div id="pos-tracker-content-${s}"></div>
            </div>
            <div class="data-row">
                <div class="data-item"><span class="d-label">Dynamic Sup / OB </span><span class="d-val" id="sl-${s}">--</span></div>
                <div class="data-item" style="text-align:right;"><span class="d-label">Dynamic Res / OB </span><span class="d-val" id="tp-${s}">--</span></div>
            </div>
            <div class="signal-box">
                <div class="sig-header">
                    <div id="sig-dir-${s}" class="sig-dir wait">⏳ STANDBY</div>
                    <div class="sig-conf">Win Prob: <span id="sig-conf-${s}">--%</span></div>
                </div>
                <div class="sig-params">
                    <div class="sig-param-item"><span>Entry Price</span><b id="sig-entry-${s}">--</b></div>
                    <div class="sig-param-item"><span>Take Profit</span><b id="sig-tp-param-${s}" class="c-up">--</b></div>
                    <div class="sig-param-item"><span>Stop Loss</span><b id="sig-sl-param-${s}" class="c-down">--</b></div>
                </div>
            </div>
            <div class="market-note-box">
                <div class="log-header"><div class="ping"></div>HFT QUANT LOG v3.0</div>
                <div id="note-${s}" style="width:100%; margin-top:4px;"><span style="color:var(--text-secondary); font-size:11px;">Sinkronisasi data awal...</span></div>
            </div>
        `;
        grid.appendChild(card);
        
        const cont = document.getElementById(`chart-${s}`);
        if (!cont) {
            console.warn(`Chart container not found for ${s}`);
            return;
        }
        const ChartLib = window.LightweightCharts || window.lightweightCharts;
        if (!ChartLib || typeof ChartLib.createChart !== 'function') {
            console.error('LightweightCharts library is not loaded. Provider internet mungkin memblokir CDN.');
            cont.innerHTML = '<div style="color:var(--danger); padding:20px; font-weight:bold; text-align:center; margin-top:50px;">Gagal Memuat Grafik.<br>Library diblokir oleh provider internet (unpkg).<br>Harap update CDN di index.html menjadi jsDelivr.</div>';
            return;
        }

        // REVISI: Mengamankan dimensi chart awal jika browser lambat melakukan render
        const rect = cont.getBoundingClientRect();
        const initWidth = rect.width > 0 ? rect.width : (cont.parentElement ? cont.parentElement.clientWidth : 340) || 340;
        const initHeight = rect.height > 0 ? rect.height : 260;

        const chart = ChartLib.createChart(cont, {
            width: initWidth,
            height: initHeight,
            layout: { background: { type: 'solid', color: '#0b0e11' }, textColor: '#848e9c', fontSize: 11, fontFamily: 'JetBrains Mono' }, 
            grid: { vertLines: { color: '#1e2329', style: 2 }, horzLines: { color: '#1e2329', style: 2 } },
            rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
            timeScale: { visible: false, borderVisible: false }, 
            crosshair: { mode: ChartLib.CrosshairMode?.Normal || 0, vertLine: { width: 1, color: '#474d57', style: ChartLib.LineStyle?.Dashed || 0 }, horzLine: { width: 1, color: '#474d57', style: ChartLib.LineStyle?.Dashed || 0 } },
            localization: { priceFormatter: price => formatPrecision(price) }
        });
        
        const hasLineSeries = typeof chart.addLineSeries === 'function';
        const series = typeof chart.addCandlestickSeries === 'function'
            ? chart.addCandlestickSeries({ upColor: isGold ? '#FFD700' : '#0ECB81', downColor: '#F6465D', borderVisible: false, wickVisible: true })
            : (hasLineSeries ? chart.addLineSeries({ color: isGold ? '#FFD700' : '#0ECB81', lineWidth: 2 }) : null);

        const liqHighSeries = [];
        const liqLowSeries = [];
        if (hasLineSeries) {
            for (let i = 0; i < 5; i++) {
                liqHighSeries.push(chart.addLineSeries({ color: 'rgba(246, 70, 93, 0.4)', lineWidth: 2, lineStyle: ChartLib.LineStyle?.Solid || 0, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false }));
                liqLowSeries.push(chart.addLineSeries({ color: 'rgba(8, 153, 129, 0.4)', lineWidth: 2, lineStyle: ChartLib.LineStyle?.Solid || 0, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false }));
            }
        }

        const ema50Series = hasLineSeries ? chart.addLineSeries({ color: 'rgba(255, 165, 0, 0.8)', lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false }) : null;
        const ema200Series = hasLineSeries ? chart.addLineSeries({ color: 'rgba(41, 98, 255, 0.8)', lineWidth: 2, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false }) : null;
        const vwapSeries = hasLineSeries ? chart.addLineSeries({ color: 'rgba(128, 0, 128, 0.6)', lineWidth: 1, lineStyle: ChartLib.LineStyle?.Dashed || 0, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false }) : null;
        
        // REVISI: Sangat krusial jika library yang termuat adalah versi 3.x agar chart tidak menjadi 0x0
        new ResizeObserver(e => { 
            if(e[0]) {
                const w = e[0].contentRect.width;
                const h = e[0].contentRect.height;
                if (w > 0 && h > 0) chart.applyOptions({ width: w, height: h });
            }
        }).observe(cont);
        
        charts.set(s, { chart, series, liqLowSeries, liqHighSeries, ema50Series, ema200Series, vwapSeries });
        marketData.set(s, []); renderPosBox(s);
    });
}