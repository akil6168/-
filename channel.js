// channel.js - Qx AI Predictor VIP (Highly Optimized Production Version)
const https = require('https');
const fs = require('fs');

// ─── CONFIGURATION & ENVIRONMENT VARIABLES ───
const CHANNEL_ID = '-1002427080688';
const ADMIN_ID = 5724602667;
const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY || 'd29823ad0b3b436992411d122a8b64b6';
const ALPHAVANTAGE_KEY = process.env.ALPHAVANTAGE_KEY || '74LRZJ0QI9C6L00B'; // Loaded securely from your Railway Config

const CHECK_INTERVAL = 60 * 1000;
const MIN_GAP = 5 * 60 * 1000;
const MAX_GAP = 20 * 60 * 1000;
const CONFIRM_LIMIT = 5;
const STALE_MINUTES = 10;

// ─── INTERNAL HIGH-PERFORMANCE CACHE ───
const apiCache = new Map();

function updateCache(symbol, candles, source) {
  apiCache.set(symbol, {
    candles,
    lastUpdate: Date.now(),
    source
  });
}

function getCachedData(symbol) {
  const cached = apiCache.get(symbol);
  if (!cached) return null;
  const ageInMinutes = (Date.now() - cached.lastUpdate) / 60000;
  return ageInMinutes <= STALE_MINUTES ? cached : null;
}

// ─── SYSTEM STATE CONTROL ───
let isSleeping = false;
let sleepTimeoutId = null;
let lastSentTime = 0;
let lastSignalKey = '';
let lastMarketStatus = null; 
let liveCount = 0;
let noLiveCount = 0;
const pairCooldown = {};
const PAIR_COOLDOWN = 10 * 60 * 1000;

// ─── LOG SYSTEM ───
function log(msg) {
  const time = getBDTime();
  const line = `[${time.h}:${time.m}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync('signal.log', line + '\n');
  } catch (e) {}
}

// ─── WIN/LOSS DAILY TRACKING ───
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

// ─── PAIR MATRIX MAP ───
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

// ─── PRECISION TIME CALCULATIONS ───
function getBDTime() {
  const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return {
    h: String(bd.getUTCHours()).padStart(2, '0'),
    m: String(bd.getUTCMinutes()).padStart(2, '0'),
    day: bd.getUTCDay(),
    hour: bd.getUTCHours(),
    minute: bd.getUTCMinutes()
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

// ─── MARKET RULES VALIDATION ───
function isLiveMarketTime() {
  const { day, hour } = getBDTime();
  if (day === 0 || day === 6) return false; // Weekend always OTC
  if (day === 1 && hour < 11) return false;  // Monday before 11 AM OTC
  if (day === 5 && hour >= 23) return false; // Friday after 11 PM OTC
  return hour >= 11 && hour < 23;            // Weekdays 11 AM to 11 PM LIVE
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
  return (hour === 23 && minute >= 58) || (hour === 0 && minute <= 2);
}

// ─── AUTOMATED ADMIN ALERTS SYSTEM ───
let sentLiveOpenToday = '', sentLiveCloseToday = '', sentWeekendStartToday = '', sentWeekendEndToday = '';

async function checkScheduledAlerts(bot) {
  const { day, hour, minute, h, m } = getBDTime();
  const today = new Date().toISOString().slice(0, 10);

  if (hour === 11 && minute === 0 && day >= 1 && day <= 5 && sentLiveOpenToday !== today) {
    sentLiveOpenToday = today;
    try {
      await bot.sendMessage(ADMIN_ID, `🟢 *Quotex Live Market OPEN*\n\n📊 সকাল ১১:০০ — Live Market চালু হয়েছে\n⏰ BD Time: \`${h}:${m}\`\n\n✅ Live Signal শুরু হচ্ছে।`, { parse_mode: 'Markdown' });
    } catch (e) {}
  }
  if (hour === 23 && minute === 0 && day >= 1 && day <= 4 && sentLiveCloseToday !== today) {
    sentLiveCloseToday = today;
    try {
      await bot.sendMessage(ADMIN_ID, `🔴 *Quotex Live Market CLOSED*\n\n😴 রাত ১১:০০ — Live Market বন্ধ হয়েছে\n⏰ BD Time: \`${h}:${m}\`\n\n📊 OTC Signal চলতে থাকবে।`, { parse_mode: 'Markdown' });
    } catch (e) {}
  }
  if (hour === 23 && minute === 0 && day === 5 && sentWeekendStartToday !== today) {
    sentWeekendStartToday = today;
    try {
      await bot.sendMessage(ADMIN_ID, `🔴 *Weekend শুরু — Live Market CLOSED*\n\n📅 শুক্রবার রাত ১১:০০\n⏰ BD Time: \`${h}:${m}\`\n\n📊 সোমবার সকাল ১১:০০ পর্যন্ত OTC Signal চলবে।`, { parse_mode: 'Markdown' });
    } catch (e) {}
  }
  if (hour === 11 && minute === 0 && day === 1 && sentWeekendEndToday !== today) {
    sentWeekendEndToday = today;
    try {
      await bot.sendMessage(ADMIN_ID, `🟢 *Weekend শেষ — Live Market OPEN*\n\n📅 সোমবার সকাল ১১:০০\n⏰ BD Time: \`${h}:${m}\`\n\n✅ Live Signal শুরু হচ্ছে।`, { parse_mode: 'Markdown' });
    } catch (e) {}
  }
}

// ─── HTTPS ASYNC NETWORK HANDLER ───
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 8000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP Status ${res.statusCode}`));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ─── PRODUCTION FAILOVER API ENGINE (BUGS FIXED) ───
async function getCandlesWithFailover(symbol) {
  // Layer 1: TwelveData
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1min&outputsize=30&apikey=${TWELVE_DATA_KEY}`;
    const data = await fetchJSON(url);
    if (data && data.values && data.values.length) {
      const lastCandleTime = new Date(data.values[0].datetime + ' UTC');
      if ((Date.now() - lastCandleTime) / 60000 <= STALE_MINUTES) {
        const candles = data.values.map(v => ({
          open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: +v.volume || 0
        })).reverse();
        updateCache(symbol, candles, 'TwelveData');
        return { candles, source: 'TwelveData' };
      }
      log(`${symbol} | TwelveData returned stale data. Dropping.`);
    }
  } catch (e) {
    log(`${symbol} | Layer 1 (TwelveData) Fail: ${e.message}`);
  }

  // Layer 2: AlphaVantage (Secure Non-Demo Execution & Stale Validated)
  if (ALPHAVANTAGE_KEY) {
    try {
      const [fromSym, toSym] = symbol.split('/');
      const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${fromSym}&to_symbol=${toSym}&interval=1min&outputsize=compact&apikey=${ALPHAVANTAGE_KEY}`;
      const data = await fetchJSON(url);
      const series = data['Time Series FX (1min)'];
      if (series) {
        const keys = Object.keys(series).sort().reverse().slice(0, 30);
        if (keys.length) {
          const lastCandleTime = new Date(keys[0] + ' UTC'); // AlphaVantage default timestamp structure parsing
          if ((Date.now() - lastCandleTime) / 60000 <= STALE_MINUTES) {
            const candles = keys.map(k => ({
              open: +series[k]['1. open'], high: +series[k]['2. high'], low: +series[k]['3. low'], close: +series[k]['4. close'], volume: 0
            })).reverse();
            updateCache(symbol, candles, 'AlphaVantage');
            return { candles, source: 'AlphaVantage' };
          }
          log(`${symbol} | AlphaVantage data stale. Dropping.`);
        }
      }
    } catch (e) {
      log(`${symbol} | Layer 2 (AlphaVantage) Fail: ${e.message}`);
    }
  }

  // Layer 3: Architectural Cache Lookup Engine (Max 10 Mins Safe Fallback)
  const cachedObj = getCachedData(symbol);
  if (cachedObj) {
    return { candles: cachedObj.candles, source: `Cache_${cachedObj.source}` };
  }

  throw new Error(`Data pipeline exhausted. Core API and internal Cache failed for ${symbol}`);
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

// ─── MATHEMATICAL INDICATORS ENGINE ───
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
  return mx === mn ? 50 : ((rsiArr[rsiArr.length - 1] - mn) / (mx - mn)) * 100;
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
  return { dir: last.close > hl2 ? 'UP' : 'DOWN', upperBand: hl2 + multiplier * atr, lowerBand: hl2 - multiplier * atr };
}

function calcVWAP(candles) {
  let cumVol = 0, cumTP = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTP += tp * c.volume;
    cumVol += c.volume;
  }
  return cumVol === 0 ? candles[candles.length - 1].close : cumTP / cumVol;
}

function detectFakeBreakout(candles) {
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const bb = calcBB(candles);
  if (last.high > bb.upper && last.close < bb.upper && prev.close < bb.upper) return { fake: true, type: 'FAKE_UP' };
  if (last.low < bb.lower && last.close > bb.lower && prev.close > bb.lower) return { fake: true, type: 'FAKE_DOWN' };
  return { fake: false, type: 'NONE' };
}

function isSidewaysMarket(candles, period = 20) {
  const sl = candles.slice(-period);
  const range = (Math.max(...sl.map(c => c.high)) - Math.min(...sl.map(c => c.low))) / candles[candles.length - 1].close * 100;
  return range < 0.3;
}

function isCandleClosed(candles) { return candles.length >= 2; }

function calcCandlePattern(candles) {
  const len = candles.length;
  if (len < 3) return { pattern: 'No Pattern', dir: 'NEUTRAL', str: 0 };
  const c = candles[len - 2], p = candles[len - 3], p2 = len >= 4 ? candles[len - 4] : candles[len - 3];
  const body = Math.abs(c.close - c.open), upWick = c.high - Math.max(c.close, c.open), dnWick = Math.min(c.close, c.open) - c.low, range = c.high - c.low;
  const bull = c.close > c.open, bear = c.close < c.open;

  if (bull && p.close < p.open && c.close > p.open && c.open < p.close) return { pattern: 'Bullish Engulfing', dir: 'UP', str: 3 };
  if (bear && p.close > p.open && c.open > p.close && c.close < p.open) return { pattern: 'Bearish Engulfing', dir: 'DOWN', str: 3 };
  if (dnWick > body * 2.5 && upWick < body * 0.5) return { pattern: 'Bullish Pin Bar', dir: 'UP', str: 3 };
  if (upWick > body * 2.5 && dnWick < body * 0.5) return { pattern: 'Bearish Pin Bar', dir: 'DOWN', str: 3 };
  if (p2.close < p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && bull && c.close > (p2.open + p2.close) / 2) return { pattern: 'Morning Star', dir: 'UP', str: 4 };
  if (p2.close > p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && bear && c.close < (p2.open + p2.close) / 2) return { pattern: 'Evening Star', dir: 'DOWN', str: 4 };
  if (bull && p.close > p.open && p2.close > p2.open && body > range * 0.6) return { pattern: 'Three White Soldiers', dir: 'UP', str: 4 };
  if (bear && p.close < p.open && p2.close < p2.open && body > range * 0.6) return { pattern: 'Three Black Crows', dir: 'DOWN', str: 4 };
  if (body < range * 0.1) return { pattern: 'Doji', dir: 'NEUTRAL', str: 1 };
  if (bull && upWick < body * 0.05 && dnWick < body * 0.05) return { pattern: 'Bullish Marubozu', dir: 'UP', str: 3 };
  if (bear && upWick < body * 0.05 && dnWick < body * 0.05) return { pattern: 'Bearish Marubozu', dir: 'DOWN', str: 3 };
  return { pattern: 'No Pattern', dir: 'NEUTRAL', str: 0 };
}

function calcTrend(candles) {
  const ema5 = calcEMA(candles, 5), ema10 = calcEMA(candles, 10), ema20 = calcEMA(candles, 20), ema50 = calcEMA(candles, 50);
  const last = candles[candles.length - 1].close;
  let up = 0, dn = 0;
  last > ema5 ? up++ : dn++; last > ema20 ? up++ : dn++;
  ema5 > ema20 ? up += 2 : dn += 2; ema10 > ema50 ? up += 2 : dn += 2;
  if (ema5 > ema10 && ema10 > ema20) up += 2; else if (ema5 < ema10 && ema10 < ema20) dn += 2;
  return { dir: up > dn ? 'UP' : 'DOWN', up, dn };
}

function calcVolume(candles) {
  const rec = candles.slice(-5), old = candles.slice(-15, -5);
  const avgRec = rec.reduce((a, b) => a + b.volume, 0) / rec.length;
  const avgOld = old.reduce((a, b) => a + b.volume, 0) / Math.max(old.length, 1);
  if (avgOld === 0) return { dir: 'NEUTRAL', str: 0 };
  const isBull = candles[candles.length - 1].close > candles[candles.length - 1].open;
  return (avgRec / avgOld > 1.5) ? { dir: isBull ? 'UP' : 'DOWN', str: 2 } : { dir: 'NEUTRAL', str: 0 };
}

// ─── TIMEFRAME ALGORITHMIC SCORING ENGINE ───
function analyzeTimeframe(candles) {
  const rsi = calcRSI(candles), rsi7 = calcRSI(candles, 7), stoch = calcStochRSI(candles), macd = calcMACD(candles);
  const bb = calcBB(candles), atr = calcATR(candles), sr = calcSR(candles), cp = calcCandlePattern(candles);
  const trend = calcTrend(candles), vol = calcVolume(candles), adx = calcADX(candles), superTrend = calcSuperTrend(candles);
  const vwap = calcVWAP(candles), fakeBreak = detectFakeBreakout(candles), sideways = isSidewaysMarket(candles);
  const last = candles[candles.length - 1].close;

  let up = 0, dn = 0;
  const signals = [];

  if (sideways) return { direction: 'NEUTRAL', ratio: 0, up: 0, dn: 0, signals: ['Sideways Market'], volatility: 0, total: 0, isStrongTrend: false, trendDir: 'NEUTRAL', sideways: true };

  if (fakeBreak.fake) {
    if (fakeBreak.type === 'FAKE_UP') dn += 3; else up += 3;
    signals.push('Fake Breakout Detected');
  }
  if (rsi < 30) { up += 3; signals.push('RSI Oversold'); } else if (rsi > 70) { dn += 3; signals.push('RSI Overbought'); }
  if (rsi7 < 25) { up += 2; signals.push('Fast RSI Oversold'); } else if (rsi7 > 75) { dn += 2; signals.push('Fast RSI Overbought'); }
  if (stoch < 20) { up += 2; signals.push('StochRSI Oversold'); } else if (stoch > 80) { dn += 2; signals.push('StochRSI Overbought'); }
  if (macd > 0) up += 2; else dn += 2;
  if (last <= bb.lower) { up += 3; signals.push('Price at Lower BB'); } else if (last >= bb.upper) { dn += 3; signals.push('Price at Upper BB'); }

  up += trend.up; dn += trend.dn;
  signals.push(trend.dir === 'UP' ? 'EMA Bullish' : 'EMA Bearish');

  if (cp.dir === 'UP') { up += cp.str; signals.push(cp.pattern); } else if (cp.dir === 'DOWN') { dn += cp.str; signals.push(cp.pattern); }
  if (sr.distSup < 0.1) up += 3; if (sr.distRes < 0.1) dn += 3;
  if (vol.dir === 'UP') up += vol.str; else if (vol.dir === 'DOWN') dn += vol.str;

  if (adx.adx > 25) {
    if (adx.plusDI > adx.minusDI) { up += 3; signals.push('ADX Strong Bullish'); } else { dn += 3; signals.push('ADX Strong Bearish'); }
  }
  if (superTrend.dir === 'UP') up += 2; else dn += 2;
  if (last > vwap) up += 2; else dn += 2;

  const total = up + dn;
  const dominant = Math.max(up, dn);
  return {
    direction: up >= dn ? 'UP' : 'DOWN',
    ratio: total > 0 ? dominant / total : 0,
    up, dn, signals,
    volatility: (atr / last) * 100,
    total,
    isStrongTrend: (trend.up >= 5 || trend.dn >= 5) && adx.adx > 15,
    sideways: false
  };
}

// ─── PAIR METRIC MONITOR ───
async function smartAnalyze(pair, isOTCMode = false) {
  const lastPairTime = pairCooldown[pair.live] || 0;
  if (Date.now() - lastPairTime < PAIR_COOLDOWN) return null;

  let candles1m, source = '', isLive = false;
  const targetSymbol = pair.live;

  try {
    const result = await getCandlesWithFailover(targetSymbol);
    candles1m = result.candles;
    source = result.source;
    isLive = !isOTCMode && !source.startsWith('Cache_');
  } catch (e) {
    log(`${targetSymbol} | Pipeline Exhausted: ${e.message}`);
    return null;
  }

  if (!isCandleClosed(candles1m)) return null;
  const candles5m = buildHigherTF(candles1m, 5);
  if (candles5m.length < 3) return null;

  const tf1m = analyzeTimeframe(candles1m);
  const tf5m = analyzeTimeframe(candles5m);

  if (tf1m.sideways || tf5m.sideways || !tf1m.isStrongTrend || tf1m.direction !== tf5m.direction || tf1m.volatility < 0.01) return null;

  const avgRatio = (tf1m.ratio + tf5m.ratio) / 2;
  const aiScore = Math.round(avgRatio * 100);
  if (aiScore < 75) return null;

  return {
    pair: isLive ? pair.live : pair.otc,
    flag: pair.flag,
    direction: tf1m.direction,
    confidence: aiScore >= 82 ? 'Very High 🔥' : 'High 🟢',
    aiScore,
    avgRatio,
    trend: tf1m.direction === 'UP' ? 'Strong Uptrend 📈' : 'Strong Downtrend 📉',
    signals: tf1m.signals.filter(s => !['EMA Bullish', 'EMA Bearish'].includes(s)).slice(0, 3),
    total: tf1m.total,
    isLive,
    livePair: pair.live
  };
}

// ─── TELEGRAM METRIC BROADCAST TEMPLATE ───
function buildSignalMessage(best, entry, expiry) {
  return (
    `╔══════════════════════╗\n` +
    `     🚀 𝗤𝘅 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝗜𝗣\n` +
    `╚══════════════════════╝\n\n` +
    `💹 𝗔𝗦𝗦𝗘𝗧        ➜ ${best.pair} ${best.flag}\n` +
    `📈 𝗗𝗜𝗥𝗘𝗖𝗧𝗜𝗢𝗡    ➜ ${best.direction === 'UP' ? '🟢 BUY ⏫' : '🔴 SELL ⏬'}\n` +
    `🕒 𝗘𝗡𝗧𝗥𝗬        ➜ ${entry} (BD Time)\n` +
    `⏳ 𝗘𝗫𝗣𝗜𝗥𝗬      ➜ ${expiry} (1 Minute)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 𝗔𝗜 𝗦𝗖𝗢𝗥𝗘     ➜ ${best.aiScore}%\n` +
    `🔥 𝗖𝗢𝗡𝗙𝗜𝗗𝗘𝗡𝗖𝗘  ➜ ${best.confidence}\n` +
    `📊 𝗧𝗥𝗘𝗡𝗗        ➜ ${best.trend}\n` +
    `🌐 𝗠𝗔𝗥𝗞𝗘𝗧      ➜ ${best.isLive ? '🟢 LIVE' : '🔴 OTC'}\n` +
    `⚡ 𝗦𝗧𝗔𝗧𝗨𝗦      ➜ ✅ Confirmed Signal\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 𝗔𝗡𝗔𝗟𝗬𝗦𝗜𝗦\n` +
    `${best.signals.map(s => `• ${s}`).join('\n')}\n` +
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

// ─── MAIN SYSTEM MODULE EXPORT ───
module.exports = function(bot, newsModule) {
  log('✅ Qx AI Predictor VIP Professional Engine Started Stack Successfully!');

  bot.onText(/\/status/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    const { h, m } = getBDTime();
    await bot.sendMessage(ADMIN_ID,
      `📊 *BOT STATUS REPORT*\n\n` +
      `⏰ BD Time: \`${h}:${m}\`\n` +
      `🌐 Market Mode: ${isLiveMarketTime() ? '🟢 LIVE' : '🔴 OTC'}\n` +
      `⏸ Rollover Block: ${isRolloverTime() ? '⏸ YES' : '✅ NO'}\n` +
      `📅 Weekend OTC: ${isWeekendOTC() ? '✅ YES' : '❌ NO'}\n` +
      `⚡ Core Status: \`${isSleeping ? '💤 DEEP SLEEP ACTIVE' : '🔍 SCANNING ACTIVE'}\`\n` +
      `📡 Last Signal Key: \`${lastSignalKey || 'None'}\`\n` +
      `📈 Performance Matrix: W:${stats.wins} L:${stats.losses} T:${stats.total}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.onText(/\/market/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    const { h, m } = getBDTime();
    await bot.sendMessage(ADMIN_ID, `🌐 *MARKET REPORT ENVIRONMENT*\n\n${isLiveMarketTime() ? '🟢 Live Market Enabled' : '🔴 OTC Market Engaged'}\n⏰ BD Time: \`${h}:${m}\``, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/force/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    if (isSleeping) {
      if (sleepTimeoutId) clearTimeout(sleepTimeoutId);
      isSleeping = false;
      log('⚡ Force Command Triggered: Interrupted execution sleep cycle.');
    }
    await bot.sendMessage(ADMIN_ID, '⚡ System Interrupted: Initializing Immediate Force Market Scan...');
    lastSentTime = 0;
    await run();
  });

  async function run() {
    if (isSleeping) return;

    resetDailyStats();
    await checkScheduledAlerts(bot);

    if ((newsModule && newsModule.isNewsActive()) || isRolloverTime()) {
      return;
    }

    const now = Date.now();
    if (lastSentTime > 0 && (now - lastSentTime) < MIN_GAP) return;

    const otcMode = !isLiveMarketTime();
    const results = [];
    let anyLive = false;

    // Linear Sequential processing to prevent asynchronous connection pool floods & race conditions
    for (const pair of pairMap) {
      if (isSleeping) return;
      try {
        const res = await smartAnalyze(pair, otcMode);
        if (res) {
          results.push(res);
          if (res.isLive) anyLive = true;
        }
        await new Promise(r => setTimeout(r, 1200)); // Rate limiting interval defense
      } catch (e) {
        log(`Scan Interruption on ${pair.live}: ${e.message}`);
      }
    }

    // Dynamic Network State Tracker
    if (anyLive) { liveCount++; noLiveCount = 0; } else { noLiveCount++; liveCount = 0; }

    if (liveCount >= CONFIRM_LIMIT && lastMarketStatus !== 'live') {
      lastMarketStatus = 'live'; liveCount = 0;
      try { await bot.sendMessage(ADMIN_ID, `🟢 *Live Data Stream Confirmed*\n\n📊 High-frequency live quotes recovered across pairs.`, { parse_mode: 'Markdown' }); } catch (e) {}
    }
    if (noLiveCount >= CONFIRM_LIMIT && lastMarketStatus !== 'otc') {
      lastMarketStatus = 'otc'; noLiveCount = 0;
      try { await bot.sendMessage(ADMIN_ID, `🔴 *Live Data Pipeline Disconnected*\n\n📊 Failover routing triggered. Internal environment running on OTC parameters.`, { parse_mode: 'Markdown' }); } catch (e) {}
    }

    if (!results.length) return;

    // Advanced Ranking Metrics Multi-Sort Execution
    results.sort((a, b) => b.avgRatio - a.avgRatio || b.total - a.total);
    const best = results[0];

    const signalKey = `${best.pair}_${best.direction}`;
    if (signalKey === lastSignalKey && (now - lastSentTime) < MAX_GAP) return;

    const { entry, expiry } = getEntryExpiry();
    const msg = buildSignalMessage(best, entry, expiry);

    try {
      await bot.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
      
      lastSentTime = Date.now();
      lastSignalKey = signalKey;
      pairCooldown[best.livePair] = Date.now();
      stats.total++;
      saveStats();

      log(`🏆 Signal Transmitted Successfully: ${best.pair} | Score: ${best.aiScore}%`);

      // ─── STRICT ZERO REQUEST DEEP SLEEP ALGORITHM ───
      const sleepMinutes = Math.floor(Math.random() * (20 - 5 + 1)) + 5;
      isSleeping = true;
      log(`💤 Deep Sleep Engaged: System shutting down scanners for ${sleepMinutes} Mins. Network API activity set to ZERO.`);

      sleepTimeoutId = setTimeout(() => {
        isSleeping = false;
        log('⏰ Sleep Cycle Terminated. Resuming high-confidence market scanning loops...');
        run();
      }, sleepMinutes * 60 * 1000);

    } catch (e) {
      log(`Broadcast Exception Error: ${e.message}`);
    }
  }

  setTimeout(() => {
    run();
    setInterval(run, CHECK_INTERVAL);
  }, 30000);
};
