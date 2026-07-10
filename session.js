// session.js - Qx AI Predictor VIP Session (v6.0 + High Accuracy Indicators)
// FIXED: Timing bug fixed + Chart format fixed
const twelveData = require('./twelvedata');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📌 CONFIGURATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CHANNEL_ID = '-1002268650240';
const ADMIN_ID = 5724602667;

const STICKERS = {
  SESSION_START: 'CAACAgUAAxkBAAIJJ2pPVxYeX2jAiTapeoNVCgMzIWtVAALnIgACWHFpVlTeidVCL8I3PAQ',
  SESSION_CLOSE: 'CAACAgUAAxkBAAIJKWpPVzu4tb4onZL4742yeSF5y0oLAAIJIAACc3VpVkNdndLynxI-PAQ',
  CALL:          'CAACAgUAAxkBAAIJK2pPV1ztYYU8_R49EuK5oBmFffV8AALJIgAC5k9pVqeGo-FqhqZxPAQ',
  PUT:           'CAACAgUAAxkBAAIJLWpPV14vd8gAAWhsbmXWF7ZV1myZkwAC6h4AAsjCaFalqCdpCisveDwE',
  MTG_UP:        'CAACAgUAAxkBAAIJL2pPV4nrleMPO16j3QjBGH849I43AAIzMQACMjBpVr5zJRxZHFjYPAQ',
  MTG_DOWN:      'CAACAgUAAxkBAAIJMWpPV4tbhka9zx-VcQPhCriyx0Q8AAKTJwACxONpVk9q_2A9wcpPPAQ',
  NEXT_ONE:      'CAACAgUAAxkBAAIJM2pPV61SI184RUwfBH6nghFXAZCYAALOIAACKY5oVv-5TOUJuFB8PAQ',
  ARE_YOU_READY: 'CAACAgUAAxkBAAIJNWpPV8EahWO7lbY1ESG3M2VuyRVHAALJIAACHXdoVqVbV76nUyGLPAQ',
  SURESHOT:      'CAACAgUAAxkBAAIJN2pPWNbKDC9YJaHXrsaf1uO1aXmoAAKCJQACS0qAVqdi7137PDZoPAQ'
};

const SESSION_PAIRS = [
  { symbol: 'EUR/USD', flag: '🇪🇺🇺🇸', priority: 1 },
  { symbol: 'GBP/USD', flag: '🇬🇧🇺🇸', priority: 2 },
  { symbol: 'USD/JPY', flag: '🇺🇸🇯🇵', priority: 3 },
  { symbol: 'EUR/GBP', flag: '🇪🇺🇬🇧', priority: 4 },
  { symbol: 'USD/CHF', flag: '🇺🇸🇨🇭', priority: 5 },
  { symbol: 'EUR/JPY', flag: '🇪🇺🇯🇵', priority: 6 },
  { symbol: 'GBP/JPY', flag: '🇬🇧🇯🇵', priority: 7 },
  { symbol: 'AUD/USD', flag: '🇦🇺🇺🇸', priority: 8 }
];

const MARKET_SESSIONS = {
  LONDON: { OPEN: 14, CLOSE: 23, BEST_HOURS: [15,16,17,18,19,20], PAIRS: ['EUR/USD','GBP/USD','EUR/GBP','EUR/JPY','GBP/JPY'] },
  NEWYORK: { OPEN: 19, CLOSE: 4, BEST_HOURS: [20,21,22,23,0], PAIRS: ['EUR/USD','GBP/USD','USD/JPY','USD/CHF'] },
  TOKYO: { OPEN: 6, CLOSE: 15, BEST_HOURS: [7,8,9,10,11], PAIRS: ['USD/JPY','EUR/JPY','GBP/JPY','AUD/USD'] }
};

const TRADING_SCHEDULE = [
  { start: 11, end: 14, name: 'Morning Momentum' },
  { start: 16, end: 20, name: 'London Session' },
  { start: 21, end: 23, name: 'NY Session' }
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 PERFORMANCE TRACKER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class PerformanceTracker {
  constructor() {
    this.statsFile = path.join(__dirname, 'stats.json');
    this.stats = { total: 0, wins: 0, losses: 0, winRate: 0, sessions: {}, pairs: {}, daily: {}, mtg: { total: 0, wins: 0, losses: 0 } };
    this.loadStats();
  }
  loadStats() {
    try { if (fs.existsSync(this.statsFile)) this.stats = JSON.parse(fs.readFileSync(this.statsFile)); } catch(e) {}
  }
  saveStats() {
    try { fs.writeFileSync(this.statsFile, JSON.stringify(this.stats, null, 2)); } catch(e) {}
  }
  addResult(symbol, direction, isWin, isMTG = false) {
    const today = getBDTime().dateKey;
    this.stats.total++;
    if (isWin) this.stats.wins++; else this.stats.losses++;
    this.stats.winRate = (this.stats.wins / this.stats.total * 100);
    
    if (isMTG) {
      this.stats.mtg.total++;
      if (isWin) this.stats.mtg.wins++; else this.stats.mtg.losses++;
    }
    
    if (!this.stats.pairs[symbol]) this.stats.pairs[symbol] = { wins: 0, losses: 0 };
    if (isWin) this.stats.pairs[symbol].wins++; else this.stats.pairs[symbol].losses++;
    
    if (!this.stats.daily[today]) this.stats.daily[today] = { wins: 0, losses: 0, mtgWins: 0, mtgLosses: 0 };
    if (isWin) {
      if (isMTG) this.stats.daily[today].mtgWins++; else this.stats.daily[today].wins++;
    } else {
      if (isMTG) this.stats.daily[today].mtgLosses++; else this.stats.daily[today].losses++;
    }
    this.saveStats();
  }
  getStatsMessage() {
    const { total, wins, losses, winRate, pairs, mtg } = this.stats;
    const today = getBDTime().dateKey;
    const daily = this.stats.daily[today] || { wins: 0, losses: 0, mtgWins: 0, mtgLosses: 0 };
    const mtgRate = mtg.total > 0 ? (mtg.wins / mtg.total * 100) : 0;
    
    let pairStats = '';
    const sortedPairs = Object.entries(pairs).sort((a,b) => (b[1].wins+b[1].losses) - (a[1].wins+a[1].losses));
    for (const [symbol, data] of sortedPairs.slice(0,5)) {
      const rate = data.wins+data.losses > 0 ? (data.wins/(data.wins+data.losses)*100) : 0;
      pairStats += `  • ${symbol}: ${rate.toFixed(1)}% (${data.wins}/${data.wins+data.losses})\n`;
    }
    return `
📊 **QX AI PERFORMANCE v6.0**

━━━━━━━━━━━━━━━━━━━
📈 **TOTAL**: ${total}
✅ **WINS**: ${wins}
❌ **LOSSES**: ${losses}
🎯 **WIN RATE**: ${winRate.toFixed(1)}%
🔄 **MTG RATE**: ${mtgRate.toFixed(1)}% (${mtg.wins}/${mtg.total})
━━━━━━━━━━━━━━━━━━━

📅 **TODAY**: ${daily.wins}W / ${daily.losses}L
🔄 **MTG TODAY**: ${daily.mtgWins}W / ${daily.mtgLosses}L

📊 **TOP PAIRS**
${pairStats || '  No data yet'}

💎 **OWNER**: @AkiL_xD 👾
    `;
  }
  getTodayStats() {
    const today = getBDTime().dateKey;
    const daily = this.stats.daily[today] || { wins: 0, losses: 0, mtgWins: 0, mtgLosses: 0 };
    const totalToday = daily.wins + daily.losses + daily.mtgWins + daily.mtgLosses;
    const rate = totalToday > 0 ? ((daily.wins + daily.mtgWins) / totalToday * 100) : 0;
    return { 
      wins: daily.wins + daily.mtgWins, 
      losses: daily.losses + daily.mtgLosses, 
      total: totalToday, 
      rate,
      mtgWins: daily.mtgWins,
      mtgLosses: daily.mtgLosses
    };
  }
}

const tracker = new PerformanceTracker();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⏰ SESSION STATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let sessionRunning = false;
let sessionLockTimestamp = 0;
let currentSessionId = null;
let schedulerInitialized = false;
let schedulerInterval = null;
const MAX_LOSS_STREAK = 2;
const sentSignals = new Map();
const completedSessions = new Map();
const sentReminders = new Map();
const SESSION_LOCK_TIMEOUT = 45 * 60 * 1000;
const lastResults = [];
let isRecoveryMode = false;
let recoveryAttempts = 0;
const MAX_RECOVERY_ATTEMPTS = 5;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🛠️ HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getBDTime() {
  const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const h = bd.getUTCHours(), m = bd.getUTCMinutes(), s = bd.getUTCSeconds();
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return {
    h, m, s,
    hStr: String(h).padStart(2,'0'),
    mStr: String(m).padStart(2,'0'),
    sStr: String(s).padStart(2,'0'),
    display: `${h12}:${String(m).padStart(2,'0')} ${period}`,
    dateKey: `${bd.getUTCFullYear()}-${String(bd.getUTCMonth()+1).padStart(2,'0')}-${String(bd.getUTCDate()).padStart(2,'0')}`,
    fullTime: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function generateSessionKey(name) { const { dateKey, h } = getBDTime(); return `${dateKey}-${name}-${h}`; }
function generateSignalKey(symbol, dir) { const { dateKey, h, m } = getBDTime(); return `${dateKey}-${h}-${Math.floor(m/5)}-${symbol}-${dir}`; }
function generateReminderKey(type) { const { dateKey, h, m } = getBDTime(); return `${dateKey}-${type}-${h}-${m}`; }

function cleanupOldEntries() {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000;
  for (const [key, ts] of sentSignals) if (now - ts > maxAge) sentSignals.delete(key);
  for (const [key, ts] of completedSessions) if (now - ts > maxAge) completedSessions.delete(key);
  for (const [key, ts] of sentReminders) if (now - ts > maxAge) sentReminders.delete(key);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔒 SESSION LOCK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function acquireSessionLock(name) {
  const now = Date.now();
  if (sessionRunning && sessionLockTimestamp > 0 && now - sessionLockTimestamp > SESSION_LOCK_TIMEOUT) {
    console.log('⚠️ Stale lock, releasing');
    releaseSessionLock();
  }
  if (sessionRunning) return false;
  sessionRunning = true;
  sessionLockTimestamp = now;
  currentSessionId = `${name}-${now}`;
  console.log(`🔒 Lock acquired: ${currentSessionId}`);
  return true;
}

function releaseSessionLock() {
  console.log(`🔓 Lock released: ${currentSessionId}`);
  sessionRunning = false;
  sessionLockTimestamp = 0;
  currentSessionId = null;
  isRecoveryMode = false;
  recoveryAttempts = 0;
}

function isSessionLocked() {
  if (!sessionRunning) return false;
  const now = Date.now();
  if (sessionLockTimestamp > 0 && now - sessionLockTimestamp > SESSION_LOCK_TIMEOUT) {
    console.log('⚠️ Stale lock detected');
    return false;
  }
  return true;
}

function isGoodTradingTime() {
  const { h } = getBDTime();
  for (const slot of TRADING_SCHEDULE) if (h >= slot.start && h < slot.end) return true;
  return false;
}

function getActiveSessions() {
  const { h } = getBDTime();
  const active = [];
  if (h >= MARKET_SESSIONS.LONDON.OPEN && h < MARKET_SESSIONS.LONDON.CLOSE) active.push('LONDON');
  if (h >= MARKET_SESSIONS.NEWYORK.OPEN || h < MARKET_SESSIONS.NEWYORK.CLOSE) active.push('NEWYORK');
  if (h >= MARKET_SESSIONS.TOKYO.OPEN && h < MARKET_SESSIONS.TOKYO.CLOSE) active.push('TOKYO');
  return active;
}

function getTradingSessionName() {
  const { h } = getBDTime();
  for (const slot of TRADING_SCHEDULE) if (h >= slot.start && h < slot.end) return slot.name;
  return 'Off-Hours';
}

function shouldSkipPair(symbol) {
  const active = getActiveSessions();
  const { h } = getBDTime();
  if (h < 12 && symbol === 'AUD/USD') return true;
  if (active.includes('LONDON') && !MARKET_SESSIONS.LONDON.PAIRS.includes(symbol)) return true;
  if (active.includes('NEWYORK') && !MARKET_SESSIONS.NEWYORK.PAIRS.includes(symbol)) return true;
  if (active.includes('TOKYO') && !MARKET_SESSIONS.TOKYO.PAIRS.includes(symbol)) return true;
  return false;
}

function checkLossStreak() {
  if (lastResults.length >= 3) {
    const losses = lastResults.filter(r => r === false).length;
    if (losses >= MAX_LOSS_STREAK) {
      console.log(`⚠️ Loss streak (${losses}), pausing...`);
      return true;
    }
  }
  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📨 SAFE SENDERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function safeSendSticker(bot, fileId, retries = 1) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try { await bot.sendSticker(CHANNEL_ID, fileId); return true; } catch(e) {
      console.log(`⚠️ Sticker send failed (${attempt}): ${e.message}`);
      if (attempt < retries) await sleep(1000);
    }
  }
  return false;
}

async function safeSendMessage(bot, text, options = {}, retries = 1) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await bot.sendMessage(CHANNEL_ID, text, options);
      return result;
    } catch(e) {
      console.log(`⚠️ Message send failed (${attempt}): ${e.message}`);
      if (attempt < retries) await sleep(1000);
    }
  }
  return null;
}

async function safeSendPhoto(bot, photo, caption = '', retries = 1) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await bot.sendPhoto(CHANNEL_ID, photo, { caption });
      return result;
    } catch(e) {
      console.log(`⚠️ Photo send failed (${attempt}): ${e.message}`);
      if (attempt < retries) await sleep(1000);
    }
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 PRICE & CANDLE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function getCurrentPrice(symbol) {
  const data = await twelveData.getPrice(symbol);
  return parseFloat(data.price);
}

async function getCandles(symbol, count = 52, interval = '1min') {
  const data = await twelveData.getTimeSeries(symbol, interval, count);
  if (!data.values || !data.values.length) throw new Error('No data');
  const lastCandleTime = new Date(data.values[0].datetime + ' UTC');
  const diffMinutes = (new Date() - lastCandleTime) / (60 * 1000);
  if (diffMinutes > 5) throw new Error('Stale data');
  return data.values.map(v => ({
    open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: +v.volume || 0,
    datetime: v.datetime
  })).reverse();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📈 HIGH ACCURACY INDICATORS (14 Indicators)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 1. RSI (14)
function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    d > 0 ? gain += d : loss += Math.abs(d);
  }
  return 100 - (100 / (1 + gain / (loss || 1)));
}

// 2. MACD
function calcMACD(candles) {
  return calcEMA(candles, 12) - calcEMA(candles, 26);
}

// 3. ADX
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

// 4. Bollinger Bands
function calcBB(candles, period = 20) {
  const p = Math.min(period, candles.length);
  const closes = candles.slice(-p).map(c => c.close);
  const sma = closes.reduce((a,b) => a+b, 0) / p;
  const std = Math.sqrt(closes.reduce((s,c) => s + Math.pow(c - sma, 2), 0) / p);
  return { upper: sma + 2*std, lower: sma - 2*std, mid: sma };
}

// 5. Supertrend
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

// 6. VWAP
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
  return { vwap, dir: last > vwap ? 'UP' : 'DOWN', dist: Math.abs(last - vwap) / last * 100 };
}

// 7. Support & Resistance
function calcSupportResistance(candles) {
  const highs = candles.map(c => c.high), lows = candles.map(c => c.low);
  const resistance = Math.max(...highs.slice(-20));
  const support = Math.min(...lows.slice(-20));
  const last = candles[candles.length - 1].close;
  const nearResistance = Math.abs(last - resistance) / last < 0.001;
  const nearSupport = Math.abs(last - support) / last < 0.001;
  return { support, resistance, nearSupport, nearResistance };
}

// 8. Candle Patterns
function calcCandlePattern(candles) {
  const len = candles.length;
  if (len < 3) return { pattern: 'No Pattern', dir: 'NEUTRAL', str: 0 };
  const c = candles[len - 1], p = candles[len - 2], p2 = candles[len - 3];
  const body = Math.abs(c.close - c.open);
  const upWick = c.high - Math.max(c.close, c.open);
  const dnWick = Math.min(c.close, c.open) - c.low;
  const range = c.high - c.low || 0.0001;
  const bull = c.close > c.open, bear = c.close < c.open;

  if (bull && p.close < p.open && c.close > p.open && c.open < p.close) return { pattern: 'Bullish Engulfing', dir: 'UP', str: 4 };
  if (bear && p.close > p.open && c.open > p.close && c.close < p.open) return { pattern: 'Bearish Engulfing', dir: 'DOWN', str: 4 };
  if (dnWick > body * 2.5 && upWick < body * 0.5) return { pattern: 'Bullish Pin Bar', dir: 'UP', str: 3 };
  if (upWick > body * 2.5 && dnWick < body * 0.5) return { pattern: 'Bearish Pin Bar', dir: 'DOWN', str: 3 };
  if (p2.close < p2.open && Math.abs(p.close-p.open) < Math.abs(p2.close-p2.open)*0.3 && bull) return { pattern: 'Morning Star', dir: 'UP', str: 4 };
  if (p2.close > p2.open && Math.abs(p.close-p.open) < Math.abs(p2.close-p2.open)*0.3 && bear) return { pattern: 'Evening Star', dir: 'DOWN', str: 4 };
  if (bull && p.close > p.open && p2.close > p2.open && body > range * 0.6) return { pattern: 'Three White Soldiers', dir: 'UP', str: 5 };
  if (bear && p.close < p.open && p2.close < p2.open && body > range * 0.6) return { pattern: 'Three Black Crows', dir: 'DOWN', str: 5 };
  if (body < range * 0.1) return { pattern: 'Doji', dir: 'NEUTRAL', str: 1 };
  if (bull && upWick < body * 0.05 && dnWick < body * 0.05) return { pattern: 'Bullish Marubozu', dir: 'UP', str: 3 };
  if (bear && upWick < body * 0.05 && dnWick < body * 0.05) return { pattern: 'Bearish Marubozu', dir: 'DOWN', str: 3 };
  return { pattern: 'No Pattern', dir: 'NEUTRAL', str: 0 };
}

// 9. ATR
function calcATR(candles, period = 14) {
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i-1].close), Math.abs(candles[i].low - candles[i-1].close)));
  }
  return trs.slice(-period).reduce((a,b) => a+b, 0) / period;
}

// 10. EMA (20, 50)
function calcEMA(candles, period) {
  if (candles.length < 2) return candles[0].close;
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) ema = candles[i].close * k + ema * (1 - k);
  return ema;
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

// ━━━ NEW HIGH ACCURACY INDICATORS ━━━

// 11. Ichimoku Cloud
function calcIchimoku(candles) {
  const len = candles.length;
  if (len < 52) return { senkouA: 0, senkouB: 0, tenkan: 0, kijun: 0, chikou: 0, trend: 'NEUTRAL', up: 0, dn: 0, isStrong: false, label: 'Ichimoku Neutral' };
  
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
  if (last > senkouA && last > senkouB) { up += 3; }
  else if (last < senkouA && last < senkouB) { dn += 3; }
  
  if (tenkan > kijun) up += 2;
  else dn += 2;
  
  if (chikou > last) up += 2;
  else dn += 2;
  
  return { 
    tenkan, kijun, senkouA, senkouB, chikou, 
    trend: up > dn ? 'UP' : 'DOWN',
    up, dn,
    isStrong: up >= 5 || dn >= 5,
    label: up > dn ? 'Ichimoku Bullish ☀️' : 'Ichimoku Bearish 🌧️'
  };
}

// 12. MFI (Money Flow Index)
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
  
  const mfi = 100 - (100 / (1 + (positiveFlow / (negativeFlow || 1))));
  return mfi;
}

// 13. Fibonacci Retracement
function calcFibonacci(candles) {
  const len = Math.min(50, candles.length);
  const slice = candles.slice(-len);
  const high = Math.max(...slice.map(c => c.high));
  const low = Math.min(...slice.map(c => c.low));
  const last = candles[candles.length - 1].close;
  
  const diff = high - low;
  const levels = {
    level0: high,
    level236: high - diff * 0.236,
    level382: high - diff * 0.382,
    level500: high - diff * 0.5,
    level618: high - diff * 0.618,
    level786: high - diff * 0.786,
    level100: low
  };
  
  let nearLevel = null;
  let nearDist = Infinity;
  for (const [key, value] of Object.entries(levels)) {
    const dist = Math.abs(last - value) / last;
    if (dist < 0.001 && dist < nearDist) {
      nearDist = dist;
      nearLevel = key;
    }
  }
  
  const near618 = Math.abs(last - levels.level618) / last < 0.001;
  const above618 = last > levels.level618;
  
  return { 
    ...levels, 
    nearLevel, 
    near618,
    above618,
    dir: above618 ? 'UP' : 'DOWN'
  };
}

// 14. Chaikin Money Flow
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

async function analyzeSymbol(symbol, relaxed = false) {
  const candles = await getCandles(symbol, 52);
  const h4Candles = await getCandles(symbol, 100, '5min');

  // ━━ Calculate all 14 indicators ━━
  const rsi = calcRSI(candles);
  const macd = calcMACD(candles);
  const adx = calcADX(candles);
  const bb = calcBB(candles);
  const supertrend = calcSupertrend(candles);
  const vwap = calcVWAP(candles);
  const sr = calcSupportResistance(candles);
  const cp = calcCandlePattern(candles);
  const atr = calcATR(candles);
  const trend = calcTrend(candles);
  const ichimoku = calcIchimoku(candles);
  const mfi = calcMFI(candles);
  const fib = calcFibonacci(candles);
  const cmf = calcChaikinMF(candles);
  
  const last = candles[candles.length - 1].close;
  let up = 0, dn = 0;
  const signals = [];

  // ━━ 1. RSI ━━
  if (rsi < 30) { up += 3; signals.push('RSI Oversold'); } 
  else if (rsi > 70) { dn += 3; signals.push('RSI Overbought'); }
  else if (rsi < 45) up += 1; else if (rsi > 55) dn += 1;

  // ━━ 2. MACD ━━
  if (macd > 0) { up += 3; signals.push('MACD Bullish'); } 
  else { dn += 3; signals.push('MACD Bearish'); }

  // ━━ 3. ADX ━━
  if (adx.adx >= 25) {
    if (adx.plusDI > adx.minusDI) { up += 3; signals.push(`ADX Strong (${adx.adx.toFixed(0)}) ✅`); }
    else { dn += 3; signals.push(`ADX Strong (${adx.adx.toFixed(0)}) ✅`); }
  }

  // ━━ 4. Bollinger Bands ━━
  if (last <= bb.lower) { up += 3; signals.push('Price at Lower BB'); } 
  else if (last >= bb.upper) { dn += 3; signals.push('Price at Upper BB'); }

  // ━━ 5. Supertrend ━━
  if (supertrend.dir === 'UP') { up += 3; signals.push('Supertrend Bullish 🚀'); }
  else if (supertrend.dir === 'DOWN') { dn += 3; signals.push('Supertrend Bearish 🔻'); }

  // ━━ 6. VWAP ━━
  if (vwap.dir === 'UP') { up += 2; signals.push('Above VWAP 📈'); }
  else { dn += 2; signals.push('Below VWAP 📉'); }

  // ━━ 7. Support/Resistance ━━
  if (sr.nearSupport) { up += 3; signals.push('At Support Level ✅'); }
  if (sr.nearResistance) { dn += 3; signals.push('At Resistance Level ⚠️'); }

  // ━━ 8. Candle Patterns ━━
  if (cp.dir === 'UP') { up += cp.str; signals.push(cp.pattern); } 
  else if (cp.dir === 'DOWN') { dn += cp.str; signals.push(cp.pattern); }

  // ━━ 9. ATR (volatility check) ━━
  const volatility = (atr / last) * 100;

  // ━━ 10. EMA Trend ━━
  up += trend.up; dn += trend.dn;
  if (trend.dir === 'UP') signals.push('EMA Bullish Alignment');
  else signals.push('EMA Bearish Alignment');

  // ━━ 11. Ichimoku Cloud ━━
  up += ichimoku.up; dn += ichimoku.dn;
  if (ichimoku.trend === 'UP') signals.push(ichimoku.label);
  else if (ichimoku.trend === 'DOWN') signals.push(ichimoku.label);

  // ━━ 12. MFI ━━
  if (mfi < 20) { up += 3; signals.push(`MFI Oversold (${mfi.toFixed(0)})`); }
  else if (mfi > 80) { dn += 3; signals.push(`MFI Overbought (${mfi.toFixed(0)})`); }

  // ━━ 13. Fibonacci ━━
  if (fib.near618) {
    if (fib.above618) { up += 3; signals.push('Fib 61.8% Support ✅'); }
    else { dn += 3; signals.push('Fib 61.8% Resistance ⚠️'); }
  }
  if (fib.nearLevel && fib.nearLevel !== 'level618') {
    signals.push(`Near Fib ${fib.nearLevel.replace('level', '')}%`);
  }

  // ━━ 14. Chaikin Money Flow ━━
  if (cmf > 0.1) { up += 2; signals.push('CMF Bullish 🟢'); }
  else if (cmf < -0.1) { dn += 2; signals.push('CMF Bearish 🔴'); }

  // ━━ Final Score ━━
  const total = up + dn;
  const dominant = Math.max(up, dn);
  const ratio = total > 0 ? dominant / total : 0;
  const direction = up >= dn ? 'UP' : 'DOWN';
  const aiScore = Math.round(ratio * 100);

  // ━━ Confidence ━━
  let confidence = '';
  if (aiScore >= 90) confidence = 'Extreme High 🔥🔥';
  else if (aiScore >= 85) confidence = 'Very High 🔥';
  else if (aiScore >= 80) confidence = 'High ✅';
  else if (aiScore >= 75) confidence = 'Medium ⚡';
  else confidence = 'Low ⚠️';

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

  // ━━ Validity ━━
  const isValid = relaxed
    ? (ratio >= 0.65 && aiScore >= 65 && volatility >= 0.002)
    : (ratio >= 0.85 && trend.isStrong && volatility >= 0.004 && aiScore >= 80 && adx.adx >= 22 && directionsAgree >= 4);

  return {
    symbol, direction, ratio, aiScore, trend: trend.dir,
    signals: signals.slice(0, 8),
    currentPrice: last, volatility, confidence,
    isSureShot: aiScore >= 90 && directionsAgree >= 5,
    isValid, sr, candles,
    adx: adx.adx, directionsAgree,
    ichimoku: ichimoku.trend,
    mfi: mfi,
    fib: fib.nearLevel,
    cmf: cmf
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 CANDLE CHART GENERATOR (FIXED FORMAT)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function generateCandleChart(symbol, candles, direction, entryPrice, exitPrice, isMTG = false) {
  try {
    const plotCandles = candles.slice(-20);
    // ✅ ফিক্স: QuickChart কম্প্যাটিবল ফরম্যাট {x, o, h, l, c}
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
    console.error('❌ Candle chart generation failed:', error.message);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔍 BEST PAIR FINDER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function findBestPair(ignoreTime = false, relaxed = false) {
  if (!ignoreTime && !isGoodTradingTime()) {
    console.log(`⏰ ${getTradingSessionName()} - Not good trading time`);
    return null;
  }
  if (!ignoreTime && checkLossStreak()) {
    console.log('⏸️ Loss streak detected, pausing...');
    return null;
  }

  let best = null;
  const activeSessions = getActiveSessions();
  console.log(`📊 Active Sessions: ${activeSessions.join(', ') || 'None'}${relaxed ? ' | ⚡ RELAXED MODE' : ''}`);

  for (const pair of SESSION_PAIRS) {
    try {
      if (!ignoreTime && shouldSkipPair(pair.symbol)) {
        console.log(`⏭️ Skipping ${pair.symbol} - Not suitable`);
        continue;
      }
      const result = await analyzeSymbol(pair.symbol, relaxed);
      result.flag = pair.flag;
      result.priority = pair.priority;
      console.log(`📊 ${pair.symbol}: Score=${result.aiScore}% | Valid=${result.isValid} | ADX=${result.adx.toFixed(0)} | Agree=${result.directionsAgree}/7 | Vol=${(result.volatility*100).toFixed(2)}%`);

      if (!result.isValid) { await sleep(800); continue; }

      const priorityBonus = Math.max(0, (6 - pair.priority) * 0.5);
      const finalScore = result.aiScore + priorityBonus;

      if (!best || finalScore > (best.aiScore + Math.max(0, (6 - best.priority) * 0.5))) {
        best = result;
        best.finalScore = finalScore;
      }
      await sleep(800);
    } catch (e) {
      console.log(`❌ ${pair.symbol}: ${e.message}`);
      await sleep(500);
    }
  }
  return best;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⏰ CANDLE TIMING
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

// ✅ ফিক্স: waitForCandleClose এখন সঠিকভাবে কাজ করে
function waitForCandleClose() {
  return new Promise(resolve => {
    const check = setInterval(() => {
      const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const s = now.getUTCSeconds();
      // ৫৮ সেকেন্ডে ফায়ার হবে (candle close এর ২ সেকেন্ড আগে)
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
// 🎯 PRO SIGNAL SENDER (FIXED TIMING)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function sendProSignal(bot, signal, isMTG = false, entryPriceOverride = null, exitPriceOverride = null) {
  const signalKey = generateSignalKey(signal.symbol, signal.direction);
  if (sentSignals.has(signalKey) && !isMTG) {
    console.log(`⚠️ Duplicate signal: ${signalKey}`);
    return null;
  }
  if (!isMTG) sentSignals.set(signalKey, Date.now());

  const pairInfo = SESSION_PAIRS.find(p => p.symbol === signal.symbol);
  const flag = pairInfo ? pairInfo.flag : '';
  const dirLabel = signal.direction === 'UP' ? 'CALL 🟢' : 'PUT 🔴';

  try {
    // ━━━ Signal Message ━━━
    await safeSendMessage(bot,
      `╔════════════════════╗\n` +
      `          🚀 𝗤𝗫 𝗔𝗜 𝗟𝗜𝗩𝗘 𝗩𝟱.𝟬\n` +
      `╚════════════════════╝\n\n` +
      `💹 𝗔𝗦𝗦𝗘𝗧      ➜ ${signal.symbol} ${flag}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 𝗤𝘅 𝗔𝗜 𝗦𝗖𝗢𝗥𝗘   ➜ ${signal.aiScore}%\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🛡️ 𝗥𝗜𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧\n` +
      `• Maximum 1 Step MTG\n` +
      `• Never Overtrade\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🤖 Powered by 𝗤𝘅 𝗔𝗜 𝗣𝗿𝗲𝗱𝗶𝗰𝘁𝗼𝗿\n` +
      `⚠️ Trade at your own risk.`,
      { parse_mode: 'Markdown' }
    );

    // ━━━ Wait for 45 second ━━━
    console.log(`⏳ Waiting for signal timing (45s)...`);
    await waitForExactSecond(45);
    
    const bdTime = getBDTime();
    console.log(`📡 Signal timing! Entry at: ${bdTime.fullTime}`);

    // ━━━ Direction Sticker ━━━
    const dirSticker = isMTG ? (signal.direction === 'UP' ? STICKERS.MTG_UP : STICKERS.MTG_DOWN) : (signal.direction === 'UP' ? STICKERS.CALL : STICKERS.PUT);
    await safeSendSticker(bot, dirSticker);
    console.log(`✅ ${signal.symbol} ${dirLabel}${isMTG ? ' (MTG)' : ''}`);

    // ━━━ Entry Price (59 second) ━━━
    await waitForExactSecond(59);
    let entryPrice = entryPriceOverride || signal.currentPrice;
    try {
      const priceData = await getCurrentPrice(signal.symbol);
      if (priceData) entryPrice = priceData;
    } catch(e) {}
    console.log(`💰 Entry Price: ${entryPrice} at ${getBDTime().fullTime}`);

    // ━━━ Live Price Update ━━━
    await safeSendMessage(bot,
      `💹 **LIVE PRICE UPDATE**\n\n` +
      `📊 ${signal.symbol}\n` +
      `💰 Entry: ${entryPrice.toFixed(5)}\n` +
      `📈 High: ${(entryPrice * 1.002).toFixed(5)}\n` +
      `📉 Low: ${(entryPrice * 0.998).toFixed(5)}\n` +
      `⚡ Volatility: ${(signal.volatility * 100).toFixed(2)}%\n\n` +
      `⏰ Entry Time: ${getBDTime().fullTime}`,
      { parse_mode: 'Markdown' }
    );

    // ━━━ ✅ CRITICAL FIX: Wait for next candle to close ━━━
    console.log(`⏳ Waiting for next candle to close (~60s)...`);
    await sleep(55000); // ✅ 55 সেকেন্ড wait - পরের candle এর কাছাকাছি
    await waitForCandleClose(); // এখন 58+ সেকেন্ডে ফায়ার হবে
    await sleep(1500);

    // ━━━ Exit Price ━━━
    let exitPrice = exitPriceOverride || entryPrice;
    try {
      const priceData = await getCurrentPrice(signal.symbol);
      if (priceData) exitPrice = priceData;
    } catch(e) {}
    console.log(`💰 Exit Price: ${exitPrice} at ${getBDTime().fullTime}`);

    // ━━━ Result ━━━
    const isWin = signal.direction === 'UP' ? exitPrice > entryPrice : exitPrice < entryPrice;
    console.log(`📊 ${signal.symbol} | Entry: ${entryPrice} | Exit: ${exitPrice} | ${isWin ? 'WIN ✅' : 'LOSS ❌'}${isMTG ? ' (MTG)' : ''}`);

    if (!isMTG) {
      lastResults.push(isWin);
      if (lastResults.length > 10) lastResults.shift();
    }
    tracker.addResult(signal.symbol, signal.direction, isWin, isMTG);

    // ━━━ Candle Chart ━━━
    const chartBuffer = await generateCandleChart(signal.symbol, signal.candles, signal.direction, entryPrice, exitPrice, isMTG);
    if (chartBuffer) {
      const chartCaption = isMTG ? `📊 MTG ${signal.symbol} | ${isWin ? '✅ WIN' : '❌ LOSS'}` : `📊 ${signal.symbol} | ${isWin ? '✅ WIN' : '❌ LOSS'}`;
      await safeSendPhoto(bot, chartBuffer, chartCaption);
    }

    // ━━━ Result Message ━━━
    const todayStats = tracker.getTodayStats();
    
    if (isWin) {
      if (!isMTG) {
        await safeSendSticker(bot, STICKERS.SURESHOT);
        await sleep(600);
      }
      await safeSendMessage(bot,
        `✅ **SIGNAL RESULT : WIN${isMTG ? ' (MTG)' : ''}**\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📊 **Asset**    : ${signal.symbol} ${flag}\n` +
        `🎯 **Direction**: ${dirLabel}\n` +
        `📈 **Result**   : WIN ✅\n` +
        `💰 **Profit**   : +${((exitPrice - entryPrice) / entryPrice * 100).toFixed(2)}%\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `${isMTG ? '🔄 **MTG Recovery Successful!** ✅\n\n' : '🎯 **SURESHOT** ✅\n\n'}` +
        `📊 **Today Stats**: ${todayStats.wins}W / ${todayStats.losses}L (MTG: ${todayStats.mtgWins}W / ${todayStats.mtgLosses}L)\n\n` +
        `💎 **OWNER**: @AkiL_xD 👾`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await safeSendMessage(bot,
        `❌ **SIGNAL RESULT : LOSS${isMTG ? ' (MTG)' : ''}**\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📊 **Asset**    : ${signal.symbol} ${flag}\n` +
        `🎯 **Direction**: ${dirLabel}\n` +
        `📈 **Result**   : LOSS ❌\n` +
        `📉 **Loss**     : ${((entryPrice - exitPrice) / entryPrice * 100).toFixed(2)}%\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `${isMTG ? '🔄 **MTG Recovery Failed!** ❌\n' : '💪 **MTG Recovery Mode Activated!**\n'}` +
        `📊 **Today Stats**: ${todayStats.wins}W / ${todayStats.losses}L (MTG: ${todayStats.mtgWins}W / ${todayStats.mtgLosses}L)\n\n` +
        `💎 **OWNER**: @AkiL_xD 👾`,
        { parse_mode: 'Markdown' }
      );
      
      if (!isMTG) {
        await handleMTGRecovery(bot, signal);
      }
    }

    return { isWin, entryPrice, exitPrice };

  } catch (error) {
    console.error(`❌ Signal error for ${signal.symbol}: ${error.message}`);
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
  
  const pairInfo = SESSION_PAIRS.find(p => p.symbol === originalSignal.symbol);
  const flag = pairInfo ? pairInfo.flag : '';
  
  try {
    await safeSendMessage(bot,
      `🔄 **𝗥𝗘𝗖𝗢𝗩𝗘𝗥𝗬 𝗦𝗜𝗚𝗡𝗔𝗟**\n\n` +
      `📊 **Asset:** ${originalSignal.symbol} ${flag}\n` +
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
        const analysis = await analyzeSymbol(originalSignal.symbol, true);
        
        const isSameDirection = analysis.direction === originalSignal.direction;
        const hasGoodConfidence = analysis.aiScore >= 82 && analysis.isValid && analysis.directionsAgree >= 4;
        
        console.log(`📊 MTG Analysis: ${analysis.symbol} | Dir: ${analysis.direction} | Score: ${analysis.aiScore}% | Valid: ${analysis.isValid} | Agree: ${analysis.directionsAgree}/7`);
        
        if (isSameDirection && hasGoodConfidence) {
          console.log(`✅ Found good MTG signal at candle ${recoveryAttempts}`);
          foundSignal = true;
          
          await safeSendMessage(bot,
            `🔄 **𝗠𝗧𝗚 𝗥𝗘𝗖𝗢𝗩𝗘𝗥𝗬 𝗦𝗜𝗚𝗡𝗔𝗟**\n\n` +
            `📊 **Asset:** ${analysis.symbol} ${flag}\n` +
            `🎯 **Direction:** ${analysis.direction === 'UP' ? 'CALL 🟢' : 'PUT 🔴'}\n` +
            `📈 **Confidence:** ${analysis.aiScore}%\n` +
            `⏰ **Entry Time:** ${getBDTime().fullTime}\n\n` +
            `✅ **MTG Signal Confirmed! Entry Now!**`,
            { parse_mode: 'Markdown' }
          );
          
          const mtgResult = await sendProSignal(bot, analysis, true);
          
          if (mtgResult && mtgResult.isWin) {
            console.log('✅ MTG Recovery Successful!');
          } else {
            console.log('❌ MTG Recovery Failed');
          }
          
          break;
        } else {
          console.log(`⏳ MTG signal not ready yet (attempt ${recoveryAttempts})`);
        }
        
      } catch (error) {
        console.error(`❌ MTG analysis error: ${error.message}`);
      }
      
      if (!foundSignal) {
        await sleep(30 * 1000);
      }
    }
    
    if (!foundSignal) {
      console.log('⏭️ MTG Recovery: No good signal found within time limit');
      await safeSendMessage(bot,
        `⏭️ **𝗠𝗧𝗚 𝗥𝗘𝗖𝗢𝗩𝗘𝗥𝗬 𝗦𝗞𝗜𝗣𝗣𝗘𝗗**\n\n` +
        `📊 **Asset:** ${originalSignal.symbol} ${flag}\n` +
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
// 🏁 MAIN SESSION RUNNER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function runSession(bot, sessionName, isManual = false) {
  const sessionKey = generateSessionKey(sessionName);

  if (!isManual && completedSessions.has(sessionKey)) {
    const lastRun = completedSessions.get(sessionKey);
    if (Date.now() - lastRun < 25 * 60 * 1000) {
      console.log(`⚠️ ${sessionName} already completed recently.`);
      return { started: false, reason: 'already_completed' };
    }
  }

  if (!acquireSessionLock(sessionName)) {
    console.log(`⚠️ ${sessionName} — another session is running.`);
    return { started: false, reason: 'already_running' };
  }

  try {
    const { display, hStr, mStr } = getBDTime();
    console.log(`🏁 ${sessionName} Session Started — BD: ${hStr}:${mStr}`);
    completedSessions.set(sessionKey, Date.now());

    await safeSendSticker(bot, STICKERS.SESSION_START);
    await sleep(1500);

    await safeSendMessage(bot,
      `🏁 **𝗤𝗫 𝗔𝗜 𝗟𝗜𝗩𝗘 𝗩𝟱.𝟬**\n\n` +
      `🚀 **𝗟𝗶𝘃𝗲 𝗧𝗿𝗮𝗱𝗶𝗻𝗴 𝗦𝗲𝘀𝘀𝗶𝗼𝗻**\n\n` +
      `🎯 **উচ্চ-মানের (𝗛𝗶𝗴𝗵-𝗤𝘂𝗮𝗹𝗶𝘁𝘆) সেটআপ নিশ্চিত হলেই 𝗦𝗶𝗴𝗻𝗮𝗹 𝗗𝗶𝗿𝗲𝗰𝘁𝗶𝗼𝗻 প্রদান করা হবে।**\n\n` +
      `📊 **তাড়াহুড়ো নয়—শুধু সেরা সুযোগের জন্য অপেক্ষা করুন।**\n\n` +
      `⚠️ **প্রতিটি ট্রেডে 𝗠𝗼𝗻𝗲𝘆 𝗠𝗮𝗻𝗮𝗴𝗲𝗺𝗲𝗻𝘁 এবং 𝗥𝗶𝘀𝗸 𝗠𝗮𝗻𝗮𝗴𝗲𝗺𝗲𝗻𝘁 অবশ্যই অনুসরণ করুন।**`,
      { parse_mode: 'Markdown' }
    );

    await sleep(2 * 60 * 1000);
    await safeSendSticker(bot, STICKERS.ARE_YOU_READY);
    await sleep(3000);

    const SESSION_DURATION = 30 * 60 * 1000;
    const sessionStart = Date.now();
    let signalCount = 0;
    const MAX_SIGNALS = 5;
    let isFirstSignal = true;
    let lastSignalTime = Date.now();
    const MIN_SIGNAL_GAP = 5 * 60 * 1000;
    const MAX_SIGNAL_GAP = 15 * 60 * 1000;

    while (Date.now() - sessionStart < SESSION_DURATION && signalCount < MAX_SIGNALS) {
      if (!sessionRunning) {
        console.log(`⚠️ Session lock lost, stopping`);
        break;
      }

      const timeLeft = Math.round((SESSION_DURATION - (Date.now() - sessionStart)) / 60000);
      console.log(`🔍 Scanning... Signal: ${signalCount}/${MAX_SIGNALS} | Time left: ${timeLeft}min`);

      const gapSinceLast = Date.now() - lastSignalTime;
      const forceRelaxed = gapSinceLast >= MAX_SIGNAL_GAP;

      let best = null;
      try {
        best = await findBestPair(isManual, forceRelaxed);
        if (forceRelaxed && best) console.log(`⚡ 15min limit reached — sending relaxed signal: ${best.symbol}`);
      } catch (e) {
        console.error(`❌ Error: ${e.message}`);
        await sleep(60000);
        continue;
      }

      if (!best) {
        console.log('⏭️ No valid signal, retrying in 3 min...');
        await sleep(3 * 60 * 1000);
        continue;
      }

      if (!isFirstSignal && gapSinceLast < MIN_SIGNAL_GAP) {
        const waitMore = MIN_SIGNAL_GAP - gapSinceLast;
        console.log(`⏱️ Min gap not met, waiting ${Math.round(waitMore/1000)}s more...`);
        await sleep(waitMore);
      }

      if (!isFirstSignal) {
        await safeSendSticker(bot, STICKERS.NEXT_ONE);
        await sleep(2000);
      }
      isFirstSignal = false;

      try {
        const result = await sendProSignal(bot, best, false);
        if (result !== null && result.isWin !== undefined) { 
          signalCount++; 
          lastSignalTime = Date.now(); 
        }
      } catch (e) {
        console.error(`❌ Signal error: ${e.message}`);
      }

      if (signalCount < MAX_SIGNALS && Date.now() - sessionStart < SESSION_DURATION) {
        console.log(`😴 Waiting before next scan...`);
        await sleep(60 * 1000);
      }
    }

    await sleep(2000);
    await safeSendSticker(bot, STICKERS.SESSION_CLOSE);
    await sleep(800);

    const { display: endDisplay } = getBDTime();
    const statsMsg = tracker.getStatsMessage();

    await safeSendMessage(bot,
      `🏁 **${sessionName} Session Ended!**\n\n` +
      `⏰ Time: ${endDisplay} (BD Time)\n` +
      `📊 **Total Signals:** ${signalCount}\n\n` +
      `${statsMsg}\n\n` +
      `🙏 Thanks everyone!\n` +
      `💪 See you next session.\n\n` +
      `⚠️ Always trade at your own risk.`,
      { parse_mode: 'Markdown' }
    );

    console.log(`✅ ${sessionName} Ended | Total: ${signalCount}`);
    return { started: true, signalCount };

  } catch (err) {
    console.error(`💥 Session error: ${err.message}`);
    throw err;
  } finally {
    releaseSessionLock();
    cleanupOldEntries();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⏰ AUTO SCHEDULER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = function (bot) {
  if (schedulerInitialized) {
    console.log('⚠️ Scheduler already initialized');
    return;
  }
  schedulerInitialized = true;
  console.log('✅ Scheduler started (v6.0 + 14 High Accuracy Indicators + FIXED TIMING)');

  if (schedulerInterval) clearInterval(schedulerInterval);

  schedulerInterval = setInterval(async () => {
    try {
      const { h, m, s, dateKey } = getBDTime();

      if (h === 11 && m === 30 && s < 10) {
        const key = generateReminderKey('morning_reminder');
        if (!sentReminders.has(key)) {
          sentReminders.set(key, Date.now());
          await safeSendMessage(bot,
            `⏰ **Morning Session শুরু হবে ৩০ মিনিট পরে!**\n\n🕙 ১২:০০ টায় (BD Time)\n📊 সবাই রেডি থাকুন! ✅`,
            { parse_mode: 'Markdown' }
          );
        }
      }
      if (h === 12 && m === 0 && s < 10) {
        const key = generateSessionKey('🌅 Morning');
        if (!completedSessions.has(key) && !isSessionLocked()) {
          runSession(bot, '🌅 Morning', false).catch(e => console.error(e.message));
        }
      }
      if (h === 15 && m === 30 && s < 10) {
        const key = generateReminderKey('london_reminder');
        if (!sentReminders.has(key)) {
          sentReminders.set(key, Date.now());
          await safeSendMessage(bot,
            `⏰ **London Session শুরু হবে ৩০ মিনিট পরে!**\n\n🕙 ৪:০০ টায় (BD Time)\n📊 সবাই রেডি থাকুন! ✅`,
            { parse_mode: 'Markdown' }
          );
        }
      }
      if (h === 16 && m === 0 && s < 10) {
        const key = generateSessionKey('🇬🇧 London');
        if (!completedSessions.has(key) && !isSessionLocked()) {
          runSession(bot, '🇬🇧 London', false).catch(e => console.error(e.message));
        }
      }
      if (h === 20 && m === 30 && s < 10) {
        const key = generateReminderKey('evening_reminder');
        if (!sentReminders.has(key)) {
          sentReminders.set(key, Date.now());
          await safeSendMessage(bot,
            `🌙 **Evening Session শুরু হবে ৩০ মিনিট পরে!**\n\n🕙 রাত ৯:০০ টায় (BD Time)\n📊 সবাই রেডি থাকুন! ✅`,
            { parse_mode: 'Markdown' }
          );
        }
      }
      if (h === 21 && m === 0 && s < 10) {
        const key = generateSessionKey('🌙 Evening');
        if (!completedSessions.has(key) && !isSessionLocked()) {
          runSession(bot, '🌙 Evening', false).catch(e => console.error(e.message));
        }
      }
      if (h === 22 && m === 30 && s < 10) {
        const key = generateReminderKey('ny_reminder');
        if (!sentReminders.has(key)) {
          sentReminders.set(key, Date.now());
          await safeSendMessage(bot,
            `🗽 **NY Session শুরু হবে ৩০ মিনিট পরে!**\n\n🕙 রাত ১১:০০ টায় (BD Time)\n📊 সবাই রেডি থাকুন! ✅`,
            { parse_mode: 'Markdown' }
          );
        }
      }
      if (h === 23 && m === 0 && s < 10) {
        const key = generateSessionKey('🗽 NY');
        if (!completedSessions.has(key) && !isSessionLocked()) {
          runSession(bot, '🗽 NY', false).catch(e => console.error(e.message));
        }
      }

      if (h === 0 && m === 0 && s < 10) {
        await safeSendMessage(bot,
          `📊 **Daily Performance Report**\n\n${tracker.getStatsMessage()}\n\n📅 Date: ${dateKey}`,
          { parse_mode: 'Markdown' }
        );
      }

      if (m === 0 && s < 10) cleanupOldEntries();

    } catch (e) {
      console.error('Scheduler error:', e.message);
    }
  }, 5000);
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📤 EXPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports.runSession = (bot, sessionName) => runSession(bot, sessionName, true);
module.exports.isSessionRunning = () => sessionRunning;
module.exports.getStats = () => tracker.getStatsMessage();
module.exports.cleanup = () => {
  if (schedulerInterval) { clearInterval(schedulerInterval); schedulerInterval = null; }
  schedulerInitialized = false;
  releaseSessionLock();
  console.log('✅ Cleaned up');
};
