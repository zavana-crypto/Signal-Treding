/* =========================================
   CORE CONFIG & QUANTUM STATE V3
   ========================================= */
const DEFAULT_COINS = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", 
    "ADAUSDT", "XAUTUSDT", "PAXGUSDT", "ARKMUSDT", "LINKUSDT", "ONDOUSDT", "SUIUSDT"
]; 

let COINS;
try {
    COINS = JSON.parse(localStorage.getItem('zavana_coins_fixed_v6'));
    if (!Array.isArray(COINS) || COINS.length === 0) throw new Error("Empty");
    if (COINS.length === 1 && COINS[0] === 'BTCUSDT') {
        COINS = DEFAULT_COINS.slice();
        localStorage.setItem('zavana_coins_fixed_v6', JSON.stringify(COINS));
    }
} catch (e) {
    COINS = DEFAULT_COINS;
    localStorage.setItem('zavana_coins_fixed_v6', JSON.stringify(DEFAULT_COINS));
}

let userPositions = JSON.parse(localStorage.getItem('zavana_positions_lux')) || {};
let binanceSocket = null;
let wakeLock = null;
let audioCtx = null;

const PRIORITY_COINS = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT", "SUIUSDT", "ONDOUSDT", 
    "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "XAUTUSDT", "PAXGUSDT", "ARKMUSDT"
];

const NARRATIVE_MAP = {
    'AI_DATA': ['ARKMUSDT', 'FETUSDT', 'WLDUSDT', 'RNDRUSDT', 'GRTUSDT', 'OCEANUSDT', 'TAOUSDT'],
    'RWA': ['ONDOUSDT', 'POLYXUSDT', 'PENDLEUSDT', 'OMUSDT', 'TRUUSDT'],
    'LAYER1': ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'SUIUSDT', 'ADAUSDT', 'AVAXUSDT', 'INJUSDT', 'APTUSDT'],
    'MEME': ['DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'WIFUSDT', 'FLOKIUSDT', 'BONKUSDT', 'BOMEUSDT'],
    'DEFI': ['LINKUSDT', 'UNIUSDT', 'AAVEUSDT', 'MKRUSDT', 'SNXUSDT']
};

let NARRATIVE_STRENGTH = {}; 

// TIMEFRAMES
const TIMEFRAMES = [
    { label: '1m',  ws: '1m',  limit: 1000, agg: 1,     type: 'ULTRA SCALP', emaF: 5, emaS: 13, adxLookback: 7 }, 
    { label: '15m', ws: '15m', limit: 1000, agg: 15,    type: 'SCALP/INTRADAY', emaF: 9, emaS: 21, adxLookback: 10 },
    { label: '1H',  ws: '1h',  limit: 1000, agg: 60,    type: 'INTRADAY', emaF: 13, emaS: 34, adxLookback: 14 },
    { label: '4H',  ws: '4h',  limit: 1000, agg: 240,   type: 'SWING CONFIRM', emaF: 21, emaS: 50, adxLookback: 14 },
    { label: '6H',  ws: '6h',  limit: 1000, agg: 360,   type: 'SWING CONT.', emaF: 21, emaS: 50, adxLookback: 14 },
    { label: '1D',  ws: '1d',  limit: 1000, agg: 1440,  type: 'POSITION', emaF: 50, emaS: 200, adxLookback: 14 },
    { label: '1W',  ws: '1w',  limit: 1000, agg: 10080, type: 'MACRO', emaF: 50, emaS: 200, adxLookback: 14 },
    { label: '1M',  ws: '1M',  limit: 1000, agg: 43200, type: 'LONG TERM', emaF: 10, emaS: 20, adxLookback: 14 }
];

let CURRENT_TF = TIMEFRAMES[3]; // Default ke 4H 
let pollingInterval = null; 
let lastSocketTime = Date.now(); 

const charts = new Map();
const marketData = new Map();
const MTF_MATRIX = new Map(); 
const analysisResults = new Map(); 
let MacroEnvironment = { btcTrendDir: 0, btcAtrPct: 0, globalRiskStatus: 'NORMAL' };

function formatPrecision(price) {
    if (!price) return "0.00";
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(5);
    if (price < 100) return price.toFixed(4);
    return price.toFixed(2);
}

async function waitForDocumentReady() {
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
}

async function startApp() {
    await waitForDocumentReady();

    const ready = typeof LightweightCharts !== 'undefined' &&
        typeof AutoEngine !== 'undefined' &&
        typeof runAutoDiscoveryEngine === 'function' &&
        typeof renderToolbar === 'function' &&
        typeof renderGrid === 'function' &&
        typeof initSettingsForm === 'function' &&
        typeof changeTimeframe === 'function' &&
        typeof updateScreenerTable === 'function' &&
        typeof updateHealthMonitor === 'function' &&
        typeof startMatrixScanner === 'function' &&
        typeof updateDynamicMarketAnalysis === 'function' &&
        typeof renderReportDashboard === 'function';

    if (!ready) {
        setTimeout(startApp, 100);
        return;
    }

    AutoEngine.init();
    await runAutoDiscoveryEngine();

    renderToolbar(); renderGrid(); initSettingsForm();
    changeTimeframe(CURRENT_TF);

    setInterval(async () => {
        const isRotated = await runAutoDiscoveryEngine();
        if (isRotated) {
            showToast("🔄 Auto-Discovery: Rotasi Market Baru Dimuat! Momentum terdeteksi.");
            renderGrid();
            changeTimeframe(CURRENT_TF);
        }
    }, 600000);

    setInterval(updateScreenerTable, 2000);
    setInterval(updateHealthMonitor, 1000);
    startMatrixScanner();
    setInterval(updateDynamicMarketAnalysis, 3000);
    setInterval(renderReportDashboard, 2500);
    setTimeout(() => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }, 1000);
}

const checkLib = setInterval(() => {
    if (typeof LightweightCharts !== 'undefined' && typeof AutoEngine !== 'undefined') {
        clearInterval(checkLib);
        startApp();
    }
}, 200);