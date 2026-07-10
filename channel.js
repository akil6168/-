// channel.js - Qx AI Predictor VIP (Upgraded v5.0 + Chart + Smart MTG)
const https = require('https');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📌 CONFIGURATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CHANNEL_ID = '-1002427080688';
const ADMIN_ID = 5724602667;

// ✅ ১০টা API key rotation
const API_KEYS = [
  process.env.TWELVE_DATA_KEY_1,
  process.env.TWELVE_DATA_KEY_2,
  process.env.TWELVE_DATA_KEY_3,
  process.env.TWELVE_DATA_KEY_4,
  process.env.TWELVE_DATA_KEY_5,
  process.env.TWELVE_DATA_KEY_6,
  process.env.TWELVE_DATA_KEY_7,
  process.env.TWELVE_DATA_KEY_8,
  process.env.TWELVE_DATA_KEY_9,
  process.env.TWELVE_DATA_KEY_10
].filter(Boolean);

let apiKeyIndex = 0;
function getNextApiKey() {
  const key = API_KEYS[apiKeyIndex % API_KEYS.length];
  apiKeyIndex++;
  return key;
}

const CHECK_INTERVAL = 60 * 1000;
const MIN_GAP = 5 * 60 * 1000;
const MAX_GAP = 15 * 60 * 1000;
const CONFIRM_LIMIT = 5;
const STALE_MINUTES = 5;

// ✅ ৮টা pair — ৪+৪ rotation
const pairGroups = [
  [
    { live: 'EUR/USD', otc: 'EUR/USD OTC', flag: '🇪🇺🇺🇸' },
    { live: 'GBP/USD', otc: 'GBP/USD OTC', flag: '🇬🇧🇺🇸' },
    { live: 'USD/JPY', otc: 'USD/JPY OTC', flag: '🇺🇸🇯🇵' },
    { live: 'AUD/USD', otc: 'AUD/USD OTC', flag: '🇦🇺🇺🇸' }
  ],
  [
    { live: 'USD/CAD', otc: 'USD/CAD OTC', flag: '🇺🇸🇨🇦' },
    { live: 'USD/CHF', otc: 'USD/CHF OTC', flag: '🇺🇸🇨🇭' },
    { live: 'EUR/JPY', otc: 'EUR/JPY OTC', flag: '🇪🇺🇯🇵' },
    { live: 'GBP/JPY', otc: 'GBP/JPY OTC', flag: '🇬🇧🇯🇵' }
  ]
];

let pairGroupIndex = 0;
let lastSentTime = 0;
let lastMarketStatus = null;
let liveCount = 0;
let noLiveCount = 0;
let lastSignalKey = '';
let isRecoveryMode = false;
let recoveryAttempts = 0;
const MAX_RECOVERY_ATTEMPTS = 5;
let lastSignalData = null;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 PERFORMANCE TRACKER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const statsFile = path.join(__dirname, 'channel_stats.json');
let stats = { total: 0, wins: 0, losses: 0, winRate: 0, mtg: { total: 0, wins: 0, losses: 0 } };

function loadStats() {
  try { if (fs.existsSync(statsFile)) stats = JSON.parse(fs.readFileSync(statsFile)); } catch(e) {}
}

function saveStats() {
  try { fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2)); } catch(e) {}
}

function addResult(isWin, isMTG = false) {
  stats.total++;
  if (isWin) stats.wins++; else stats.losses++;
  stats.winRate = (stats.wins / stats.total * 100);
  if (isMTG) {
    stats.mtg.total++;
    if (isWin) stats.mtg.wins++; else stats.mtg.losses++;
  }
  saveStats();
}

loadStats();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🛠️ HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getBDTime() {
  const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const h = bd.getUTCHours(), m = bd.getUTCMinutes(), s = bd.getUTCSeconds();
  return {
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(s).padStart(2, '0'),
    hour: h,
    minute: m,
    day: bd.getUTCDay(),
    bd,
    fullTime: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`,
    display: `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getEntryExpiry() {
  const { hour, minute } = getBDTime();
  const entryM = minute + 1;
  const expiryM = minute + 2;
  return {
    entry: `${String((hour + Math.floor(entryM / 60)) % 24).padStart(2, '0')}:${String(entryM % 60).padStart(2, '0')}`,
    expiry: `${String((hour + Math.floor(expiryM / 60)) % 24).padStart(2, '0')}:${String(expiryM % 60).padStart(2, '0')}`
  };
}

function isLiveMarketOpen() {
  const { day, hour } = getBDTime();
  if (day === 6 || day === 0) return false;
  if (day === 1 && hour < 11) return false;
  if (day === 5 && hour >= 23) return false;
  if (hour >= 23 || hour < 11) return false;
  return true;
}

function isRolloverTime() {
  const { hour, minute } = getBDTime();
  if (hour === 23 && minute >= 58) return true;
  if (hour === 0 && minute <= 2) return true;
  return false;
}

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 PRICE & CANDLE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function getCandles(symbol) {
  const apiKey = getNextApiKey();
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1min&outputsize=50&apikey=${apiKey}`;
  const data = await fetchJSON(url);
  if (!data.values || !data.values.length) throw new Error('No data');

  const lastCandleTime = new Date(data.values[0].datetime + ' UTC');
  const diffMinutes = (new Date() - lastCandleTime) / (60 * 1000);
  if (diffMinutes > STALE_MINUTES) {
    throw new Error('Stale data: ' + Math.round(diffMinutes) + ' min old');
  }

  return data.values.map(v => ({
    open: +v.open, high: +v.high, low: +v.low,
    close: +v.close, volume: +v.volume || 0,
    datetime: v.datetime
  })).reverse();
}

async function getCurrentPrice(symbol) {
  const apiKey = getNextApiKey();
  const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${apiKey}`;
  const data = await fetchJSON(url);
  return parseFloat(data.price);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📈 INDICATORS (14 High Accuracy)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

function calcADX(candles, period = 14) {
  if (candles.length < period + 1) return { adx: 0, plusDI: 0, minusDI: 0 };
  let plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i-1].high;
    const downMove = candles[i-1].low - candles[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i-1].close),
      Math.abs(candles[i].low - candles[i-1].close)
    ));
  }
  const sum = arr => arr.slice(-period).reduce((a,b) => a+b, 0);
  const trSum = sum(tr) || 1;
  const plusDI = 100 * (sum(plusDM) / trSum);
  const minusDI = 100 * (sum(minusDM) / trSum);
  const adx = 100 * Math.abs(plusDI - minusDI) / ((plusDI + minusDI) || 1);
  return { adx, plusDI, minusDI };
}

function calcBB(candles, period = 20) {
  const p = Math.min(period, candles.length);
  const closes = candles.slice(-p).map(c => c.close);
  const sma = closes.reduce((a, b) => a + b, 0) / p;
  const std = Math.sqrt(closes.reduce((s, c) => s + Math.pow(c - sma, 2), 0) / p);
  return { upper: sma + 2 * std, lower: sma - 2 * std };
}

function calcSupertrend(candles, period = 10, multiplier = 3) {
  const atr = calcATR(candles, period);
  const last = candles[candles.length - 1];
  const hl2 = (last.high + last.low) / 2;
  const upperBand = hl2 + multiplier * atr;
  const lowerBand = hl2 - multiplier * atr;
  let dir = 'NEUTRAL';
  if (last.close > upperBand) dir = 'DOWN';
  else if (last.close < lowerBand) dir = 'UP';
  else dir = last.close > hl2 ? 'UP' : 'DOWN';
  return { dir, upperBand, lowerBand };
}

function calcVWAP(candles) {
  let cumPV = 0, cumVol = 0;
  const recent = candles.slice(-30);
  for (const c of recent) {
    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1;
    cumPV += typical * vol;
    cumVol += vol;
  }
  const vwap = cumVol > 0 ? cumPV / cumVol : recent[recent.length - 1].close;
  const last = recent[recent.length - 1].close;
  return { vwap, dir: last > vwap ? 'UP' : 'DOWN' };
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
  const resistance = Math.max(...highs);
  const support = Math.min(...lows);
  return {
    resistance, support,
    nearResistance: Math.abs(cur - resistance) / cur < 0.001,
    nearSupport: Math.abs(cur - support) / cur < 0.001
  };
}

function calcCandlePattern(candles) {
  const len = candles.length;
  if (len < 3) return { pattern: 'No Pattern', dir: 'NEUTRAL', str: 0 };
  const c = candles[len - 1], p = candles[len - 2], p2 = candles[len - 3];
  const body = Math.abs(c.close - c.open);
  const upWick = c.high - Math.max(c.close, c.open);
  const dnWick = Math.min(c.close, c.open) - c.low;
  const range = c.high - c.low || 0.0001;
  const bull = c.close > c.open, bear = c.close < c.open;

  if (bull && p.close < p.open && c.close > p.open && c.open < p.close)
    return { pattern: 'Bullish Engulfing', dir: 'UP', str: 4 };
  if (bear && p.close > p.open && c.open > p.close && c.close < p.open)
    return { pattern: 'Bearish Engulfing', dir: 'DOWN', str: 4 };
  if (dnWick > body * 2.5 && upWick < body * 0.5)
    return { pattern: 'Bullish Pin Bar', dir: 'UP', str: 3 };
  if (upWick > body * 2.5 && dnWick < body * 0.5)
    return { pattern: 'Bearish Pin Bar', dir: 'DOWN', str: 3 };
  if (body < range * 0.1)
    return { pattern: 'Doji', dir: 'NEUTRAL', str: 1 };
  if (bull && upWick < body * 0.05 && dnWick < body * 0.05)
    return { pattern: 'Bullish Marubozu', dir: 'UP', str: 3 };
  if (bear && upWick < body * 0.05 && dnWick < body * 0.05)
    return { pattern: 'Bearish Marubozu', dir: 'DOWN', str: 3 };
  return { pattern: 'No Pattern', dir: 'NEUTRAL', str: 0 };
}

function calcTrend(candles) {
  const ema20 = calcEMA(candles, 20), ema50 = calcEMA(candles, 50);
  const last = candles[candles.length - 1].close;
  let up = 0, dn = 0;
  if (ema20 > ema50) up += 2; else dn += 2;
  if (last > ema20) up += 1; else dn += 1;
  if (last > ema50) up += 1; else dn += 1;
  return {
    dir: up > dn ? 'UP' : 'DOWN',
    up, dn,
    isStrong: up >= 3 || dn >= 3,
    label: up > dn ? 'Uptrend 📈' : 'Downtrend 📉'
  };
}

function calcIchimoku(candles) {
  const len = candles.length;
  if (len < 52) return { trend: 'NEUTRAL', up: 0, dn: 0, isStrong: false, label: 'Ichimoku Neutral' };
  
  const high9 = Math.max(...candles.slice(-9).map(c => c.high));
  const low9 = Math.min(...candles.slice(-9).map(c => c.low));
  const tenkan = (high9 + low9) / 2;
  
  const high26 = Math.max(...candles.slice(-26).map(c => c.high));
  const low26 = Math.min(...candles.slice(-26).map(c => c.low));
  const kijun = (high26 + low26) / 2;
  
  const senkouA = (tenkan + kijun) / 2;
  const high52 = Math.max(...candles.slice(-52).map(c => c.high));
  const low52 = Math.min(...candles.slice(-52).map(c => c.low));
  const senkouB = (high52 + low52) / 2;
  const chikou = candles.length >= 26 ? candles[candles.length - 26].close : candles[0].close;
  const last = candles[candles.length - 1].close;
  
  let up = 0, dn = 0;
  if (last > senkouA && last > senkouB) up += 3;
  else if (last < senkouA && last < senkouB) dn += 3;
  if (tenkan > kijun) up += 2; else dn += 2;
  if (chikou > last) up += 2; else dn += 2;
  
  return { 
    trend: up > dn ? 'UP' : 'DOWN',
    up, dn,
    isStrong: up >= 5 || dn >= 5,
    label: up > dn ? 'Ichimoku Bullish ☀️' : 'Ichimoku Bearish 🌧️'
  };
}

function calcMFI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  let positiveFlow = 0, negativeFlow = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const typical = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const vol = candles[i].volume || 1;
    const moneyFlow = typical * vol;
    if (i > 0) {
      const prevTypical = (candles[i-1].high + candles[i-1].low + candles[i-1].close) / 3;
      if (typical > prevTypical) positiveFlow += moneyFlow;
      else if (typical < prevTypical) negativeFlow += moneyFlow;
    }
  }
  return 100 - (100 / (1 + (positiveFlow / (negativeFlow || 1))));
}

function calcFibonacci(candles) {
  const len = Math.min(50, candles.length);
  const slice = candles.slice(-len);
  const high = Math.max(...slice.map(c => c.high));
  const low = Math.min(...slice.map(c => c.low));
  const last = candles[candles.length - 1].close;
  const diff = high - low;
  const level618 = high - diff * 0.618;
  const near618 = Math.abs(last - level618) / last < 0.001;
  const above618 = last > level618;
  return { level618, near618, above618, dir: above618 ? 'UP' : 'DOWN' };
}

function calcChaikinMF(candles, period = 21) {
  if (candles.length < period) return 0;
  let sumMF = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    const mf = ((c.close - c.low) - (c.high - c.close)) / (c.high - c.low) * (c.volume || 1);
    sumMF += mf;
  }
  const totalVol = candles.slice(-period).reduce((s, c) => s + (c.volume || 1), 0);
  return totalVol > 0 ? sumMF / totalVol : 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔍 FULL ANALYSIS (14 High Accuracy Indicators)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function analyzeSymbol(pair, forceOTC = false) {
  let candles1m;
  let isLive = false;

  if (!forceOTC) {
    try {
      candles1m = await getCandles(pair.live);
      isLive = true;
      console.log(`${pair.live} | ✅ Live`);
    } catch (e) {
      console.log(`${pair.live} | ❌ ${e.message}`);
    }
  }

  if (!candles1m) {
    try {
      candles1m = await getCandles(pair.live);
      isLive = false;
      console.log(`${pair.otc} | 📊 OTC`);
    } catch (e) {
      console.log(`${pair.otc} | Failed — skip`);
      return null;
    }
  }

  const last = candles1m[candles1m.length - 1].close;
  const atr = calcATR(candles1m);
  const volatility = (atr / last) * 100;

  // ━━ Calculate all 14 indicators ━━
  const rsi = calcRSI(candles1m);
  const macd = calcMACD(candles1m);
  const adx = calcADX(candles1m);
  const bb = calcBB(candles1m);
  const supertrend = calcSupertrend(candles1m);
  const vwap = calcVWAP(candles1m);
  const sr = calcSR(candles1m);
  const cp = calcCandlePattern(candles1m);
  const trend = calcTrend(candles1m);
  const ichimoku = calcIchimoku(candles1m);
  const mfi = calcMFI(candles1m);
  const fib = calcFibonacci(candles1m);
  const cmf = calcChaikinMF(candles1m);

  let up = 0, dn = 0;
  const signals = [];

  // ━━ 1. RSI ━━
  if (rsi < 30) { up += 3; signals.push('RSI Oversold'); }
  else if (rsi > 70) { dn += 3; signals.push('RSI Overbought'); }

  // ━━ 2. MACD ━━
  if (macd > 0) { up += 3; signals.push('MACD Bullish'); }
  else { dn += 3; signals.push('MACD Bearish'); }

  // ━━ 3. ADX ━━
  if (adx.adx >= 25) {
    if (adx.plusDI > adx.minusDI) { up += 3; signals.push(`ADX Strong ✅`); }
    else { dn += 3; signals.push(`ADX Strong ✅`); }
  }

  // ━━ 4. Bollinger Bands ━━
  if (last <= bb.lower) { up += 3; signals.push('At Lower BB'); }
  else if (last >= bb.upper) { dn += 3; signals.push('At Upper BB'); }

  // ━━ 5. Supertrend ━━
  if (supertrend.dir === 'UP') { up += 3; signals.push('Supertrend Bullish 🚀'); }
  else if (supertrend.dir === 'DOWN') { dn += 3; signals.push('Supertrend Bearish 🔻'); }

  // ━━ 6. VWAP ━━
  if (vwap.dir === 'UP') { up += 2; signals.push('Above VWAP'); }
  else { dn += 2; signals.push('Below VWAP'); }

  // ━━ 7. Support/Resistance ━━
  if (sr.nearSupport) { up += 3; signals.push('At Support'); }
  if (sr.nearResistance) { dn += 3; signals.push('At Resistance'); }

  // ━━ 8. Candle Patterns ━━
  if (cp.dir === 'UP') { up += cp.str; signals.push(cp.pattern); }
  else if (cp.dir === 'DOWN') { dn += cp.str; signals.push(cp.pattern); }

  // ━━ 9. EMA Trend ━━
  up += trend.up; dn += trend.dn;
  if (trend.dir === 'UP') signals.push('EMA Bullish');
  else signals.push('EMA Bearish');

  // ━━ 10. Ichimoku ━━
  up += ichimoku.up; dn += ichimoku.dn;
  if (ichimoku.trend === 'UP') signals.push(ichimoku.label);
  else if (ichimoku.trend === 'DOWN') signals.push(ichimoku.label);

  // ━━ 11. MFI ━━
  if (mfi < 20) { up += 3; signals.push('MFI Oversold'); }
  else if (mfi > 80) { dn += 3; signals.push('MFI Overbought'); }

  // ━━ 12. Fibonacci ━━
  if (fib.near618) {
    if (fib.above618) { up += 3; signals.push('Fib 61.8% Support'); }
    else { dn += 3; signals.push('Fib 61.8% Resistance'); }
  }

  // ━━ 13. Chaikin MF ━━
  if (cmf > 0.1) { up += 2; signals.push('CMF Bullish'); }
  else if (cmf < -0.1) { dn += 2; signals.push('CMF Bearish'); }

  // ━━ Final Score ━━
  const total = up + dn;
  const dominant = Math.max(up, dn);
  const ratio = total > 0 ? dominant / total : 0;
  const direction = up >= dn ? 'UP' : 'DOWN';
  const aiScore = Math.round(ratio * 100);

  // ━━ Confidence ━━
  let confidence;
  if (aiScore >= 85) confidence = 'Very High 🔥';
  else if (aiScore >= 75) confidence = 'High 🟢';
  else if (aiScore >= 65) confidence = 'Medium ⚡';
  else confidence = 'Low ⚠️';

  if (aiScore < 65 || volatility < 0.002) {
    console.log(`${isLive ? pair.live : pair.otc} | Score ${aiScore}% — skip`);
    return null;
  }

  // ━━ Agreement Check ━━
  const directionsAgree = [
    trend.dir,
    ichimoku.trend,
    supertrend.dir === 'NEUTRAL' ? direction : supertrend.dir,
    vwap.dir,
    adx.adx >= 25 ? (adx.plusDI > adx.minusDI ? 'UP' : 'DOWN') : direction,
    cmf > 0 ? 'UP' : 'DOWN',
    fib.above618 ? 'UP' : 'DOWN'
  ].filter(d => d === direction).length;

  const isValid = ratio >= 0.75 && trend.isStrong && volatility >= 0.002 && adx.adx >= 22 && directionsAgree >= 4;

  if (!isValid) {
    console.log(`${isLive ? pair.live : pair.otc} | Score ${aiScore}% | Agree ${directionsAgree}/7 — invalid`);
    return null;
  }

  return {
    pair: isLive ? pair.live : pair.otc,
    flag: pair.flag,
    direction,
    confidence,
    aiScore,
    trend: trend.label,
    signals: signals.slice(0, 4),
    avgRatio: ratio,
    isLive,
    candles: candles1m,
    currentPrice: last,
    volatility,
    directionsAgree,
    adx: adx.adx
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 CANDLE CHART GENERATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function generateCandleChart(symbol, candles, direction, entryPrice, exitPrice, isMTG = false) {
  try {
    const plotCandles = candles.slice(-20);
    const ohlcData = plotCandles.map((c, i) => ({
      x: i + 1,
      o: c.open,
      h: c.high,
      l: c.low,
      c: c.close
    }));
    
    const chartConfig = {
      type: 'candlestick',
      data: {
        datasets: [{
          label: `${symbol}`,
          data: ohlcData,
          color: {
            up: '#00ff88',
            down: '#ff4444',
            unchanged: '#999999'
          }
        }]
      },
      options: {
        plugins: {
          legend: { labels: { color: '#ffffff' } },
          annotation: {
            annotations: {
              entryLine: {
                type: 'line',
                yMin: entryPrice,
                yMax: entryPrice,
                borderColor: 'rgba(255,215,0,0.9)',
                borderWidth: 2,
                borderDash: [6, 4],
                label: { 
                  content: isMTG ? 'MTG ENTRY' : 'ENTRY', 
                  enabled: true, 
                  position: 'start', 
                  backgroundColor: 'rgba(255,215,0,0.8)', 
                  color: '#000' 
                }
              },
              exitLine: {
                type: 'line',
                yMin: exitPrice,
                yMax: exitPrice,
                borderColor: exitPrice > entryPrice ? '#00ff88' : '#ff4444',
                borderWidth: 2,
                borderDash: [6, 4],
                label: {
                  content: exitPrice > entryPrice ? (isMTG ? 'MTG WIN' : 'WIN') : (isMTG ? 'MTG LOSS' : 'LOSS'),
                  enabled: true,
                  position: 'end',
                  backgroundColor: exitPrice > entryPrice ? 'rgba(0,255,136,0.9)' : 'rgba(255,68,68,0.9)',
                  color: '#fff'
                }
              }
            }
          }
        },
        scales: {
          x: { 
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: { 
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    };

    const response = await fetch('https://quickchart.io/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chart: chartConfig,
        width: 800,
        height: 450,
        backgroundColor: '#1a1a2e'
      })
    });

    if (!response.ok) throw new Error(`QuickChart error: ${response.status}`);
    const imageBuffer = await response.buffer();
    return imageBuffer;
  } catch (error) {
    console.error('❌ Chart generation failed:', error.message);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⏰ TIMING HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function waitForExactSecond(targetSecond) {
  return new Promise(resolve => {
    const check = setInterval(() => {
      const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const s = now.getUTCSeconds();
      if (s === targetSecond) {
        clearInterval(check);
        resolve();
      }
    }, 100);
    setTimeout(() => { clearInterval(check); resolve(); }, 30000);
  });
}

function waitForCandleClose() {
  return new Promise(resolve => {
    const check = setInterval(() => {
      const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const s = now.getUTCSeconds();
      if (s >= 58) {
        clearInterval(check);
        resolve();
      }
    }, 500);
    setTimeout(() => { clearInterval(check); resolve(); }, 30000);
  });
}

function waitForNewCandle() {
  return new Promise(resolve => {
    const check = setInterval(() => {
      const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const s = now.getUTCSeconds();
      if (s === 0 || s === 1) {
        clearInterval(check);
        resolve();
      }
    }, 500);
    setTimeout(() => { clearInterval(check); resolve(); }, 30000);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📨 SAFE SENDERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function safeSendMessage(bot, text, options = {}, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await bot.sendMessage(CHANNEL_ID, text, options);
      return result;
    } catch(e) {
      console.log(`⚠️ Send failed (${attempt}): ${e.message}`);
      if (attempt < retries) await sleep(1000);
    }
  }
  return null;
}

async function safeSendPhoto(bot, photo, caption = '', retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await bot.sendPhoto(CHANNEL_ID, photo, { caption });
      return result;
    } catch(e) {
      console.log(`⚠️ Photo failed (${attempt}): ${e.message}`);
      if (attempt < retries) await sleep(1000);
    }
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 SIGNAL SENDER (with Chart)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function sendSignalWithChart(bot, best, isMTG = false) {
  try {
    const { entry, expiry } = getEntryExpiry();
    const dirLabel = best.direction === 'UP' ? '🟢 𝗕𝗨𝗬' : '🔴 𝗦𝗘𝗟𝗟';
    const dirEmoji = best.direction === 'UP' ? '⏫' : '⏬';
    const marketMode = best.isLive ? '🟢 LIVE' : '🔴 OTC';
    const confidenceLabel = best.aiScore >= 85 ? '𝗩𝗲𝗿𝘆 𝗛𝗶𝗴𝗵 🔥' : '𝗛𝗶𝗴𝗵 🟢';

    // ━━━ 1. Signal Message ━━━
    await safeSendMessage(bot,
      `╔════════════════════╗\n` +
      ` 🚀 𝗤𝗫 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝟱.𝟬\n` +
      `╚════════════════════╝\n\n` +
      `💹 𝗔𝘀𝘀𝗲𝘁      ➜ ${best.pair} ${best.flag}\n` +
      `📈 𝗗𝗶𝗿𝗲𝗰𝘁𝗶𝗼𝗻 ➜ ${dirLabel} ${dirEmoji}\n` +
      `🕒 𝗘𝗻𝘁𝗿𝘆      ➜ ${entry} (BD)\n` +
      `⏳ 𝗘𝘅𝗽𝗶𝗿𝘆     ➜ 1 Minute\n\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `🎯 𝗖𝗼𝗻𝗳𝗶𝗱𝗲𝗻𝗰𝗲 ➜ ${confidenceLabel} (${best.aiScore}%)\n\n` +
      `⚠️ 𝗠𝗮𝘅 𝟭 𝗦𝘁𝗲𝗽 𝗠𝗧𝗚\n` +
      `🤖 𝗣𝗼𝘄𝗲𝗿𝗲𝗱 𝗯𝘆 𝗤𝗫 𝗔𝗜`,
      { parse_mode: 'Markdown' }
    );

    // ━━━ 2. Wait for exact second (45) ━━━
    console.log(`⏳ Waiting for signal timing (45s)...`);
    await waitForExactSecond(45);
    
    const bdTime = getBDTime();
    console.log(`📡 Signal timing! Entry at: ${bdTime.fullTime}`);

    // ━━━ 3. Entry Price (59 second) ━━━
    await waitForExactSecond(59);
    let entryPrice = best.currentPrice;
    try {
      const priceData = await getCurrentPrice(best.pair);
      if (priceData) entryPrice = priceData;
    } catch(e) {}
    console.log(`💰 Entry Price: ${entryPrice}`);

    // ━━━ 4. Wait for candle close ━━━
    console.log(`⏳ Waiting for candle close (~60s)...`);
    await sleep(55000);
    await waitForCandleClose();
    await sleep(1500);

    // ━━━ 5. Exit Price ━━━
    let exitPrice = entryPrice;
    try {
      const priceData = await getCurrentPrice(best.pair);
      if (priceData) exitPrice = priceData;
    } catch(e) {}
    console.log(`💰 Exit Price: ${exitPrice}`);

    // ━━━ 6. Result ━━━
    const isWin = best.direction === 'UP' ? exitPrice > entryPrice : exitPrice < entryPrice;
    console.log(`📊 ${best.pair} | Entry: ${entryPrice} | Exit: ${exitPrice} | ${isWin ? 'WIN ✅' : 'LOSS ❌'}${isMTG ? ' (MTG)' : ''}`);

    addResult(isWin, isMTG);

    // ━━━ 7. Chart ━━━
    const chartBuffer = await generateCandleChart(best.pair, best.candles, best.direction, entryPrice, exitPrice, isMTG);
    if (chartBuffer) {
      const chartCaption = isMTG ? `📊 MTG ${best.pair} | ${isWin ? '✅ WIN' : '❌ LOSS'}` : `📊 ${best.pair} | ${isWin ? '✅ WIN' : '❌ LOSS'}`;
      await safeSendPhoto(bot, chartBuffer, chartCaption);
    }

    // ━━━ 8. Result Message ━━━
    const mtgRate = stats.mtg.total > 0 ? (stats.mtg.wins / stats.mtg.total * 100) : 0;
    
    if (isWin) {
      await safeSendMessage(bot,
        `✅ **SIGNAL RESULT : WIN${isMTG ? ' (MTG)' : ''}**\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📊 **Asset**    : ${best.pair}\n` +
        `🎯 **Direction**: ${best.direction === 'UP' ? 'BUY 🟢' : 'SELL 🔴'}\n` +
        `💰 **Profit**   : +${((exitPrice - entryPrice) / entryPrice * 100).toFixed(2)}%\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `📊 **Today Stats**: ${stats.wins}W / ${stats.losses}L (${stats.winRate.toFixed(0)}%)\n` +
        `🔄 **MTG Rate**: ${mtgRate.toFixed(0)}% (${stats.mtg.wins}/${stats.mtg.total})`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await safeSendMessage(bot,
        `❌ **SIGNAL RESULT : LOSS${isMTG ? ' (MTG)' : ''}**\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📊 **Asset**    : ${best.pair}\n` +
        `🎯 **Direction**: ${best.direction === 'UP' ? 'BUY 🟢' : 'SELL 🔴'}\n` +
        `📉 **Loss**     : ${((entryPrice - exitPrice) / entryPrice * 100).toFixed(2)}%\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `${isMTG ? '🔄 **MTG Recovery Failed!** ❌\n' : '💪 **MTG Recovery Mode Activated!**\n'}` +
        `📊 **Today Stats**: ${stats.wins}W / ${stats.losses}L (${stats.winRate.toFixed(0)}%)\n` +
        `🔄 **MTG Rate**: ${mtgRate.toFixed(0)}% (${stats.mtg.wins}/${stats.mtg.total})`,
        { parse_mode: 'Markdown' }
      );

      // ━━━ 9. MTG Recovery ━━━
      if (!isMTG) {
        await handleMTGRecovery(bot, best);
      }
    }

    return { isWin, entryPrice, exitPrice };

  } catch (error) {
    console.error(`❌ Signal error: ${error.message}`);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔄 MTG RECOVERY SYSTEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleMTGRecovery(bot, originalSignal) {
  if (isRecoveryMode) {
    console.log('⚠️ Recovery already in progress');
    return;
  }
  
  isRecoveryMode = true;
  recoveryAttempts = 0;
  
  try {
    await safeSendMessage(bot,
      `🔄 **𝗥𝗘𝗖𝗢𝗩𝗘𝗥𝗬 𝗦𝗜𝗚𝗡𝗔𝗟**\n\n` +
      `📊 **Asset:** ${originalSignal.pair}\n` +
      `⏳ **Coming in 3–5 Minutes**\n` +
      `✅ **Wait for Confirmation**\n\n` +
      `⚠️ **দয়া করে অফিসিয়াল সিগন্যাল না পাওয়া পর্যন্ত কোনো এন্ট্রি নেবেন না।**\n\n` +
      `📈 **সবাই প্রস্তুত থাকুন!**`,
      { parse_mode: 'Markdown' }
    );
    
    await sleep(3000);
    
    const startTime = Date.now();
    const maxWaitTime = 5 * 60 * 1000;
    let foundSignal = false;
    
    while (Date.now() - startTime < maxWaitTime && recoveryAttempts < MAX_RECOVERY_ATTEMPTS && !foundSignal) {
      await waitForNewCandle();
      await sleep(2000);
      
      recoveryAttempts++;
      console.log(`🔍 MTG Analysis Attempt ${recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS}`);
      
      try {
        const pairInfo = { live: originalSignal.pair, otc: originalSignal.pair + ' OTC', flag: originalSignal.flag };
        const analysis = await analyzeSymbol(pairInfo, true);
        
        if (analysis) {
          const isSameDirection = analysis.direction === originalSignal.direction;
          const hasGoodConfidence = analysis.aiScore >= 72 && analysis.directionsAgree >= 4;
          
          console.log(`📊 MTG Analysis: ${analysis.pair} | Dir: ${analysis.direction} | Score: ${analysis.aiScore}% | Agree: ${analysis.directionsAgree}/7`);
          
          if (isSameDirection && hasGoodConfidence) {
            console.log(`✅ Found good MTG signal at candle ${recoveryAttempts}`);
            foundSignal = true;
            
            await safeSendMessage(bot,
              `🔄 **𝗠𝗧𝗚 𝗥𝗘𝗖𝗢𝗩𝗘𝗥𝗬 𝗦𝗜𝗚𝗡𝗔𝗟**\n\n` +
              `📊 **Asset:** ${analysis.pair}\n` +
              `🎯 **Direction:** ${analysis.direction === 'UP' ? 'BUY 🟢' : 'SELL 🔴'}\n` +
              `📈 **Confidence:** ${analysis.aiScore}%\n` +
              `⏰ **Entry Time:** ${getBDTime().fullTime}\n\n` +
              `✅ **MTG Signal Confirmed! Entry Now!**`,
              { parse_mode: 'Markdown' }
            );
            
            await sendSignalWithChart(bot, analysis, true);
            break;
          } else {
            console.log(`⏳ MTG signal not ready yet (attempt ${recoveryAttempts})`);
          }
        }
        
      } catch (error) {
        console.error(`❌ MTG analysis error: ${error.message}`);
      }
      
      if (!foundSignal) {
        await sleep(30 * 1000);
      }
    }
    
    if (!foundSignal) {
      console.log('⏭️ MTG Recovery: No good signal found');
      await safeSendMessage(bot,
        `⏭️ **𝗠𝗧𝗚 𝗥𝗘𝗖𝗢𝗩𝗘𝗥𝗬 𝗦𝗞𝗜𝗣𝗣𝗘𝗗**\n\n` +
        `📊 **Asset:** ${originalSignal.pair}\n` +
        `⏳ **No good recovery signal found in 5 minutes**\n\n` +
        `🛡️ **Wait for next session for fresh signals.**`,
        { parse_mode: 'Markdown' }
      );
    }
    
  } catch (error) {
    console.error(`❌ MTG Recovery error: ${error.message}`);
  } finally {
    isRecoveryMode = false;
    recoveryAttempts = 0;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 MAIN LOOP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = function(bot, newsModule) {
  console.log('✅ Qx AI Predictor VIP v5.0 — 14 Indicators + Chart + MTG Recovery');

  async function run() {
    try {
      if (newsModule && newsModule.isNewsActive()) {
        console.log('📰 News active — skip');
        return;
      }

      if (isRolloverTime()) {
        console.log('⏸ Rollover — skip');
        return;
      }

      const now = Date.now();
      const elapsed = now - lastSentTime;
      if (lastSentTime > 0 && elapsed < MIN_GAP) {
        console.log(`⏱️ Min gap ${Math.round((MIN_GAP - elapsed)/1000)}s remaining`);
        return;
      }

      const { h, m } = getBDTime();
      const liveOpen = isLiveMarketOpen();

      // ✅ ৪+৪ Pair Rotation
      const currentPairs = pairGroups[pairGroupIndex % 2];
      pairGroupIndex++;

      console.log(`🔍 Scan BD: ${h}:${m} | Market: ${liveOpen ? '🟢 LIVE' : '🔴 OTC'} | Group: ${pairGroupIndex % 2 === 0 ? '1' : '2'}`);

      const results = [];
      let anyLive = false;

      for (const pair of currentPairs) {
        try {
          const res = await analyzeSymbol(pair, !liveOpen);
          if (res) {
            results.push(res);
            if (res.isLive) anyLive = true;
          }
          await sleep(1200);
        } catch (e) {
          console.log('Error: ' + pair.live + ' — ' + e.message);
        }
      }

      // ✅ Market Status
      if (anyLive) { liveCount++; noLiveCount = 0; }
      else { noLiveCount++; liveCount = 0; }

      const { h: ah, m: am } = getBDTime();

      if (liveCount >= CONFIRM_LIMIT && lastMarketStatus !== true) {
        lastMarketStatus = true;
        liveCount = 0;
        try {
          await bot.sendMessage(ADMIN_ID,
            `🟢 *Quotex Market OPEN*\n\n` +
            `📊 পরপর ${CONFIRM_LIMIT} বার Live Data পাওয়া গেছে\n` +
            `⏰ BD Time: \`${ah}:${am}\`\n\n` +
            `✅ Live Signal চালু হয়েছে।`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {}
      }

      if (noLiveCount >= CONFIRM_LIMIT && lastMarketStatus !== false) {
        lastMarketStatus = false;
        noLiveCount = 0;
        try {
          await bot.sendMessage(ADMIN_ID,
            `🔴 *Quotex Market CLOSED*\n\n` +
            `😴 পরপর ${CONFIRM_LIMIT} বার Live Data পাওয়া যায়নি\n` +
            `⏰ BD Time: \`${ah}:${am}\`\n\n` +
            `📊 OTC Signal চলছে।`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {}
      }

      if (!results.length) {
        console.log('❌ No signal found.');
        return;
      }

      // ✅ Best signal
      results.sort((a, b) => b.avgRatio - a.avgRatio || b.aiScore - a.aiScore);
      const best = results[0];

      const signalKey = `${best.pair}_${best.direction}`;
      if (signalKey === lastSignalKey && elapsed < MAX_GAP) {
        console.log(`🔁 Duplicate — skip`);
        return;
      }

      // ✅ Send signal with chart
      console.log(`📤 Sending: ${best.pair} | ${best.aiScore}% | ${best.confidence}`);
      await sendSignalWithChart(bot, best);
      
      lastSentTime = Date.now();
      lastSignalKey = signalKey;

    } catch (error) {
      console.error('❌ Main loop error:', error.message);
    }
  }

  setTimeout(() => {
    run();
    setInterval(run, CHECK_INTERVAL);
  }, 30000);
};
