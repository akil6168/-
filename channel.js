// channel.js - Qx AI Predictor VIP (Full Advanced Version)
const https = require('https');
const fs = require('fs');

const CHANNEL_ID = '-1002427080688';
const ADMIN_ID = 5724602667;
const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY || '3d31d53eb903483fb33d6854db50e0fd';
const ALPHAVANTAGE_KEY = process.env.ALPHAVANTAGE_KEY;

const CHECK_INTERVAL = 60 * 1000;
const MIN_GAP = 5 * 60 * 1000;
const MAX_GAP = 20 * 60 * 1000;
const CONFIRM_LIMIT = 5;
const STALE_MINUTES = 10;

// ─── CACHE SYSTEM ───
const apiCache = {};

function updateCache(pairKey, candles, source) {
  apiCache[pairKey] = {
    candles: candles,
    lastUpdate: Date.now(),
    source: source
  };
}

function getCachedData(pairKey) {
  const cached = apiCache[pairKey];
  if (!cached) return null;
  const ageInMinutes = (Date.now() - cached.lastUpdate) / 60000;
  if (ageInMinutes <= 10) {
    return cached;
  }
  return null;
}

// ─── DYNAMIC SLEEP CONTROL ───
let isSleeping = false;
let sleepTimeoutId = null;

// ─── LOG SYSTEM ───
function log(msg) {
  const time = getBDTime();
  const line = `[${time.h}:${time.m}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync('signal.log', line + '\n');
  } catch (e) {}
}

// ─── WIN/LOSS TRACKING ───
const statsFile = 'stats.json';
let stats = { wins: 0, losses: 0, total: 0, date: '' };
try {
  if (fs.existsSync(statsFile)) stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
} catch (e) {}

function saveStats() {
  try { fs.writeFileSync(statsFile, JSON.stringify(stats)); } catch (e) {}
}

function resetDailyStats() {
  const today = new Date().toISOString().slice(0, 10);
  if (stats.date !== today) {
    stats = { wins: 0, losses: 0, total: 0, date: today };
    saveStats();
  }
}

// ─── PAIR MAP ───
const pairMap = [
  { live: 'EUR/USD', otc: 'EUR/USD OTC', flag: '🇪🇺🇺🇸' },
  { live: 'GBP/USD', otc: 'GBP/USD OTC', flag: '🇬🇧🇺🇸' },
  { live: 'USD/JPY', otc: 'USD/JPY OTC', flag: '🇺🇸🇯🇵' },
  { live: 'AUD/USD', otc: 'AUD/USD OTC', flag: '🇦🇺🇺🇸' },
  { live: 'USD/CAD', otc: 'USD/CAD OTC', flag: '🇺🇸🇨🇦' },
  { live: 'USD/CHF', otc: 'USD/CHF OTC', flag: '🇺🇸🇨🇭' },
  { live: 'EUR/JPY', otc: 'EUR/JPY OTC', flag: '🇪🇺🇯🇵' },
  { live: 'GBP/JPY', otc: 'GBP/JPY OTC', flag: '🇬🇧🇯🇵' }
];

// Signal cooldown per pair (last sent time)
const pairCooldown = {};
const PAIR_COOLDOWN = 10 * 60 * 1000; // ১০ মিনিট per pair

let lastSentTime = 0;
let lastSignalKey = '';
let lastMarketStatus = null; // 'live' | 'otc' | null
let liveCount = 0;
let noLiveCount = 0;

// ─── TIME ───
function getBDTime() {
  const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return {
    h: String(bd.getUTCHours()).padStart(2, '0'),
    m: String(bd.getUTCMinutes()).padStart(2, '0'),
    day: bd.getUTCDay(),
    hour: bd.getUTCHours(),
    minute: bd.getUTCMinutes(),
    bd
  };
}

function getEntryExpiry() {
  const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const h = bd.getUTCHours();
  const m = bd.getUTCMinutes();
  const eM = m + 1, xM = m + 2;
  return {
    entry: `${String((h + Math.floor(eM / 60)) % 24).padStart(2, '0')}:${String(eM % 60).padStart(2, '0')}`,
    expiry: `${String((h + Math.floor(xM / 60)) % 24).padStart(2, '0')}:${String(xM % 60).padStart(2, '0')}`
  };
}

// ─── MARKET TIME LOGIC (Quotex BD Time) ───
function isLiveMarketTime() {
  const { day, hour } = getBDTime();
  if (day === 0 || day === 6) return false;
  if (day === 1 && hour < 11) return false;
  if (day === 5 && hour >= 23) return false;
  if (hour >= 11 && hour < 23) return true;
  return false;
}

function isWeekendOTC() {
  const { day, hour } = getBDTime();
  if (day === 0 || day === 6) return true;
  if (day === 1 && hour < 11) return true;
  if (day === 5 && hour >= 23) return true;
  return false;
}

function isRolloverTime() {
  const { hour, minute } = getBDTime();
  if (hour === 23 && minute >= 58) return true;
  if (hour === 0 && minute <= 2) return true;
  return false;
}

// ─── SCHEDULED ADMIN ALERT ───
let sentLiveOpenToday = '';
let sentLiveCloseToday = '';
let sentWeekendStartToday = '';
let sentWeekendEndToday = '';

async function checkScheduledAlerts(bot) {
  const { day, hour, minute, h, m } = getBDTime();
  const today = new Date().toISOString().slice(0, 10);

  if (hour === 11 && minute === 0 && day >= 1 && day <= 5 && sentLiveOpenToday !== today) {
    sentLiveOpenToday = today;
    try {
      await bot.sendMessage(ADMIN_ID,
        `🟢 *Quotex Live Market OPEN*\n\n` +
        `📊 সকাল ১১:০০ — Live Market চালু হয়েছে\n` +
        `⏰ BD Time: \`${h}:${m}\`\n\n` +
        `✅ Live Signal শুরু হচ্ছে।`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  }

  if (hour === 23 && minute === 0 && day >= 1 && day <= 4 && sentLiveCloseToday !== today) {
    sentLiveCloseToday = today;
    try {
      await bot.sendMessage(ADMIN_ID,
        `🔴 *Quotex Live Market CLOSED*\n\n` +
        `😴 রাত ১১:০০ — Live Market বন্ধ হয়েছে\n` +
        `⏰ BD Time: \`${h}:${m}\`\n\n` +
        `📊 OTC Signal চলতে থাকবে।`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  }

  if (hour === 23 && minute === 0 && day === 5 && sentWeekendStartToday !== today) {
    sentWeekendStartToday = today;
    try {
      await bot.sendMessage(ADMIN_ID,
        `🔴 *Weekend শুরু — Live Market CLOSED*\n\n` +
        `📅 শুক্রবার রাত ১১:০০\n` +
        `⏰ BD Time: \`${h}:${m}\`\n\n` +
        `📊 সোমবার সকাল ১১:০০ পর্যন্ত OTC Signal চলবে।`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  }

  if (hour === 11 && minute === 0 && day === 1 && sentWeekendEndToday !== today) {
    sentWeekendEndToday = today;
    try {
      await bot.sendMessage(ADMIN_ID,
        `🟢 *Weekend শেষ — Live Market OPEN*\n\n` +
        `📅 সোমবার সকাল ১১:০০\n` +
        `⏰ BD Time: \`${h}:${m}\`\n\n` +
        `✅ Live Signal শুরু হচ্ছে।`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  }
}

// ─── API ───
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getCandlesWithFailover(symbol) {
  // 1st Layer: TwelveData
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1min&outputsize=30&apikey=${TWELVE_DATA_KEY}`;
    const data = await fetchJSON(url);
    if (!data.values || !data.values.length) throw new Error('No data');

    const lastCandleTime = new Date(data.values[0].datetime + ' UTC');
    const diffMin = (Date.now() - lastCandleTime) / 60000;
    if (diffMin > STALE_MINUTES) throw new Error('Stale: ' + Math.round(diffMin) + 'min');

    const formattedCandles = data.values.map(v => ({
      open: +v.open, high: +v.high, low: +v.low,
      close: +v.close, volume: +v.volume || 0
    })).reverse();

    updateCache(symbol, formattedCandles, 'TwelveData');
    return { candles: formattedCandles, source: 'TwelveData' };
  } catch (e) {
    log(symbol + ' | TwelveData fail: ' + e.message);
  }

  // 2nd Layer: AlphaVantage (using process.env.ALPHAVANTAGE_KEY)
  if (ALPHAVANTAGE_KEY) {
    try {
      const avSymbol = symbol.replace('/', '');
      const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${symbol.split('/')[0]}&to_symbol=${symbol.split('/')[1]}&interval=1min&outputsize=compact&apikey=${ALPHAVANTAGE_KEY}`;
      const data = await fetchJSON(url);
      const series = data['Time Series FX (1min)'];
      if (!series) throw new Error('No AV data');
      const keys = Object.keys(series).sort().reverse().slice(0, 30);
      
      const formattedCandles = keys.map(k => ({
        open: +series[k]['1. open'],
        high: +series[k]['2. high'],
        low: +series[k]['3. low'],
        close: +series[k]['4. close'],
        volume: 0
      })).reverse();

      updateCache(symbol, formattedCandles, 'AlphaVantage');
      return { candles: formattedCandles, source: 'AlphaVantage' };
    } catch (e) {
      log(symbol + ' | AlphaVantage fail: ' + e.message);
    }
  } else {
    log(symbol + ' | AlphaVantage skipped (Missing ALPHAVANTAGE_KEY)');
  }

  // 3rd Layer: Cached Candles (Valid for <= 10 minutes)
  const localCache = getCachedData(symbol);
  if (localCache) {
    log(symbol + ' | 📦 Serving from internal Cache (Source: ' + localCache.source + ')');
    return { candles: localCache.candles, source: 'Cache_' + localCache.source };
  }

  throw new Error('All API sources and Cache failed for ' + symbol);
}

function buildHigherTF(candles1m, period) {
  const result = [];
  for (let i = 0; i + period <= candles1m.length; i += period) {
    const sl = candles1m.slice(i, i + period);
    result.push({
      open: sl[0].open,
      high: Math.max(...sl.map(c => c.high)),
      low: Math.min(...sl.map(c => c.low)),
      close: sl[sl.length - 1].close,
      volume: sl.reduce((a, b) => a + b.volume, 0)
    });
  }
  return result;
}

// ─── INDICATORS ───
function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    d > 0 ? gain += d : loss += Math.abs(d);
  }
  return 100 - (100 / (1 + gain / (loss || 1)));
}

function calcEMA(candles, period) {
  if (candles.length < 2) return candles[0].close;
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) ema = candles[i].close * k + ema * (1 - k);
  return ema;
}

function calcMACD(candles) { return calcEMA(candles, 12) - calcEMA(candles, 26); }

function calcStochRSI(candles, period = 14) {
  const rsiArr = [];
  for (let i = period; i < candles.length; i++)
    rsiArr.push(calcRSI(candles.slice(0, i + 1), period));
  if (rsiArr.length < period) return 50;
  const rec = rsiArr.slice(-period);
  const mn = Math.min(...rec), mx = Math.max(...rec);
  if (mx === mn) return 50;
  return ((rsiArr[rsiArr.length - 1] - mn) / (mx - mn)) * 100;
}

function calcBB(candles, period = 20) {
  const p = Math.min(period, candles.length);
  const closes = candles.slice(-p).map(c => c.close);
  const sma = closes.reduce((a, b) => a + b, 0) / p;
  const std = Math.sqrt(closes.reduce((s, c) => s + Math.pow(c - sma, 2), 0) / p);
  return { upper: sma + 2 * std, lower: sma - 2 * std, middle: sma };
}

function calcATR(candles, period = 14) {
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcSR(candles) {
  const highs = candles.slice(-20).map(c => c.high);
  const lows = candles.slice(-20).map(c => c.low);
  const cur = candles[candles.length - 1].close;
  return {
    distRes: ((Math.max(...highs) - cur) / cur) * 100,
    distSup: ((cur - Math.min(...lows)) / cur) * 100
  };
}

function calcADX(candles, period = 14) {
  if (candles.length < period + 1) return { adx: 25, plusDI: 25, minusDI: 25 };
  const trs = [], plusDMs = [], minusDMs = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high, low = candles[i].low;
    const pHigh = candles[i - 1].high, pLow = candles[i - 1].low, pClose = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - pClose), Math.abs(low - pClose)));
    const upMove = high - pHigh;
    const downMove = pLow - low;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const avgTR = trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgPlus = plusDMs.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgMinus = minusDMs.slice(-period).reduce((a, b) => a + b, 0) / period;
  if (avgTR === 0) return { adx: 0, plusDI: 0, minusDI: 0 };
  const plusDI = (avgPlus / avgTR) * 100;
  const minusDI = (avgMinus / avgTR) * 100;
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI || 1) * 100;
  return { adx: dx, plusDI, minusDI };
}

function calcSuperTrend(candles, period = 10, multiplier = 3) {
  if (candles.length < period + 1) return { dir: 'NEUTRAL', value: 0 };
  const atr = calcATR(candles, period);
  const last = candles[candles.length - 1];
  const hl2 = (last.high + last.low) / 2;
  const upperBand = hl2 + multiplier * atr;
  const lowerBand = hl2 - multiplier * atr;
  const dir = last.close > hl2 ? 'UP' : 'DOWN';
  return { dir, upperBand, lowerBand };
}

function calcVWAP(candles) {
  let cumVol = 0, cumTP = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTP += tp * c.volume;
    cumVol += c.volume;
  }
  if (cumVol === 0) return candles[candles.length - 1].close;
  return cumTP / cumVol;
}

function detectFakeBreakout(candles) {
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const bb = calcBB(candles);
  if (last.high > bb.upper && last.close < bb.upper && prev.close < bb.upper)
    return { fake: true, type: 'FAKE_UP' };
  if (last.low < bb.lower && last.close > bb.lower && prev.close > bb.lower)
    return { fake: true, type: 'FAKE_DOWN' };
  return { fake: false, type: 'NONE' };
}

function isSidewaysMarket(candles, period = 20) {
  const sl = candles.slice(-period);
  const highs = sl.map(c => c.high);
  const lows = sl.map(c => c.low);
  const range = (Math.max(...highs) - Math.min(...lows)) / candles[candles.length - 1].close * 100;
  return range < 0.3;
}

function isCandleClosed(candles) {
  return candles.length >= 2;
}

function calcCandlePattern(candles) {
  const len = candles.length;
  if (len < 3) return { pattern: 'No Pattern', dir: 'NEUTRAL', str: 0 };
  const c = candles[len - 2];
  const p = candles[len - 3];
  const p2 = len >= 4 ? candles[len - 4] : candles[len - 3];
  const body = Math.abs(c.close - c.open);
  const upWick = c.high - Math.max(c.close, c.open);
  const dnWick = Math.min(c.close, c.open) - c.low;
  const range = c.high - c.low;
  const bull = c.close > c.open, bear = c.close < c.open;

  if (bull && p.close < p.open && c.close > p.open && c.open < p.close)
    return { pattern: 'Bullish Engulfing', dir: 'UP', str: 3 };
  if (bear && p.close > p.open && c.open > p.close && c.close < p.open)
    return { pattern: 'Bearish Engulfing', dir: 'DOWN', str: 3 };
  if (dnWick > body * 2.5 && upWick < body * 0.5)
    return { pattern: 'Bullish Pin Bar', dir: 'UP', str: 3 };
  if (upWick > body * 2.5 && dnWick < body * 0.5)
    return { pattern: 'Bearish Pin Bar', dir: 'DOWN', str: 3 };
  if (p2.close < p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && bull && c.close > (p2.open + p2.close) / 2)
    return { pattern: 'Morning Star', dir: 'UP', str: 4 };
  if (p2.close > p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && bear && c.close < (p2.open + p2.close) / 2)
    return { pattern: 'Evening Star', dir: 'DOWN', str: 4 };
  if (bull && p.close > p.open && p2.close > p2.open && body > range * 0.6)
    return { pattern: 'Three White Soldiers', dir: 'UP', str: 4 };
  if (bear && p.close < p.open && p2.close < p2.open && body > range * 0.6)
    return { pattern: 'Three Black Crows', dir: 'DOWN', str: 4 };
  if (body < range * 0.1)
    return { pattern: 'Doji', dir: 'NEUTRAL', str: 1 };
  if (bull && upWick < body * 0.05 && dnWick < body * 0.05)
    return { pattern: 'Bullish Marubozu', dir: 'UP', str: 3 };
  if (bear && upWick < body * 0.05 && dnWick < body * 0.05)
    return { pattern: 'Bearish Marubozu', dir: 'DOWN', str: 3 };
  if (c.high > p.high && c.low > p.low && p.high > p2.high)
    return { pattern: 'Higher High Uptrend', dir: 'UP', str: 2 };
  if (c.high < p.high && c.low < p.low && p.low < p2.low)
    return { pattern: 'Lower Low Downtrend', dir: 'DOWN', str: 2 };
  return { pattern: 'No Pattern', dir: 'NEUTRAL', str: 0 };
}

// ─── ANALYZE TIMEFRAME ───
function calcTrend(candles) {
  const ema5 = calcEMA(candles, 5);
  const ema10 = calcEMA(candles, 10);
  const ema20 = calcEMA(candles, 20);
  const ema50 = calcEMA(candles, 50);
  const last = candles[candles.length - 1].close;
  let up = 0, dn = 0;
  if (ema5 > ema20) up += 2; else dn += 2;
  if (ema10 > ema50) up += 2; else dn += 2;
  if (last > ema5) up += 1; else dn += 1;
  if (last > ema20) up += 1; else dn += 1;
  if (ema5 > ema10 && ema10 > ema20) up += 2;
  else if (ema5 < ema10 && ema10 < ema20) dn += 2;
  return { dir: up > dn ? 'UP' : 'DOWN', up, dn };
}

function calcVolume(candles) {
  const rec = candles.slice(-5);
  const old = candles.slice(-15, -5);
  const avgRec = rec.reduce((a, b) => a + b.volume, 0) / rec.length;
  const avgOld = old.reduce((a, b) => a + b.volume, 0) / Math.max(old.length, 1);
  if (avgOld === 0) return { dir: 'NEUTRAL', str: 0 };
  const ratio = avgRec / avgOld;
  const isBull = candles[candles.length - 1].close > candles[candles.length - 1].open;
  if (ratio > 1.5 && isBull) return { dir: 'UP', str: 2 };
  if (ratio > 1.5 && !isBull) return { dir: 'DOWN', str: 2 };
  return { dir: 'NEUTRAL', str: 0 };
}

function analyzeTimeframe(candles) {
  const rsi = calcRSI(candles);
  const rsi7 = calcRSI(candles, 7);
  const stoch = calcStochRSI(candles);
  const macd = calcMACD(candles);
  const bb = calcBB(candles);
  const atr = calcATR(candles);
  const sr = calcSR(candles);
  const cp = calcCandlePattern(candles);
  const trend = calcTrend(candles);
  const vol = calcVolume(candles);
  const adx = calcADX(candles);
  const superTrend = calcSuperTrend(candles);
  const vwap = calcVWAP(candles);
  const fakeBreak = detectFakeBreakout(candles);
  const sideways = isSidewaysMarket(candles);
  const last = candles[candles.length - 1].close;

  let up = 0, dn = 0;
  const signals = [];

  if (sideways) return { direction: 'NEUTRAL', ratio: 0, up: 0, dn: 0, signals: ['Sideways Market'], volatility: 0, total: 0, isStrongTrend: false, trendDir: 'NEUTRAL', sideways: true };

  if (fakeBreak.fake) {
    if (fakeBreak.type === 'FAKE_UP') dn += 3;
    else up += 3;
    signals.push('Fake Breakout Detected');
  }

  if (rsi < 30) { up += 3; signals.push('RSI Oversold'); }
  else if (rsi > 70) { dn += 3; signals.push('RSI Overbought'); }
  else if (rsi < 45) up += 1;
  else if (rsi > 55) dn += 1;

  if (rsi7 < 25) { up += 2; signals.push('Fast RSI Oversold'); }
  else if (rsi7 > 75) { dn += 2; signals.push('Fast RSI Overbought'); }

  if (stoch < 20) { up += 2; signals.push('StochRSI Oversold'); }
  else if (stoch > 80) { dn += 2; signals.push('StochRSI Overbought'); }

  if (macd > 0) { up += 2; signals.push('MACD Bullish'); }
  else { dn += 2; signals.push('MACD Bearish'); }

  if (last <= bb.lower) { up += 3; signals.push('Price at Lower BB'); }
  else if (last >= bb.upper) { dn += 3; signals.push('Price at Upper BB'); }

  up += trend.up; dn += trend.dn;
  if (trend.dir === 'UP') signals.push('EMA Bullish');
  else signals.push('EMA Bearish');

  if (cp.dir === 'UP') { up += cp.str; signals.push(cp.pattern); }
  else if (cp.dir === 'DOWN') { dn += cp.str; signals.push(cp.pattern); }

  if (sr.distSup < 0.1) { up += 3; signals.push('At Support'); }
  if (sr.distRes < 0.1) { dn += 3; signals.push('At Resistance'); }

  if (vol.dir === 'UP') { up += vol.str; signals.push('Volume Bullish'); }
  else if (vol.dir === 'DOWN') { dn += vol.str; signals.push('Volume Bearish'); }

  if (adx.adx > 25) {
    if (adx.plusDI > adx.minusDI) { up += 3; signals.push('ADX Strong Bullish'); }
    else { dn += 3; signals.push('ADX Strong Bearish'); }
  }

  if (superTrend.dir === 'UP') { up += 2; signals.push('SuperTrend Bullish'); }
  else if (superTrend.dir === 'DOWN') { dn += 2; signals.push('SuperTrend Bearish'); }

  if (last > vwap) { up += 2; signals.push('Above VWAP'); }
  else { dn += 2; signals.push('Below VWAP'); }

  const total = up + dn;
  const dominant = Math.max(up, dn);
  const ratio = total > 0 ? dominant / total : 0;
  const direction = up >= dn ? 'UP' : 'DOWN';
  const volatility = (atr / last) * 100;
  const isStrongTrend = (trend.up >= 5 || trend.dn >= 5) && adx.adx > 15;

  return { direction, ratio, up, dn, signals, volatility, total, isStrongTrend, trendDir: trend.dir, sideways: false };
}

// ─── SMART ANALYZE ───
async function smartAnalyze(pair, isOTCMode = false) {
  const lastPairTime = pairCooldown[pair.live] || 0;
  if (Date.now() - lastPairTime < PAIR_COOLDOWN) {
    log(pair.live + ' | Cooldown active — skip');
    return null;
  }

  let candles1m, isLive = false, source = '';

  if (!isOTCMode) {
    try {
      const result = await getCandlesWithFailover(pair.live);
      candles1m = result.candles;
      source = result.source;
      isLive = true;
      log(pair.live + ' | ✅ Live [' + source + ']');
    } catch (e) {
      log(pair.live + ' | ❌ Live fail: ' + e.message + ' → OTC Fallback Process');
      try {
        const result = await getCandlesWithFailover(pair.live);
        candles1m = result.candles;
        isLive = false;
        log(pair.otc + ' | 📊 OTC mode');
      } catch (e2) { return null; }
    }
  } else {
    try {
      const result = await getCandlesWithFailover(pair.live);
      candles1m = result.candles;
      isLive = false;
    } catch (e) { return null; }
  }

  if (!isCandleClosed(candles1m)) return null;

  const candles5m = buildHigherTF(candles1m, 5);
  if (candles5m.length < 3) return null;

  const tf1m = analyzeTimeframe(candles1m);
  const tf5m = analyzeTimeframe(candles5m);

  if (tf1m.sideways || tf5m.sideways) {
    log((isLive ? pair.live : pair.otc) + ' | Sideways — skip');
    return null;
  }

  if (!tf1m.isStrongTrend) {
    log((isLive ? pair.live : pair.otc) + ' | Weak trend — skip');
    return null;
  }

  if (tf1m.direction !== tf5m.direction) {
    log((isLive ? pair.live : pair.otc) + ' | Mixed TF — skip');
    return null;
  }

  if (tf1m.volatility < 0.01) {
    log((isLive ? pair.live : pair.otc) + ' | Low volatility — skip');
    return null;
  }

  const avgRatio = (tf1m.ratio + tf5m.ratio) / 2;
  const aiScore = Math.round(avgRatio * 100);

  let confidence;
  if (avgRatio >= 0.82) confidence = 'Very High 🔥';
  else if (avgRatio >= 0.75) confidence = 'High 🟢';
  else {
    log((isLive ? pair.live : pair.otc) + ' | Medium conf — skip');
    return null;
  }

  const trendDesc = tf1m.direction === 'UP' ? 'Strong Uptrend 📈' : 'Strong Downtrend 📉';
  const displayName = isLive ? pair.live : pair.otc;

  log(displayName + ' | ' + tf1m.direction + ' | Score: ' + aiScore + '% | ' + confidence);

  return {
    pair: displayName,
    flag: pair.flag,
    direction: tf1m.direction,
    confidence,
    aiScore,
    avgRatio,
    trend: trendDesc,
    signals: tf1m.signals.filter(s => !['EMA Bullish', 'EMA Bearish'].includes(s) || tf1m.signals.length <= 3).slice(0, 3),
    tf1m: Math.round(tf1m.ratio * 100),
    tf5m: Math.round(tf5m.ratio * 100),
    total: tf1m.total,
    isLive,
    livePair: pair.live
  };
}

// ─── SIGNAL MESSAGE ───
function buildSignalMessage(best, entry, expiry) {
  const dirEmoji = best.direction === 'UP' ? '⏫' : '⏬';
  const dirLabel = best.direction === 'UP' ? '🟢 BUY' : '🔴 SELL';
  const marketMode = best.isLive ? '🟢 LIVE' : '🔴 OTC';
  const analysisLines = best.signals.map(s => `• ${s}`).join('\n');

  return (
    `╔══════════════════════╗\n` +
    `     🚀 𝗤𝘅 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝗜𝗣\n` +
    `╚══════════════════════╝\n\n` +
    `💹 𝗔𝗦𝗦𝗘𝗧        ➜ ${best.pair} ${best.flag}\n` +
    `📈 𝗗𝗜𝗥𝗘𝗖𝗧𝗜𝗢𝗡    ➜ ${dirLabel} ${dirEmoji}\n` +
    `🕒 𝗘𝗡𝗧𝗥𝗬        ➜ ${entry} (BD Time)\n` +
    `⏳ 𝗘𝗫𝗣𝗜𝗥𝗬      ➜ ${expiry} (1 Minute)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 𝗔𝗜 𝗦𝗖𝗢𝗥Ｅ     ➜ ${best.aiScore}%\n` +
    `🔥 𝗖𝗢𝗡𝗙𝗜𝗗𝗘𝗡𝗖𝗘  ➜ ${best.confidence}\n` +
    `📊 𝗧𝗥𝗘𝗡𝗗        ➜ ${best.trend}\n` +
    `🌐 𝗠𝗔𝗥𝗞𝗘𝗧      ➜ ${marketMode}\n` +
    `⚡ 𝗦𝗧𝗔𝗧𝗨𝗦      ➜ ✅ Confirmed Signal\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 𝗔𝗡𝗔𝗟𝗬𝗦𝗜𝗦\n` +
    `${analysisLines}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛡️ 𝗥𝗜𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧\n` +
    `• Maximum 1 Step MTG\n` +
    `• Never Overtrade\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤖 Powered by 𝗤𝘅 𝗔𝗜 𝗣𝗿𝗲𝗱𝗶𝗰𝘁𝗼𝗿\n` +
    `⚠️ This signal is AI-generated.\n` +
    `Always trade at your own risk.`
  );
}

// ─── MAIN MODULE ───
module.exports = function(bot, newsModule) {
  log('✅ Qx AI Predictor VIP channel started!');

  bot.onText(/\/status/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    const { h, m } = getBDTime();
    const mode = isLiveMarketTime() ? '🟢 LIVE' : '🔴 OTC';
    const rollover = isRolloverTime() ? '⏸ YES' : '✅ NO';
    const weekend = isWeekendOTC() ? '✅ YES' : '❌ NO';
    const sleepStatus = isSleeping ? '💤 SLEEPING' : '🔍 SCANNING';
    await bot.sendMessage(ADMIN_ID,
      `📊 *BOT STATUS*\n\n` +
      `⏰ BD Time: \`${h}:${m}\`\n` +
      `🌐 Market Mode: ${mode}\n` +
      `⏸ Rollover: ${rollover}\n` +
      `📅 Weekend OTC: ${weekend}\n` +
      `⚡ Status: \`${sleepStatus}\`\n` +
      `📡 Last Signal: \`${lastSignalKey || 'None'}\`\n` +
      `📈 Today: W:${stats.wins} L:${stats.losses} T:${stats.total}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.onText(/\/market/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    const mode = isLiveMarketTime() ? '🟢 Live Market চলছে' : '🔴 OTC Market চলছে';
    const { h, m } = getBDTime();
    await bot.sendMessage(ADMIN_ID,
      `🌐 *MARKET STATUS*\n\n${mode}\n⏰ BD Time: \`${h}:${m}\``,
      { parse_mode: 'Markdown' }
    );
  });

  bot.onText(/\/force/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    if (isSleeping) {
      if (sleepTimeoutId) clearTimeout(sleepTimeoutId);
      isSleeping = false;
      log('⚡ Force scan initialized: Interrupted sleep mode.');
    }
    await bot.sendMessage(ADMIN_ID, '⚡ Force scan শুরু হচ্ছে...');
    lastSentTime = 0;
    await run();
  });

  async function run() {
    if (isSleeping) return;

    resetDailyStats();
    await checkScheduledAlerts(bot);

    if (newsModule && newsModule.isNewsActive()) {
      log('📰 News active — signal skipped');
      return;
    }

    if (isRolloverTime()) {
      log('⏸ Rollover time — scan skipped');
      return;
    }

    const now = Date.now();
    const elapsed = now - lastSentTime;
    if (lastSentTime > 0 && elapsed < MIN_GAP) return;

    const { h, m } = getBDTime();
    const otcMode = !isLiveMarketTime();
    log(`🔍 Scan BD Time: ${h}:${m} | Mode: ${otcMode ? 'OTC' : 'LIVE'}`);

    const results = [];
    let anyLive = false;

    for (const pair of pairMap) {
      if (isSleeping) return; 
      try {
        const res = await smartAnalyze(pair, otcMode);
        if (res) {
          results.push(res);
          if (res.isLive) anyLive = true;
        }
        await new Promise(r => setTimeout(r, 1200));
      } catch (e) {
        log('Error: ' + pair.live + ' — ' + e.message);
      }
    }

    if (anyLive) {
      liveCount++; noLiveCount = 0;
    } else {
      noLiveCount++; liveCount = 0;
    }

    if (liveCount >= CONFIRM_LIMIT && lastMarketStatus !== 'live') {
      lastMarketStatus = 'live'; liveCount = 0;
      const { h: ah, m: am } = getBDTime();
      try {
        await bot.sendMessage(ADMIN_ID,
          `🟢 *Live Data Confirmed*\n\n` +
          `📊 পরপর ${CONFIRM_LIMIT} বার Live Data পাওয়া গেছে\n` +
          `⏰ BD Time: \`${ah}:${am}\``,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
    }

    if (noLiveCount >= CONFIRM_LIMIT && lastMarketStatus !== 'otc') {
      lastMarketStatus = 'otc'; noLiveCount = 0;
      const { h: ah, m: am } = getBDTime();
      try {
        await bot.sendMessage(ADMIN_ID,
          `🔴 *Live Data Lost*\n\n` +
          `😴 পরপর ${CONFIRM_LIMIT} বার Live Data নেই\n` +
          `⏰ BD Time: \`${ah}:${am}\`\n` +
          `📊 OTC Mode চলছে।`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
    }

    if (!results.length) {
      log('❌ No confirmed signal found.');
      return;
    }

    results.sort((a, b) => b.avgRatio - a.avgRatio || b.total - a.total);
    const top3 = results.slice(0, 3);
    const best = top3[0];

    log(`🏆 Top 3: ${top3.map(r => r.pair + '(' + r.aiScore + '%)').join(', ')}`);

    const signalKey = `${best.pair}_${best.direction}`;
    if (signalKey === lastSignalKey && elapsed < MAX_GAP) {
      log(`🔁 Duplicate (${signalKey}) — skip`);
      return;
    }

    const { entry, expiry } = getEntryExpiry();
    const msg = buildSignalMessage(best, entry, expiry);

    try {
      await bot.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
      lastSentTime = Date.now();
      lastSignalKey = signalKey;
      pairCooldown[best.livePair] = Date.now();

      stats.total++;
      saveStats();

      log(`✅ Signal: ${best.pair} ${best.direction} | ${best.aiScore}% | ${best.confidence} | ${best.isLive ? 'LIVE' : 'OTC'}`);
      
      // TRIGGER SYSTEM SLEEP: Stop scanning immediately after successful broadcast
      const sleepMinutes = Math.floor(Math.random() * (20 - 5 + 1)) + 5;
      log(`💤 Signal sent! Bot entering deep sleep mode for ${sleepMinutes} minutes. ZERO API requests will be generated.`);
      isSleeping = true;
      
      sleepTimeoutId = setTimeout(() => {
        isSleeping = false;
        log('⏰ Sleep period ended. Resuming market analysis scan...');
        run();
      }, sleepMinutes * 60 * 1000);

    } catch (e) {
      log('Send error: ' + e.message);
    }
  }

  setTimeout(() => {
    run();
    setInterval(run, CHECK_INTERVAL);
  }, 30000);
};
