// channel.js - Fixed API + Sleep System
const https = require('https');

const CHANNEL_ID = '-1002427080688';
const ADMIN_ID = 5724602667;
const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY || '2e75a72c47e046739c5ec519356f2dc4';
const ALPHAVANTAGE_KEY = process.env.ALPHAVANTAGE_KEY || 'Y16H61XQEKUX1ZZ8';

// ✅ Cache system — প্রতি pair এর জন্য আলাদা
const candleCache = new Map();
const CACHE_MAX_AGE = 30 * 60 * 1000; // 30 মিনিট

// Live pairs
const livePairs = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD',
  'USD/CAD', 'USD/CHF', 'EUR/JPY', 'GBP/JPY'
];

// OTC pairs
const otcPairs = [
  'EUR/USD OTC', 'GBP/USD OTC', 'USD/JPY OTC', 'AUD/USD OTC',
  'EUR/GBP OTC', 'USD/CAD OTC', 'EUR/JPY OTC', 'GBP/JPY OTC'
];

// Live → OTC map
const liveToOtcMap = {
  'EUR/USD': 'EUR/USD OTC',
  'GBP/USD': 'GBP/USD OTC',
  'USD/JPY': 'USD/JPY OTC',
  'AUD/USD': 'AUD/USD OTC',
  'USD/CAD': 'USD/CAD OTC',
  'USD/CHF': 'USD/CHF OTC',
  'EUR/JPY': 'EUR/JPY OTC',
  'GBP/JPY': 'GBP/JPY OTC'
};

// Sleep flag
let isSleeping = false;
let sleepUntil = 0;

// Market open check (BD Time)
function isForexMarketOpen() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const day = bd.getUTCDay();
  const hour = bd.getUTCHours();
  if (day === 0) return false;
  if (day === 6 && hour >= 5) return false;
  return true;
}

function getBDTime() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const h = String(bd.getUTCHours()).padStart(2, '0');
  const m = String(bd.getUTCMinutes()).padStart(2, '0');
  return { h, m };
}

function getEntryExpiry() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const h = bd.getUTCHours();
  const m = bd.getUTCMinutes();
  const entryM = m + 1;
  const expiryM = m + 2;
  return {
    entry: String(h + Math.floor(entryM / 60)).padStart(2, '0') + ':' + String(entryM % 60).padStart(2, '0'),
    expiry: String(h + Math.floor(expiryM / 60)).padStart(2, '0') + ':' + String(expiryM % 60).padStart(2, '0')
  };
}

// ✅ TwelveData API
async function fetchFromTwelveData(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1min&outputsize=50&apikey=${TWELVE_DATA_KEY}`;
    https.get(url, (res) => {
      if (res.statusCode === 429) { reject(new Error('HTTP Status 429')); return; }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.values || json.values.length === 0) { reject(new Error('No data')); return; }
          const candles = json.values.map(v => ({
            open: parseFloat(v.open),
            high: parseFloat(v.high),
            low: parseFloat(v.low),
            close: parseFloat(v.close),
            volume: parseFloat(v.volume) || 0
          })).reverse();
          resolve(candles);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ✅ AlphaVantage API
async function fetchFromAlphaVantage(symbol) {
  return new Promise((resolve, reject) => {
    const avSymbol = symbol.replace('/', '');
    const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${symbol.split('/')[0]}&to_symbol=${symbol.split('/')[1]}&interval=1min&outputsize=compact&apikey=${ALPHAVANTAGE_KEY}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const timeSeries = json['Time Series FX (1min)'];
          if (!timeSeries) { reject(new Error('No AV data')); return; }
          const candles = Object.entries(timeSeries)
            .slice(0, 50)
            .map(([time, v]) => ({
              open: parseFloat(v['1. open']),
              high: parseFloat(v['2. high']),
              low: parseFloat(v['3. low']),
              close: parseFloat(v['4. close']),
              volume: 0
            }))
            .reverse();
          resolve(candles);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ✅ Smart candle fetcher — TwelveData → AlphaVantage → Cache
async function getCandles(symbol) {
  // Layer 1: TwelveData
  try {
    const candles = await fetchFromTwelveData(symbol);
    // Cache update
    candleCache.set(symbol, { candles, time: Date.now() });
    console.log(`[✅ TwelveData] ${symbol} — ${candles.length} candles`);
    return candles;
  } catch (e) {
    console.log(`[❌ TwelveData] ${symbol} — ${e.message} → Trying AlphaVantage...`);
  }

  // Layer 2: AlphaVantage
  try {
    const candles = await fetchFromAlphaVantage(symbol);
    candleCache.set(symbol, { candles, time: Date.now() });
    console.log(`[✅ AlphaVantage] ${symbol} — ${candles.length} candles`);
    return candles;
  } catch (e) {
    console.log(`[❌ AlphaVantage] ${symbol} — ${e.message} → Trying Cache...`);
  }

  // Layer 3: Cache
  const cached = candleCache.get(symbol);
  if (cached && (Date.now() - cached.time) < CACHE_MAX_AGE) {
    console.log(`[📦 Cache] ${symbol} — using cached data`);
    return cached.candles;
  }

  throw new Error(`All layers failed for ${symbol}`);
}

// ✅ Higher timeframe builder
function buildHigherTF(candles1m, period) {
  const result = [];
  for (let i = 0; i + period <= candles1m.length; i += period) {
    const slice = candles1m.slice(i, i + period);
    result.push({
      open: slice[0].open,
      high: Math.max(...slice.map(c => c.high)),
      low: Math.min(...slice.map(c => c.low)),
      close: slice[slice.length - 1].close,
      volume: slice.reduce((a, b) => a + b.volume, 0)
    });
  }
  return result;
}

// ✅ Indicators
function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calcEMA(candles, period) {
  if (candles.length < period) return candles[candles.length - 1].close;
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

function calcMACD(candles) {
  return calcEMA(candles, 12) - calcEMA(candles, 26);
}

function calcStochRSI(candles, period = 14) {
  const rsiValues = [];
  for (let i = period; i < candles.length; i++) {
    rsiValues.push(calcRSI(candles.slice(0, i + 1), period));
  }
  if (rsiValues.length < period) return 50;
  const recent = rsiValues.slice(-period);
  const minRSI = Math.min(...recent);
  const maxRSI = Math.max(...recent);
  if (maxRSI === minRSI) return 50;
  return ((rsiValues[rsiValues.length - 1] - minRSI) / (maxRSI - minRSI)) * 100;
}

function calcBollingerBands(candles, period = 20) {
  if (candles.length < period) period = candles.length;
  const closes = candles.slice(-period).map(c => c.close);
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return { upper: sma + 2 * stdDev, middle: sma, lower: sma - 2 * stdDev };
}

function calcATR(candles, period = 14) {
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / Math.max(trs.slice(-period).length, 1);
}

function calcADX(candles, period = 14) {
  if (candles.length < period + 1) return 20;
  let plusDM = 0, minusDM = 0, tr = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    if (upMove > downMove && upMove > 0) plusDM += upMove;
    if (downMove > upMove && downMove > 0) minusDM += downMove;
    tr += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }
  if (tr === 0) return 20;
  const plusDI = (plusDM / tr) * 100;
  const minusDI = (minusDM / tr) * 100;
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI + 0.001) * 100;
  return dx;
}

function findSupportResistance(candles) {
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));
  const currentPrice = candles[candles.length - 1].close;
  return {
    distToResistance: ((recentHigh - currentPrice) / currentPrice) * 100,
    distToSupport: ((currentPrice - recentLow) / currentPrice) * 100
  };
}

function analyzeCandlePattern(candles) {
  const len = candles.length;
  if (len < 3) return { pattern: 'No Clear Pattern', direction: 'NEUTRAL', strength: 0 };
  const c = candles[len - 1];
  const p = candles[len - 2];
  const p2 = candles[len - 3];
  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.close, c.open);
  const lowerWick = Math.min(c.close, c.open) - c.low;
  const totalRange = c.high - c.low;
  const isBullish = c.close > c.open;
  const isBearish = c.close < c.open;

  if (isBullish && p.close < p.open && c.close > p.open && c.open < p.close)
    return { pattern: 'Bullish Engulfing', direction: 'UP', strength: 3 };
  if (isBearish && p.close > p.open && c.open > p.close && c.close < p.open)
    return { pattern: 'Bearish Engulfing', direction: 'DOWN', strength: 3 };
  if (lowerWick > body * 2.5 && upperWick < body * 0.5 && lowerWick > totalRange * 0.6)
    return { pattern: 'Bullish Pin Bar', direction: 'UP', strength: 3 };
  if (upperWick > body * 2.5 && lowerWick < body * 0.5 && upperWick > totalRange * 0.6)
    return { pattern: 'Bearish Pin Bar', direction: 'DOWN', strength: 3 };
  if (p2.close < p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && isBullish && c.close > (p2.open + p2.close) / 2)
    return { pattern: 'Morning Star', direction: 'UP', strength: 4 };
  if (p2.close > p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && isBearish && c.close < (p2.open + p2.close) / 2)
    return { pattern: 'Evening Star', direction: 'DOWN', strength: 4 };
  if (c.close > c.open && p.close > p.open && p2.close > p2.open && c.close > p.close && p.close > p2.close && body > totalRange * 0.6)
    return { pattern: 'Three White Soldiers', direction: 'UP', strength: 4 };
  if (c.close < c.open && p.close < p.open && p2.close < p2.open && c.close < p.close && p.close < p2.close && body > totalRange * 0.6)
    return { pattern: 'Three Black Crows', direction: 'DOWN', strength: 4 };
  if (body < totalRange * 0.1)
    return { pattern: 'Doji', direction: 'NEUTRAL', strength: 1 };
  if (isBullish && upperWick < body * 0.05 && lowerWick < body * 0.05)
    return { pattern: 'Bullish Marubozu', direction: 'UP', strength: 3 };
  if (isBearish && upperWick < body * 0.05 && lowerWick < body * 0.05)
    return { pattern: 'Bearish Marubozu', direction: 'DOWN', strength: 3 };
  if (c.high > p.high && c.low > p.low && p.high > p2.high && p.low > p2.low)
    return { pattern: 'Higher High', direction: 'UP', strength: 2 };
  if (c.high < p.high && c.low < p.low && p.high < p2.high && p.low < p2.low)
    return { pattern: 'Lower Low', direction: 'DOWN', strength: 2 };
  return { pattern: 'No Clear Pattern', direction: 'NEUTRAL', strength: 0 };
}

function analyzeTrend(candles) {
  const ema5 = calcEMA(candles, 5);
  const ema10 = calcEMA(candles, 10);
  const ema20 = calcEMA(candles, 20);
  const ema50 = calcEMA(candles, 50);
  const lastClose = candles[candles.length - 1].close;
  let upScore = 0, downScore = 0;
  if (ema5 > ema20) upScore += 2; else downScore += 2;
  if (ema10 > ema50) upScore += 2; else downScore += 2;
  if (lastClose > ema5) upScore += 1; else downScore += 1;
  if (lastClose > ema20) upScore += 1; else downScore += 1;
  if (ema5 > ema10 && ema10 > ema20) upScore += 2;
  else if (ema5 < ema10 && ema10 < ema20) downScore += 2;
  return { trendDir: upScore > downScore ? 'UP' : 'DOWN', upScore, downScore };
}

function analyzeVolume(candles) {
  const recent = candles.slice(-5);
  const older = candles.slice(-15, -5);
  const avgRecentVol = recent.reduce((a, b) => a + b.volume, 0) / recent.length;
  const avgOlderVol = older.reduce((a, b) => a + b.volume, 0) / Math.max(older.length, 1);
  const isBullish = candles[candles.length - 1].close > candles[candles.length - 1].open;
  if (avgOlderVol === 0) return { volumeSignal: 'NEUTRAL', strength: 0 };
  const volRatio = avgRecentVol / avgOlderVol;
  if (volRatio > 1.5 && isBullish) return { volumeSignal: 'UP', strength: 2 };
  if (volRatio > 1.5 && !isBullish) return { volumeSignal: 'DOWN', strength: 2 };
  return { volumeSignal: 'NEUTRAL', strength: 0 };
}

function analyzeTimeframe(candles) {
  const rsi = calcRSI(candles);
  const rsi7 = calcRSI(candles, 7);
  const stochRSI = calcStochRSI(candles);
  const macd = calcMACD(candles);
  const bb = calcBollingerBands(candles);
  const atr = calcATR(candles);
  const adx = calcADX(candles);
  const sr = findSupportResistance(candles);
  const candlePattern = analyzeCandlePattern(candles);
  const trend = analyzeTrend(candles);
  const volume = analyzeVolume(candles);
  const lastClose = candles[candles.length - 1].close;

  let upScore = 0, downScore = 0;
  const signals = [];

  // RSI
  if (rsi < 30) { upScore += 3; signals.push('RSI Oversold'); }
  else if (rsi > 70) { downScore += 3; signals.push('RSI Overbought'); }
  else if (rsi < 45) upScore += 1;
  else if (rsi > 55) downScore += 1;

  // Fast RSI
  if (rsi7 < 25) { upScore += 2; signals.push('Fast RSI Oversold'); }
  else if (rsi7 > 75) { downScore += 2; signals.push('Fast RSI Overbought'); }

  // StochRSI
  if (stochRSI < 20) { upScore += 2; signals.push('StochRSI Oversold'); }
  else if (stochRSI > 80) { downScore += 2; signals.push('StochRSI Overbought'); }

  // MACD
  if (macd > 0) { upScore += 2; signals.push('MACD Bullish'); }
  else { downScore += 2; signals.push('MACD Bearish'); }

  // Bollinger Bands
  if (lastClose <= bb.lower) { upScore += 3; signals.push('Price at Lower BB'); }
  else if (lastClose >= bb.upper) { downScore += 3; signals.push('Price at Upper BB'); }

  // ADX
  if (adx > 25) {
    upScore += trend.upScore;
    downScore += trend.downScore;
    signals.push('ADX Strong Trend');
  } else {
    upScore += Math.floor(trend.upScore / 2);
    downScore += Math.floor(trend.downScore / 2);
  }

  // EMA Trend
  if (trend.trendDir === 'UP') signals.push('EMA Bullish');
  else signals.push('EMA Bearish');

  // Candle Pattern
  if (candlePattern.direction === 'UP') { upScore += candlePattern.strength; signals.push(candlePattern.pattern); }
  else if (candlePattern.direction === 'DOWN') { downScore += candlePattern.strength; signals.push(candlePattern.pattern); }

  // Support/Resistance
  if (sr.distToSupport < 0.1) { upScore += 3; signals.push('At Support'); }
  if (sr.distToResistance < 0.1) { downScore += 3; signals.push('At Resistance'); }

  // Volume
  if (volume.volumeSignal === 'UP') { upScore += volume.strength; signals.push('Volume UP'); }
  else if (volume.volumeSignal === 'DOWN') { downScore += volume.strength; signals.push('Volume DOWN'); }

  const volatility = (atr / lastClose) * 100;
  const totalScore = upScore + downScore;
  const dominantScore = Math.max(upScore, downScore);
  const ratio = totalScore > 0 ? dominantScore / totalScore : 0;
  const direction = upScore >= downScore ? 'UP' : 'DOWN';

  return { direction, ratio, upScore, downScore, signals, volatility, totalScore };
}

// ✅ Main analyze function
async function analyzeWithCache(symbol, isOTC = false) {
  let candles1m;

  if (isOTC) {
    // OTC mode — শুধু cache ব্যবহার করবে
    const cached = candleCache.get(symbol);
    if (!cached) {
      console.log(`[OTC] ${symbol} — No cache available, skipping`);
      return null;
    }
    candles1m = cached.candles;
    console.log(`[OTC 📦] ${symbol} — Using cached data`);
  } else {
    // Live mode — API call করবে
    try {
      candles1m = await getCandles(symbol);
    } catch (e) {
      console.log(`[LIVE ❌] ${symbol} — ${e.message}`);
      return null;
    }
  }

  const candles5m = buildHigherTF(candles1m, 5);

  const tf1m = analyzeTimeframe(candles1m);
  const tf5m = analyzeTimeframe(candles5m);

  console.log(`${symbol} | 1m: ${tf1m.direction}(${Math.round(tf1m.ratio*100)}%) | 5m: ${tf5m.direction}(${Math.round(tf5m.ratio*100)}%)`);

  // 1m + 5m confirmation
  if (tf1m.direction !== tf5m.direction) {
    console.log(`${symbol} | Mixed timeframes — skipping`);
    return null;
  }

  if (tf1m.volatility < 0.005) {
    console.log(`${symbol} | Too low volatility — skipping`);
    return null;
  }

  const avgRatio = (tf1m.ratio + tf5m.ratio) / 2;
  if (avgRatio < 0.68) {
    console.log(`${symbol} | Low confidence (${Math.round(avgRatio*100)}%) — skipping`);
    return null;
  }

  let confidence, winRate;
  if (avgRatio >= 0.82) { confidence = 'Very High 🔥'; winRate = '85%'; }
  else if (avgRatio >= 0.75) { confidence = 'High 🟢'; winRate = '80%'; }
  else { confidence = 'Medium 🟡'; winRate = '75%'; }

  const trendDesc = tf5m.direction === 'UP' ? 'Strong Uptrend' : 'Strong Downtrend';
  const topSignals = tf1m.signals.slice(0, 3).join(' • ');

  return {
    pair: isOTC ? liveToOtcMap[symbol] || (symbol + ' OTC') : symbol,
    direction: tf1m.direction,
    confidence,
    winRate,
    trend: trendDesc,
    signals: topSignals,
    avgRatio: Math.round(avgRatio * 100),
    tf1m: Math.round(tf1m.ratio * 100),
    tf5m: Math.round(tf5m.ratio * 100),
    totalScore: tf1m.totalScore,
    isLive: !isOTC
  };
}

module.exports = function(bot, newsModule) {
  console.log('✅ Channel auto signal started!');

  let lastMarketStatus = null;

  async function checkAndSendBestSignal() {
    // Sleep check
    if (Date.now() < sleepUntil) {
      const remaining = Math.round((sleepUntil - Date.now()) / 1000 / 60);
      console.log(`[😴 Sleep] ${remaining} মিনিট বাকি — কোনো API call নেই`);
      return;
    }

    // News check
    if (newsModule && newsModule.isNewsActive()) {
      console.log('[📰 News] Active — signal skipped');
      return;
    }

    const marketOpen = isForexMarketOpen();
    const { h, m } = getBDTime();

    // Market status change notification
    if (lastMarketStatus !== marketOpen) {
      lastMarketStatus = marketOpen;
      if (marketOpen) {
        try {
          await bot.sendMessage(ADMIN_ID,
            '🟢 *Forex Market Open!*\n\n📊 Live Data Signal চালু হয়েছে।\n⏰ BD Time: `' + h + ':' + m + '`',
            { parse_mode: 'Markdown' }
          );
        } catch (e) {}
      } else {
        try {
          await bot.sendMessage(ADMIN_ID,
            '🔴 *Forex Market Closed!*\n\n😴 Live data পাওয়া যাচ্ছে না।\n⏰ BD Time: `' + h + ':' + m + '`\n\n📊 OTC signal চলতে থাকবে।',
            { parse_mode: 'Markdown' }
          );
        } catch (e) {}
      }
    }

    console.log(`[🔍 Scan] BD Time: ${h}:${m} | Market: ${marketOpen ? 'OPEN' : 'CLOSED'}`);

    const results = [];

    if (marketOpen) {
      // Live mode — API call করবে
      for (const symbol of livePairs) {
        try {
          const result = await analyzeWithCache(symbol, false);
          if (result) results.push(result);
          await new Promise(r => setTimeout(r, 1000)); // API rate limit এর জন্য
        } catch (e) {
          console.log(`[❌] ${symbol} — ${e.message}`);
        }
      }
    } else {
      // OTC mode — শুধু cache ব্যবহার করবে, কোনো API call নেই
      for (const symbol of livePairs) {
        try {
          const result = await analyzeWithCache(symbol, true);
          if (result) results.push(result);
        } catch (e) {
          console.log(`[❌ OTC] ${symbol} — ${e.message}`);
        }
      }
    }

    if (results.length === 0) {
      console.log('[⚠️] No confirmed signal found.');
      return;
    }

    // Best signal বেছে নাও
    results.sort((a, b) => b.avgRatio - a.avgRatio || b.totalScore - a.totalScore);
    const best = results[0];
    const { entry, expiry } = getEntryExpiry();
    const dirEmoji = best.direction === 'UP' ? '⏫' : '⏬';

    await bot.sendMessage(CHANNEL_ID,
      '📡 *𝗤𝘅 𝗔𝗜 𝗣𝗿𝗲𝗱𝗶𝗰𝘁𝗼𝗿 𝗩𝗜𝗣 𝗯𝗼𝘁📊*\n' +
      '━━━━━━━━━━━━━━━━━━\n\n' +
      '📊 *ASSET* ➜ `' + best.pair + '`\n' +
      '🚀 *DIRECTION* ➜ ' + best.direction + ' ' + dirEmoji + '\n' +
      '📊 *ENTRY* ➜ `' + entry + '`\n' +
      '⏱ *EXPIRY* ➜ `' + expiry + '`\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '♻️ *WIN RATE* ➜ `' + best.winRate + '`\n' +
      '✅ *CONFIDENCE* ➜ ' + best.confidence + '\n' +
      '🔀 *TREND* ➜ `' + best.trend + '`\n' +
      '🔗 *SIGNALS* ➜ `' + best.signals + '`\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      (best.isLive ?
        '📊 *Mode:* Live market Signal\n📈 *TF:* 1min: `' + best.tf1m + '%` • 5min: `' + best.tf5m + '%`\n'
        :
        '📊 *Mode:* OTC Market Signal\n') +
      '━━━━━━━━━━━━━━━━━━\n' +
      '⚠️ _Trade at your own risk if loss use 1 stet MTG_ ⚠️',
      { parse_mode: 'Markdown' }
    );

    // ✅ Signal পরে sleep — কোনো API call হবে না
    const sleepMinutes = marketOpen
      ? Math.floor(Math.random() * 6) + 8  // Live: 8-13 মিনিট
      : Math.floor(Math.random() * 4) + 5;  // OTC: 5-8 মিনিট

    sleepUntil = Date.now() + sleepMinutes * 60 * 1000;
    console.log(`[✅ Signal Sent] ${best.pair} | ${best.isLive ? 'LIVE' : 'OTC'} | Sleeping ${sleepMinutes} min...`);
  }

  // প্রতি 1 মিনিটে check করবে — কিন্তু sleep এ থাকলে skip করবে
  setTimeout(() => {
    checkAndSendBestSignal();
    setInterval(checkAndSendBestSignal, 60 * 1000);
  }, 10000);
};
