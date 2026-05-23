/* =========================================
   UI & NAVIGATION & UPDATERS
   ========================================= */
window.showPage = function(pageId, el) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    if (el && el.classList.contains('nav-link')) el.classList.add('active');
    document.querySelectorAll('.mobile-nav-item').forEach(n => n.classList.remove('active'));
    if (el && el.classList.contains('mobile-nav-item')) el.classList.add('active');
    
    // REVISI: Memaksa resize window agar canvas chart merender ulang secara responsif
    if (pageId === 'dashboard') {
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    }

    if (pageId === 'screener') updateScreenerTable();
    if (pageId === 'report') renderReportDashboard();
};

window.quickSwitchTF = function(label) {
    const tf = TIMEFRAMES.find(t => t.label === label);
    if (tf) { changeTimeframe(tf); showToast(`Disinkronisasi ke: ${tf.label}`); }
};

window.initAudioContext = function() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        showToast('Audio Module Diaktifkan');
        const btn = document.getElementById('audioInitBtn');
        if (btn) { btn.classList.remove('needed'); btn.innerHTML = '🔊 AUDIO ON'; }
    }
};

window.toggleWakeLock = async function() {
    try {
        if (!wakeLock) {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
                showToast('⚡ Layar Tetap Menyala (Wake Lock Aktif)');
                document.querySelector('.wakelock-btn').classList.add('active');
            }
        } else {
            wakeLock.release(); wakeLock = null;
            showToast('Layar Normal (Wake Lock Nonaktif)');
            document.querySelector('.wakelock-btn').classList.remove('active');
        }
    } catch (err) {}
};

function updateHealthMonitor() {
    const now = Date.now(); const diff = now - lastSocketTime;
    const dot = document.getElementById('healthDot'); const txt = document.getElementById('healthText');
    if (diff > 10000) {
        dot.className = 'health-dot bad'; txt.textContent = `SYNC: Terputus...`; txt.style.color = 'var(--danger)';
    } else {
        dot.className = 'health-dot ok'; txt.textContent = binanceSocket ? `SYNC: WEBSOCKET LIVE (0ms)` : `SYNC: FAST POLLING (1s)`; txt.style.color = 'var(--binance-green)';
    }
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = message;
    container.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 4000);
}

function renderToolbar() {
    const bar = document.getElementById('tfToolbar'); bar.innerHTML = '';
    TIMEFRAMES.forEach(tf => {
        const btn = document.createElement('button');
        btn.className = `tf-btn ${tf.label === CURRENT_TF.label ? 'active' : ''}`;
        btn.textContent = tf.label; btn.onclick = () => changeTimeframe(tf);
        bar.appendChild(btn);
    });
}

function renderPosBox(sym) {
    const posBox = document.getElementById(`pos-tracker-content-${sym}`);
    if (!posBox) return;
    const pos = userPositions[sym];
    const currentPrice = analysisResults.get(sym)?.price || pos?.entry || 0;
    if (pos) {
        let pnl = 0;
        let roi = 0;
        if (currentPrice > 0) {
            pnl = pos.type === 'SELL' ? (pos.entry - currentPrice) * (pos.size || 0) : (currentPrice - pos.entry) * (pos.size || 0);
            if (pos.marginUsd) roi = (pnl / pos.marginUsd) * 100;
            else roi = pos.type === 'SELL' ? ((pos.entry - currentPrice) / pos.entry) * 100 * (pos.leverage || 1) : ((currentPrice - pos.entry) / pos.entry) * 100 * (pos.leverage || 1);
        }
        const pnlClass = roi >= 0 ? 'profit' : 'loss';
        const pnlSign = roi >= 0 ? '+' : '';
        const typeColor = pos.type === 'SELL' ? 'var(--binance-red)' : 'var(--binance-green)';
        
        const labelMod = pos.isAuto ? '<span style="background:var(--quantum-cyan); color:#000; padding:2px 4px; border-radius:2px; font-size:9px; font-weight:bold;">AUTO</span>' : '<span style="background:#474d57; color:#fff; padding:2px 4px; border-radius:2px; font-size:9px; font-weight:bold;">MANUAL</span>';
        
        const sizeVal = pos.size ? pos.size.toFixed(4) : '--';
        const pnlUsd = pos.isAuto ? `${pnlSign}${pnl.toFixed(2)} USDT` : ''; 

        posBox.innerHTML = `
            <div class="pos-active-state show" style="flex-direction:column; align-items:stretch;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid #2b3139; padding-bottom:8px;">
                    <span style="font-size:11px; color:var(--text-secondary); font-weight:bold;">${labelMod} <span style="color:${typeColor}">${pos.type === 'SELL' ? 'SHORT' : 'LONG'}</span> • <span style="color:var(--text-primary);">${(pos.margin || 'Cross').toUpperCase()} ${(pos.leverage || 20)}x</span></span>
                    <button class="btn-pos clear" style="padding:0 8px; height: 24px; font-size:10px; flex:none;" onclick="clearPos('${sym}')">TUTUP</button>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <div style="display:flex; flex-direction:column;"><span style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;">Size / Entry Price</span>
                    <span style="color:var(--text-primary); font-family:'JetBrains Mono', monospace; font-size:11px;">${sizeVal} @ <b>${formatPrecision(pos.entry)}</b></span></div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end;"><span style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;">ROE (PNL)</span>
                    <span class="pnl-val ${pnlClass}">${pnlSign}${roi.toFixed(2)}% <br><span style="font-size:10px; color:var(--text-secondary)">${pnlUsd}</span></span></div>
                </div>
            </div>`;
    } else {
        posBox.innerHTML = `
            <div class="tracker-row">
                <div class="tracker-col-left"><select id="pos-margin-${sym}" class="tracker-input"><option value="Cross">Cross</option><option value="Isolated">Isolated</option></select></div>
                <div class="tracker-col-right"><input type="number" id="pos-lev-${sym}" class="tracker-input with-suffix" value="20" min="1" max="125"><span class="tracker-suffix">x</span></div>
            </div>
            <div class="tracker-row">
                <div class="tracker-col-left"><select id="pos-type-${sym}" class="tracker-input" onchange="toggleOrderInput('${sym}')"><option value="MARKET">Market</option><option value="LIMIT">Limit</option></select></div>
                <div class="tracker-col-right"><input type="number" id="pos-entry-input-${sym}" class="tracker-input" placeholder="Otomatis Market" disabled=""></div>
            </div>
            <div class="tracker-row" style="margin-bottom: 0;">
                <button class="btn-pos" style="background:rgba(14,203,129,0.1); color:var(--binance-green); border-color:var(--binance-green);" onclick="setPos('${sym}', 'BUY')">OPEN LONG</button>
                <button class="btn-pos" style="background:rgba(246,70,93,0.1); color:var(--binance-red); border-color:var(--binance-red);" onclick="setPos('${sym}', 'SELL')">OPEN SHORT</button>
            </div>`;
    }
}

function updateCardUI(sym, res, tf) {
    const card = document.getElementById(`card-${sym}`);
    if (!card) return;
    const msgEl = document.getElementById(`msg-${sym}`), visualEl = document.getElementById(`visual-${sym}`);
    
    const noteBoxEl = card.querySelector('.market-note-box');
    if (noteBoxEl) noteBoxEl.innerHTML = `<div class="log-header"><div class="ping"></div>HFT QUANT LOG v3.0</div><div style="width:100%; margin-top:4px;">${res.note}</div>`;
    
    const volEl = document.getElementById(`vol-${sym}`), deltaEl = document.getElementById(`delta-${sym}`);
    if (volEl) volEl.textContent = (res.volume || 0).toLocaleString(undefined, {maximumFractionDigits: 0});
    if (deltaEl) {
        deltaEl.textContent = res.volDelta > 0 ? '+ BUYER INFLOW' : (res.volDelta < 0 ? '- SELLER DOMINANCE' : 'NEUTRAL');
        deltaEl.style.color = res.volDelta > 0 ? 'var(--binance-green)' : (res.volDelta < 0 ? 'var(--binance-red)' : 'var(--text-secondary)');
    }

    card.classList.remove('fomo-mode', 'sniper-mode', 'whale-mode');
    let tag = card.querySelector('.sniper-tag');
    if (tag) tag.className = 'sniper-tag';
    if (visualEl) { visualEl.className = 'visual-arrow'; visualEl.textContent = '➤'; }

    const hasPos = userPositions[sym];

    if (res.isShock && !hasPos) {
        if (tag) { tag.textContent = '⚠️ MACRO RISK'; tag.style.background = '#2b3139'; tag.style.color = '#fff'; }
        if (msgEl) { msgEl.textContent = `MENUNGGU REDA.`; msgEl.style.color = 'var(--text-secondary)'; }
        if (visualEl) { visualEl.textContent = '🛑'; visualEl.className = 'visual-arrow prep'; }
        card.classList.add('fomo-mode');
    } else if (res.signal === 'BUY') {
        if (tag) { tag.textContent = res.subSignal === 'HIGH_CONFIDENCE' ? '🔥 HIGH PROB BUY' : 'BUY EXECUTE'; tag.style.background = 'var(--binance-green)'; tag.style.color = '#fff'; }
        if (msgEl) { msgEl.textContent = `INSTITUTIONAL ACCUMULATION`; msgEl.style.color = 'var(--text-primary)'; }
        if (visualEl) { visualEl.textContent = '▲'; visualEl.className = 'visual-arrow buy'; }
        card.classList.add('sniper-mode');
    } else if (res.signal === 'SELL') {
        if (tag) { tag.textContent = res.subSignal === 'HIGH_CONFIDENCE' ? '🔥 HIGH PROB SHORT' : 'SELL EXECUTE'; tag.style.background = 'var(--binance-red)'; tag.style.color = '#fff'; }
        if (msgEl) { msgEl.textContent = `INSTITUTIONAL DISTRIBUTION`; msgEl.style.color = 'var(--text-primary)'; }
        if (visualEl) { visualEl.textContent = '▼'; visualEl.className = 'visual-arrow sell'; }
        card.classList.add('sniper-mode');
    } else {
        if (hasPos) {
            if (tag) { tag.textContent = hasPos.isAuto ? 'AUTO POSISI AKTIF 🔒' : 'POSISI AKTIF 🔒'; tag.style.background = hasPos.isAuto ? 'var(--quantum-cyan)' : '#1e2329'; tag.style.color = hasPos.isAuto ? '#000' : 'var(--text-primary)'; }
            if (msgEl) { msgEl.textContent = `MANAJEMEN RISIKO AKTIF`; msgEl.style.color = 'var(--text-secondary)'; }
            card.classList.add('whale-mode');
        } else {
            if (tag) { tag.textContent = res.subSignal === 'PRE_SIGNAL' ? '⚡ EARLY WARNING' : 'MENCARI MOMENTUM'; tag.style.background = res.subSignal === 'PRE_SIGNAL' ? 'var(--warning)' : '#2b3139'; tag.style.color = res.subSignal === 'PRE_SIGNAL' ? '#000' : 'var(--text-secondary)'; }
            if (msgEl) { msgEl.textContent = res.subSignal === 'PRE_SIGNAL' ? `PRE-SIGNAL TERDETEKSI...` : `ANALISIS ORDER BLOCK & VOLUME...`; msgEl.style.color = res.subSignal === 'PRE_SIGNAL' ? 'var(--warning)' : 'var(--text-secondary)'; }
            if (visualEl && res.subSignal === 'PRE_SIGNAL') { visualEl.textContent = '⚡'; visualEl.className = 'visual-arrow warn'; }
        }
    }
    
    const tpEl = document.getElementById(`tp-${sym}`), slEl = document.getElementById(`sl-${sym}`);
    if (tpEl) tpEl.textContent = formatPrecision(res.target);
    if (slEl) slEl.textContent = formatPrecision(res.stopLoss);

    const sigDirEl = document.getElementById(`sig-dir-${sym}`), sigConfEl = document.getElementById(`sig-conf-${sym}`), sigEntryEl = document.getElementById(`sig-entry-${sym}`), sigTpEl = document.getElementById(`sig-tp-param-${sym}`), sigSlEl = document.getElementById(`sig-sl-param-${sym}`);

    if (sigDirEl) {
        sigDirEl.className = 'sig-dir';
        if (res.signal === 'BUY') { sigDirEl.classList.add('buy'); sigDirEl.innerHTML = `🟢 LONG`; } 
        else if (res.signal === 'SELL') { sigDirEl.classList.add('sell'); sigDirEl.innerHTML = `🔴 SHORT`; } 
        else if (res.subSignal === 'PRE_SIGNAL') { sigDirEl.classList.add('warn'); sigDirEl.innerHTML = `⚡ PRE-SIGNAL`; }
        else { sigDirEl.classList.add('wait'); sigDirEl.innerHTML = `⏳ STANDBY`; }
    }
    if (sigConfEl) sigConfEl.textContent = `${res.confidence || 0}%`;
    if (sigEntryEl) sigEntryEl.textContent = formatPrecision(res.price);
    if (sigTpEl) sigTpEl.textContent = formatPrecision(res.target);
    if (sigSlEl) sigSlEl.textContent = formatPrecision(res.stopLoss);
}

function updateMatrixUI(sym) {
    TIMEFRAMES.forEach(tf => {
        const el = document.getElementById(`mtx-${sym}-${tf.label}`);
        if (el) {
            const sig = MTF_MATRIX.get(`${sym}_${tf.label}`) || 'WAIT';
            el.className = 'm-dot';
            if (sig === 'BUY') el.classList.add('bull'); else if (sig === 'SELL') el.classList.add('bear');
            if (tf.label === CURRENT_TF.label) el.classList.add('active');
        }
    });
}

function startMatrixScanner() {
    let coinIdx = 0, tfIdx = 0;
    setInterval(async () => {
        if (COINS.length === 0) return;
        const sym = COINS[coinIdx]; const tf = TIMEFRAMES[tfIdx];
        if (tf.label !== CURRENT_TF.label) {
            try { const hist = await fetchHistory(sym, tf.ws, 100); if (hist.length > 50) analyzeQuantum(sym, hist, tf, true, false); } catch(e) {}
        }
        tfIdx++; if (tfIdx >= TIMEFRAMES.length) { tfIdx = 0; coinIdx++; if (coinIdx >= COINS.length) coinIdx = 0; }
    }, 5000); 
}

function updateDynamicMarketAnalysis() {
    const el = document.getElementById('dynamicMarketAnalysis'); if (!el) return;
    const btcData = analysisResults.get('BTCUSDT'); if (!btcData) return;
    
    el.innerHTML = `
        <div class="ai-col">
            <h4>📰 MACRO STATE V3</h4>
            <div class="ai-item">Arah Macro (BTC Proxy): <b style="color: ${MacroEnvironment.btcTrendDir === 1 ? 'var(--binance-green)' : 'var(--binance-red)'}">${MacroEnvironment.btcTrendDir === 1 ? 'BULLISH' : (MacroEnvironment.btcTrendDir === -1 ? 'BEARISH' : 'NEUTRAL')}</b></div>
            <div class="ai-item">Status Risiko: <b>${MacroEnvironment.globalRiskStatus}</b></div>
            <div class="ai-item ai-divider">Sistem: <b>Memantau ${Object.keys(userPositions).length} Posisi Aktif.</b></div>
        </div>
        <div class="ai-col">
            <h4>📊 COINGLASS PROXY</h4>
            <div class="proyeksi-row"><span class="proyeksi-label">Liq Pool Atas</span><div class="proyeksi-val"><span class="proyeksi-price up">${formatPrecision(btcData.target || 0)}</span></div></div>
            <div class="proyeksi-row"><span class="proyeksi-label">Liq Pool Bawah</span><div class="proyeksi-val"><span class="proyeksi-price down">${formatPrecision(btcData.stopLoss || 0)}</span></div></div>
        </div>
        <div class="ai-col">
            <h4>🎯 STRATEGY ADVICE</h4>
            <div class="ai-item" style="color:var(--accent);">Mesin HFT v3.0 siap. Auto-Trading dapat mengelola SL berbasis (ATR) & Compounding secara dinamis.</div>
        </div>
    `;
}

window.renderReportDashboard = function() {
    const filter = document.getElementById('reportTimeFilter')?.value || 'all';
    const equity = AutoEngine.state.equity || 0;
    const available = AutoEngine.state.availableBalance || 0;
    const used = AutoEngine.state.usedMargin || 0;
    const unrealized = AutoEngine.state.unrealizedPnl || 0;
    const marginRatio = used > 0 ? `${((used / equity) * 100).toFixed(1)}%` : '0.0%';
    const totalTrades = AutoEngine.state.metrics.totalTrades || 0;
    const winRate = totalTrades ? ((AutoEngine.state.metrics.winningTrades / totalTrades) * 100).toFixed(1) : '0.0';
    const realized = (AutoEngine.state.metrics.totalProfitUsd || 0) - (AutoEngine.state.metrics.totalLossUsd || 0);

    document.getElementById('repEquity').textContent = formatPrecision(equity);
    document.getElementById('repAvailBalance').textContent = formatPrecision(available);
    document.getElementById('repUsedMargin').textContent = formatPrecision(used);
    document.getElementById('repUnrealizedPnl').textContent = `${unrealized >= 0 ? '+' : ''}${formatPrecision(unrealized)}`;
    document.getElementById('repMarginRatio').textContent = marginRatio;
    document.getElementById('repRealizedPnl').textContent = `${realized >= 0 ? '+' : ''}${formatPrecision(realized)}`;
    document.getElementById('repWinRate').textContent = `${winRate}%`;
    document.getElementById('repTotalTrades').textContent = totalTrades;

    document.getElementById('allocScalpPct').textContent = `${AutoEngine.state.allocated.scalp}%`;
    document.getElementById('allocIntradayPct').textContent = `${AutoEngine.state.allocated.intraday}%`;
    document.getElementById('allocSwingPct').textContent = `${AutoEngine.state.allocated.swing}%`;
    document.getElementById('allocHoldPct').textContent = `${AutoEngine.state.allocated.hold}%`;
    document.getElementById('allocBarScalp').style.width = `${AutoEngine.state.allocated.scalp}%`;
    document.getElementById('allocBarIntraday').style.width = `${AutoEngine.state.allocated.intraday}%`;
    document.getElementById('allocBarSwing').style.width = `${AutoEngine.state.allocated.swing}%`;
    document.getElementById('allocBarHold').style.width = `${AutoEngine.state.allocated.hold}%`;

    const activeBody = document.getElementById('activePositionsTable');
    const historyBody = document.getElementById('historyTable');
    if (activeBody) {
        let activeHtml = '';
        Object.keys(userPositions).forEach(sym => {
            const pos = userPositions[sym];
            if (!pos) return;
            const mark = pos.markPrice || analysisResults.get(sym)?.price || pos.entry;
            const pnl = pos.type === 'SELL' ? (pos.entry - mark) * pos.size : (mark - pos.entry) * pos.size;
            const marginPct = pos.marginUsd ? `${((pos.marginUsd / equity) * 100).toFixed(2)}%` : '0.00%';
            activeHtml += `
                <tr>
                    <td>${sym}</td>
                    <td>${formatPrecision(pos.size)} ${pos.type === 'SELL' ? 'SELL' : 'BUY'}</td>
                    <td>${formatPrecision(pos.entry)}</td>
                    <td>${formatPrecision(mark)}</td>
                    <td>${pos.liquidation || 'N/A'}</td>
                    <td>${marginPct}</td>
                    <td>${formatPrecision(pos.marginUsd || 0)}</td>
                    <td class="${pnl >= 0 ? 'profit' : 'loss'}">${pnl >= 0 ? '+' : ''}${formatPrecision(pnl)}</td>
                    <td><button class="btn-pos clear" onclick="clearPos('${sym}')">CLOSE</button></td>
                </tr>`;
        });
        activeBody.innerHTML = activeHtml || `<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);">Tidak ada posisi aktif.</td></tr>`;
    }

    const now = Date.now();
    const filteredHistory = AutoEngine.state.history.filter(item => {
        if (filter === 'all') return true;
        const days = parseInt(filter, 10);
        if (isNaN(days)) return true;
        const ts = new Date(item.time).getTime();
        return !isNaN(ts) && ts >= now - days * 24 * 60 * 60 * 1000;
    });

    if (historyBody) {
        let historyHtml = '';
        filteredHistory.slice(-30).reverse().forEach(item => {
            historyHtml += `
                <tr>
                    <td>${item.time}</td>
                    <td>${item.sym}</td>
                    <td>${item.type}</td>
                    <td>${item.leverage || 'N/A'}x</td>
                    <td>${formatPrecision(item.entry)}</td>
                    <td>${formatPrecision(item.exit)}</td>
                    <td class="${item.pnlUsd >= 0 ? 'profit' : 'loss'}">${item.pnlUsd >= 0 ? '+' : ''}${formatPrecision(item.pnlUsd)}</td>
                    <td>${item.reason || 'Auto/Signal'}</td>
                </tr>`;
        });
        historyBody.innerHTML = historyHtml || `<tr><td colspan="8" style="text-align:center;color:var(--text-secondary);">Riwayat perdagangan belum tersedia.</td></tr>`;
    }
}

function initSettingsForm() { 
    document.getElementById('coinInput').value = COINS.join(', '); 
    document.getElementById('geminiApiKey').value = localStorage.getItem('zavana_gemini_key') || ""; 
    document.getElementById('webhookUrl').value = localStorage.getItem('zavana_webhook_url') || ""; 
    document.getElementById('webhookSecret').value = localStorage.getItem('zavana_webhook_secret') || ""; 
}

window.saveSettings = function() {
    try {
        const inputKey = document.getElementById('geminiApiKey').value.trim();
        const webhookUrl = document.getElementById('webhookUrl').value.trim();
        const webhookSecret = document.getElementById('webhookSecret').value.trim();
        
        if (inputKey) localStorage.setItem('zavana_gemini_key', inputKey); else localStorage.removeItem('zavana_gemini_key');
        if (webhookUrl) localStorage.setItem('zavana_webhook_url', webhookUrl); else localStorage.removeItem('zavana_webhook_url');
        if (webhookSecret) localStorage.setItem('zavana_webhook_secret', webhookSecret); else localStorage.removeItem('zavana_webhook_secret');

        const raw = document.getElementById('coinInput').value;
        const newCoins = raw.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
        if (JSON.stringify(COINS) !== JSON.stringify(newCoins)) {
            COINS = newCoins; localStorage.setItem('zavana_coins_fixed_v6', JSON.stringify(COINS));
            showToast("✅ Konfigurasi tersimpan! Memuat ulang..."); setTimeout(() => location.reload(), 1500);
        } else showToast("✅ API Key disimpan!");
    } catch(e) { showToast("❌ Gagal menyimpan."); }
};

function updateScreenerTable() {
    const tbody = document.getElementById('screenerTable');
    if (!document.getElementById('page-screener').classList.contains('active')) return;
    let html = '';
    COINS.forEach(sym => {
        const res = analysisResults.get(sym) || {};
        let flowHtml = res.volDelta > 0 ? `<span style="background:var(--binance-green); color:white; padding:2px 6px; border-radius:4px;">BUYER</span>` : `<span style="background:var(--binance-red); color:white; padding:2px 6px; border-radius:4px;">SELLER</span>`;
        html += `
            <tr style="border-bottom:1px solid var(--border);">
                <td><b style="color:var(--text-primary);">${sym.replace('USDT','')}</b></td>
                <td style="font-family:'JetBrains Mono', monospace;">${res.price ? formatPrecision(res.price) : '---'}</td>
                <td style="font-size:11px; font-weight:700; color:${res.signal === 'BUY' ? 'var(--binance-green)' : res.signal === 'SELL' ? 'var(--binance-red)' : (res.subSignal === 'PRE_SIGNAL' ? 'var(--warning)' : 'var(--text-secondary)')}">${res.subSignal || 'WAIT'}</td>
                <td>${res.confidence ? `<b style="color:${res.confidence>=60 ? 'var(--binance-green)' : 'var(--text-primary)'};">${res.confidence}%</b>` : '--'}</td>
                <td>${flowHtml}</td>
                <td style="font-size:11px;">${res.exitAdvice || '--'}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

let isChatOpen = false;
function toggleChat(forceOpen = null) {
    isChatOpen = forceOpen !== null ? forceOpen : !isChatOpen;
    document.getElementById('ai-chat-window').classList.toggle('open', isChatOpen);
}

(function() { if (localStorage.getItem('zavana_gemini_key')) { var el = document.getElementById('zavana-setup-overlay'); if (el) el.classList.add('hidden'); } })();
window.zavanaSetupSave = function() {
    var key = document.getElementById('zavana-setup-key-input').value.trim();
    if (!key) { alert('Masukkan API Key terlebih dahulu.'); return; }
    localStorage.setItem('zavana_gemini_key', key);
    document.getElementById('zavana-setup-overlay').classList.add('hidden');
    if (typeof showToast === 'function') showToast('✅ API Key tersimpan!');
};
window.zavanaSetupSkip = function() { document.getElementById('zavana-setup-overlay').classList.add('hidden'); };

async function generateMarketBriefing() {
    const key = localStorage.getItem('zavana_gemini_key') || "";
    const box = document.getElementById('ai-briefing-box');
    const cont = document.getElementById('ai-briefing-content');
    box.className = "show";
    cont.textContent = "Sedang menganalisis kondisi pasar global...";

    if(!key) {
        cont.innerHTML = `<span style="color:var(--danger)">Gemini API Key belum dikonfigurasi di Pengaturan atau modal setup awal.</span>`;
        return;
    }

    const prompt = `Anda adalah Portfolio Quant Manager. Analisis pasar saat ini berdasarkan watchlist: ${COINS.join(', ')}. Trend BTC saat ini adalah ${MacroEnvironment.btcTrendDir === 1 ? 'Bullish' : 'Bearish'}. Berikan instruksi taktis tentang alokasi modal dan manajemen risiko berbasis compounding dalam Bahasa Indonesia maksimal 4 kalimat.`;
    
    try {
        // REVISI: Memperbarui endpoint ke versi model Gemini standar (1.5 Flash)
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                contents: [{parts: [{text: prompt}]}]
            })
        });
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Gagal mendapatkan respons.";
        cont.textContent = text;
    } catch(e) {
        cont.textContent = "Terjadi kesalahan saat memanggil Gemini API.";
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const query = input.value.trim();
    if(!query) return;

    const chatBody = document.getElementById('chatBody');
    const indicator = document.getElementById('typingIndicator');

    const userMsg = document.createElement('div');
    userMsg.className = 'chat-msg msg-user';
    userMsg.innerHTML = `<p>${query}</p>`;
    chatBody.insertBefore(userMsg, indicator);
    input.value = '';
    chatBody.scrollTop = chatBody.scrollHeight;

    indicator.className = 'typing-indicator show';

    const key = localStorage.getItem('zavana_gemini_key') || "";
    if(!key) {
        setTimeout(() => {
            indicator.className = 'typing-indicator';
            const botMsg = document.createElement('div');
            botMsg.className = 'chat-msg msg-ai';
            botMsg.innerHTML = `<p>Maaf, Gemini API Key belum diset. Harap masukkan kunci API Anda terlebih dahulu.</p>`;
            chatBody.insertBefore(botMsg, indicator);
            chatBody.scrollTop = chatBody.scrollHeight;
        }, 1000);
        return;
    }

    try {
        // REVISI: Memperbarui endpoint ke versi model Gemini standar (1.5 Flash)
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                contents: [{parts: [{text: `Anda adalah ZAVANA Quantum AI v3.0. Jawab pertanyaan pengguna secara taktis berbasis SMC & Order Flow: "${query}"`}]}]
            })
        });
        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, sistem mengalami kendala jaringan.";
        
        indicator.className = 'typing-indicator';
        const botMsg = document.createElement('div');
        botMsg.className = 'chat-msg msg-ai';
        botMsg.innerHTML = `<p>${reply}</p>`;
        chatBody.insertBefore(botMsg, indicator);
        chatBody.scrollTop = chatBody.scrollHeight;
    } catch(e) {
        indicator.className = 'typing-indicator';
        const botMsg = document.createElement('div');
        botMsg.className = 'chat-msg msg-ai';
        botMsg.innerHTML = `<p>Error memproses asisten AI.</p>`;
        chatBody.insertBefore(botMsg, indicator);
        chatBody.scrollTop = chatBody.scrollHeight;
    }
}