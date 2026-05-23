/* =========================================
   ENGINE DISCOVERY & API FETCHER
   ========================================= */
async function fetchHistory(s, interval, lim) {
    try {
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=${interval}&limit=${lim}`, { keepalive: true });
        const raw = await res.json();
        return raw.map(d => ({ time: Math.floor(d[0] / 1000), open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]), takerBuy: parseFloat(d[9]) }));
    } catch(e) { return []; }
}

async function runAutoDiscoveryEngine() {
    try {
        const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const tickers = await res.json();
        
        for (const [narrative, coins] of Object.entries(NARRATIVE_MAP)) {
            let strength = 0, validCoins = 0;
            tickers.forEach(t => { if (coins.includes(t.symbol)) { strength += parseFloat(t.priceChangePercent); validCoins++; } });
            NARRATIVE_STRENGTH[narrative] = validCoins > 0 ? (strength / validCoins) : 0;
        }

        let validTickers = tickers.filter(t => t.symbol.endsWith('USDT') && parseFloat(t.quoteVolume) > 30000000);
        
        validTickers.forEach(t => {
            const priceChg = parseFloat(t.priceChangePercent);
            const volScore = parseFloat(t.quoteVolume) / 10000000;
            let nScore = 0;
            for (const [narrative, coins] of Object.entries(NARRATIVE_MAP)) {
                if (coins.includes(t.symbol) && NARRATIVE_STRENGTH[narrative] > 5) nScore += 15;
            }
            t.discoveryScore = (priceChg * 2.5) + volScore + nScore; 
        });

        validTickers.sort((a, b) => b.discoveryScore - a.discoveryScore);
        
        const dynamicDiscoveredCoins = validTickers.filter(t => !PRIORITY_COINS.includes(t.symbol)).slice(0, 7).map(t => t.symbol);
        let customCoins = JSON.parse(localStorage.getItem('zavana_coins_fixed_v6') || "[]");
        if (!Array.isArray(customCoins) || customCoins.length === 0) customCoins = [];
        if (customCoins.length === 1 && customCoins[0] === 'BTCUSDT') {
            customCoins = DEFAULT_COINS.slice();
            localStorage.setItem('zavana_coins_fixed_v6', JSON.stringify(customCoins));
        }
        let baseCoins = customCoins.length > 0 ? customCoins : PRIORITY_COINS;
        
        let newCoinsList = [...new Set([...baseCoins, ...dynamicDiscoveredCoins])];
        newCoinsList.sort((a, b) => (PRIORITY_COINS.includes(b) ? 1 : 0) - (PRIORITY_COINS.includes(a) ? 1 : 0));
        
        if (JSON.stringify(COINS) !== JSON.stringify(newCoinsList)) {
            COINS = newCoinsList;
            return true;
        }
        return false;
    } catch (e) {
        console.error("Discovery Engine Offline, fallback to priority:", e);
        return false;
    }
}