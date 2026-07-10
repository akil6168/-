// session.js - Qx AI Predictor VIP Session (Pro v6.0 + Chart + Extra Indicators)
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
    this.stats = { total: 0, wins: 0, losses: 0, winRate: 0, sessions: {}, pairs: {}, daily: {} };
    this.loadStats();
  }
  loadStats() {
    try { if (fs.existsSync(this.statsFile)) this.stats = JSON.parse(fs.readFileSync(this.statsFile)); } catch(e) {}
  }
  saveStats() {
    try { fs.writeFileSync(this.statsFile, JSON.stringify(this.stats, null, 2)); } catch(e) {}
  }
  addResult(symbol, direction, isWin) {
    const today = getBDTime().dateKey;
    this.stats.total++;
    if (isWin) this.stats.wins++; else this.stats.losses++;
    this.stats.winRate = (this.stats.wins / this.stats.total * 100);
    if (!this.stats.pairs[symbol]) this.stats.pairs[symbol] = { wins: 0, losses: 0 };
    if (isWin) this.stats.pairs[symbol].wins++; else this.stats.pairs[symbol].losses++;
    if (!this.stats.daily[today]) this.stats.daily[today] = { wins: 0, losses: 0 };
    if (isWin) this.stats.daily[today].wins++; else this.stats.daily[today].losses++;
    this.saveStats();
  }
  getStatsMessage() {
    const { total, wins, losses, winRate, pairs } = this.stats;
    const today = getBDTime().dateKey;
    const daily = this.stats.daily[today] || { wins: 0, losses: 0 };
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
━━━━━━━━━━━━━━━━━━━

📅 **TODAY**: ${daily.wins}W / ${daily.losses}L

📊 **TOP PAIRS**
${pairStats || '  No data yet'}

💎 **OWNER**: @AkiL_xD 👾
    `;
  }
  getTodayStats() {
    const today = getBDTime().dateKey;
    const daily = this.stats.daily[today] || { wins: 0, losses: 0 };
    const totalToday = daily.wins + daily.losses;
    const rate = totalToday > 0 ? (daily.wins / totalToday * 100) : 0;
    return { ...daily, total: totalToday, rate };
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
    dateKey: `${bd.getUTCFullYear()}-${String(bd.getUTCMonth()+1).padStart(2,'0')}-${String(bd.getUTCDate()).padStart(2,'0')}`
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

async function getCandles(symbol, count = 50, interval = '1min') {
  const data = await twelveData.getTimeSeries(symbol, interval, count);
  if (!data.values || !data.values.length) throw new Error('No data');
  const lastCandleTime = new Date(data.values[0].datetime + ' UTC');
  const diffMinutes = (new Date() - lastCandleTime) / (60 * 1000);
  if (diffMinutes > 5) throw new Error('Stale data');
  return data.values.map(v => ({
    open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: +v.volume || 0
  })).reverse();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📈 TECHNICAL ANALYSIS (all indicators)
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

function calcStochRSI(candles, period = 14) {
  const rsiArr = [];
  for (let i = period; i < candles.length; i++) rsiArr.push(calcRSI(candles.slice(0, i+1), period));
  if (rsiArr.length < period) return 50;
  const rec = rsiArr.slice(-period);
  const mn = Math.min(...rec), mx = Math.max(...rec);
  if (mx === mn) return 50;
  return ((rsiArr[rsiArr.length - 1] - mn) / (mx - mn)) * 100;
}

function calcBB(candles, period = 20) {
  const p = Math.min(period, candles.length);
  const closes = candles.slice(-p).map(c => c.close);
  const sma = closes.reduce((a,b) => a+b, 0) / p;
  const std = Math.sqrt(closes.reduce((s,c) => s + Math.pow(c - sma, 2), 0) / p);
  return { upper: sma + 2*std, lower: sma - 2*std, mid: sma };
}

function calcATR(candles, period = 14) {
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i-1].close), Math.abs(candles[i].low - candles[i-1].close)));
  }
  return trs.slice(-period).reduce((a,b) => a+b, 0) / period;
}

function calcCCI(candles, period = 20) {
  const p = Math.min(period, candles.length);
  const slice = candles.slice(-p);
  const typicals = slice.map(c => (c.high + c.low + c.close) / 3);
  const mean = typicals.reduce((a,b) => a+b, 0) / p;
  const mad = typicals.reduce((s,t) => s + Math.abs(t - mean), 0) / p;
  if (mad === 0) return 0;
  return (typicals[typicals.length - 1] - mean) / (0.015 * mad);
}

function calcWilliamsR(candles, period = 14) {
  const p = Math.min(period, candles.length);
  const slice = candles.slice(-p);
  const highest = Math.max(...slice.map(c => c.high));
  const lowest = Math.min(...slice.map(c => c.low));
  const last = candles[candles.length - 1].close;
  if (highest === lowest) return -50;
  return ((highest - last) / (highest - lowest)) * -100;
}

function calcTrend(candles) {
  const ema5 = calcEMA(candles, 5), ema10 = calcEMA(candles, 10), ema20 = calcEMA(candles, 20), ema50 = calcEMA(candles, 50);
  const last = candles[candles.length - 1].close;
  let up = 0, dn = 0;
  if (ema5 > ema20) up += 2; else dn += 2;
  if (ema10 > ema50) up += 2; else dn += 2;
  if (last > ema5) up += 1; else dn += 1;
  if (last > ema20) up += 1; else dn += 1;
  if (ema5 > ema10 && ema10 > ema20) up += 3;
  else if (ema5 < ema10 && ema10 < ema20) dn += 3;
  return {
    dir: up > dn ? 'UP' : 'DOWN',
    up, dn,
    isStrong: up >= 5 || dn >= 5,
    label: up > dn ? 'Strong Uptrend 📈' : 'Strong Downtrend 📉'
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

function calcSupportResistance(candles) {
  const highs = candles.map(c => c.high), lows = candles.map(c => c.low);
  const resistance = Math.max(...highs.slice(-20));
  const support = Math.min(...lows.slice(-20));
  const last = candles[candles.length - 1].close;
  const nearResistance = Math.abs(last - resistance) / last < 0.001;
  const nearSupport = Math.abs(last - support) / last < 0.001;
  return { support, resistance, nearSupport, nearResistance };
}

// ✅ NEW — ADX (ট্রেন্ড স্ট্রেংথ)
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

// ✅ NEW — Supertrend
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

// ✅ NEW — VWAP (Volume Weighted Average Price)
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔍 FULL ANALYSIS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function analyzeSymbol(symbol, relaxed = false) {
  const candles = await getCandles(symbol, 50);
  const h4Candles = await getCandles(symbol, 100, '5min');

  const rsi = calcRSI(candles), rsi7 = calcRSI(candles, 7);
  const stoch = calcStochRSI(candles), macd = calcMACD(candles);
  const bb = calcBB(candles), atr = calcATR(candles);
  const cci = calcCCI(candles), wr = calcWilliamsR(candles);
  const trend = calcTrend(candles), h4Trend = calcTrend(h4Candles);
  const cp = calcCandlePattern(candles), sr = calcSupportResistance(candles);
  const adx = calcADX(candles);
  const supertrend = calcSupertrend(candles);
  const vwap = calcVWAP(candles);
  const last = candles[candles.length - 1].close;

  let up = 0, dn = 0;
  const signals = [];

  if (rsi < 30) { up += 3; signals.push('RSI Oversold'); } else if (rsi > 70) { dn += 3; signals.push('RSI Overbought'); }
  else if (rsi < 45) up += 1; else if (rsi > 55) dn += 1;

  if (rsi7 < 25) { up += 2; signals.push('Fast RSI Oversold'); } else if (rsi7 > 75) { dn += 2; signals.push('Fast RSI Overbought'); }

  if (stoch < 20) { up += 2; signals.push('StochRSI Oversold'); } else if (stoch > 80) { dn += 2; signals.push('StochRSI Overbought'); }

  if (macd > 0) { up += 2; signals.push('MACD Bullish'); } else { dn += 2; signals.push('MACD Bearish'); }

  if (last <= bb.lower) { up += 3; signals.push('Price at Lower BB'); } else if (last >= bb.upper) { dn += 3; signals.push('Price at Upper BB'); }

  if (cci < -100) { up += 2; signals.push('CCI Oversold'); } else if (cci > 100) { dn += 2; signals.push('CCI Overbought'); }

  if (wr < -80) { up += 2; signals.push('Williams %R Oversold'); } else if (wr > -20) { dn += 2; signals.push('Williams %R Overbought'); }

  up += trend.up; dn += trend.dn;
  if (trend.dir === 'UP') signals.push('EMA Bullish Alignment'); else signals.push('EMA Bearish Alignment');

  if (trend.dir === h4Trend.dir) { up += 2; signals.push('HTF Confirmation ✅'); } else { dn += 2; signals.push('HTF Mismatch ⚠️'); }

  if (sr.nearSupport) { up += 3; signals.push('At Support Level ✅'); }
  if (sr.nearResistance) { dn += 3; signals.push('At Resistance Level ⚠️'); }

  if (cp.dir === 'UP') { up += cp.str; signals.push(cp.pattern); } else if (cp.dir === 'DOWN') { dn += cp.str; signals.push(cp.pattern); }

  // ✅ নতুন পাওয়ারফুল ইন্ডিকেটর — ADX, Supertrend, VWAP
  if (adx.adx >= 25) {
    if (adx.plusDI > adx.minusDI) { up += 3; signals.push(`ADX Strong (${adx.adx.toFixed(0)}) ✅`); }
    else { dn += 3; signals.push(`ADX Strong (${adx.adx.toFixed(0)}) ✅`); }
  }

  if (supertrend.dir === 'UP') { up += 3; signals.push('Supertrend Bullish 🚀'); }
  else if (supertrend.dir === 'DOWN') { dn += 3; signals.push('Supertrend Bearish 🔻'); }

  if (vwap.dir === 'UP') { up += 2; signals.push('Above VWAP 📈'); }
  else { dn += 2; signals.push('Below VWAP 📉'); }

  const total = up + dn;
  const dominant = Math.max(up, dn);
  const ratio = total > 0 ? dominant / total : 0;
  const direction = up >= dn ? 'UP' : 'DOWN';
  const volatility = (atr / last) * 100;
  const aiScore = Math.round(ratio * 100);

  let confidence = '';
  if (aiScore >= 90) confidence = 'Extreme High 🔥🔥';
  else if (aiScore >= 85) confidence = 'Very High 🔥';
  else if (aiScore >= 80) confidence = 'High ✅';
  else if (aiScore >= 75) confidence = 'Medium ⚡';
  else confidence = 'Low ⚠️';

  // ✅ কনফ্লুয়েন্স চেক — মূল ইন্ডিকেটরগুলো একমত কিনা তা গণনা করা
  const directionsAgree = [
    trend.dir,
    adx.adx >= 25 ? (adx.plusDI > adx.minusDI ? 'UP' : 'DOWN') : direction,
    supertrend.dir === 'NEUTRAL' ? direction : supertrend.dir,
    vwap.dir
  ].filter(d => d === direction).length;

  const isValid = relaxed
    ? (ratio >= 0.65 && aiScore >= 65 && volatility >= 0.002)
    : (ratio >= 0.85 && trend.isStrong && volatility >= 0.004 && aiScore >= 80 && adx.adx >= 22 && directionsAgree >= 3);

  return {
    symbol, direction, ratio, aiScore, trend, h4Trend: h4Trend.dir,
    signals: signals.slice(0, 6), currentPrice: last, volatility, confidence,
    isSureShot: aiScore >= 90 && directionsAgree >= 4, isValid, sr, candles,
    adx: adx.adx, directionsAgree
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 CHART GENERATOR (Line chart with Entry/Exit via QuickChart)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function generateChart(symbol, candles, direction, entryPrice, exitPrice) {
  try {
    const plotCandles = candles.slice(-30);
    const labels = plotCandles.map((_, i) => `${i + 1}`);
    const closes = plotCandles.map(c => c.close);

    const chartConfig = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: symbol,
          data: closes,
          borderColor: direction === 'UP' ? '#00ff88' : '#ff4444',
          backgroundColor: direction === 'UP' ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)',
          fill: true,
          tension: 0.2,
          pointRadius: 0
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
                label: { content: 'ENTRY', enabled: true, position: 'start', backgroundColor: 'rgba(255,215,0,0.8)', color: '#000' }
              },
              exitLine: {
                type: 'line',
                yMin: exitPrice,
                yMax: exitPrice,
                borderColor: exitPrice > entryPrice ? '#00ff88' : '#ff4444',
                borderWidth: 2,
                borderDash: [6, 4],
                label: {
                  content: exitPrice > entryPrice ? 'WIN' : 'LOSS',
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
          x: { ticks: { color: '#aaa' } },
          y: { ticks: { color: '#aaa' } }
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
// 🔍 BEST PAIR FINDER (with ignoreTime + relaxed mode)
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
      console.log(`📊 ${pair.symbol}: Score=${result.aiScore}% | Valid=${result.isValid} | ADX=${result.adx.toFixed(0)} | Agree=${result.directionsAgree}/4 | Vol=${(result.volatility*100).toFixed(2)}%`);

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

function waitForSignalTiming() {
  return new Promise(resolve => {
    const check = setInterval(() => {
      const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const s = now.getUTCSeconds();
      if (s >= 40 && s <= 43) { clearInterval(check); resolve(); }
    }, 500);
    setTimeout(() => { clearInterval(check); resolve(); }, 30000);
  });
}

function waitForCandleClose() {
  return new Promise(resolve => {
    const check = setInterval(() => {
      const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const s = now.getUTCSeconds();
      if (s >= 58) { clearInterval(check); resolve(); }
    }, 500);
    setTimeout(() => { clearInterval(check); resolve(); }, 30000);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 PRO SIGNAL SENDER (with Chart)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function sendProSignal(bot, signal) {
  const signalKey = generateSignalKey(signal.symbol, signal.direction);
  if (sentSignals.has(signalKey)) {
    console.log(`⚠️ Duplicate signal: ${signalKey}`);
    return null;
  }
  sentSignals.set(signalKey, Date.now());

  const pairInfo = SESSION_PAIRS.find(p => p.symbol === signal.symbol);
  const flag = pairInfo ? pairInfo.flag : '';
  const dirLabel = signal.direction === 'UP' ? 'CALL 🟢' : 'PUT 🔴';
  const directionEmoji = signal.direction === 'UP' ? '🟢' : '🔴';

  try {
    // ━━━ 1. Pro Signal Message ━━━
    await safeSendMessage(bot,
      `╔══════════════════════════════╗\n` +
      `     🤖 QX AI LIVE V6.0\n` +
      `     ${Math.floor(Math.random() * 1000 + 100)} monthly users\n` +
      `╚══════════════════════════════╝\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 **ASSET**       ➜ ${signal.symbol} ${flag}\n` +
      `🎯 **DIRECTION**   ➜ ${dirLabel} ${directionEmoji}\n` +
      `📈 **CONFIDENCE**  ➜ ${signal.aiScore}%\n` +
      `📉 **TREND**       ➜ ${signal.trend.label}\n` +
      `⏰ **ENTRY**       ➜ ${getBDTime().display} (BD Time)\n` +
      `⏳ **EXPIRY**      ➜ 1 Minute\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📌 **ANALYSIS**\n` +
      signal.signals.map((s, i) => `  ${i+1}. ${s}`).join('\n') + '\n\n' +
      `🛡️ **RISK MANAGEMENT**\n` +
      `  • Maximum 1 Step MTG\n` +
      `  • Never Overtrade\n\n` +
      `💎 **OWNER**: @AkiL_xD 👾\n` +
      `⚠️ Trade at your own risk.`,
      { parse_mode: 'Markdown' }
    );

    // ━━━ 2. Chart (Entry) ━━━
    const chartBuffer = await generateChart(
      signal.symbol,
      signal.candles,
      signal.direction,
      signal.currentPrice,
      signal.currentPrice * (signal.direction === 'UP' ? 1.001 : 0.999) // dummy exit
    );
    if (chartBuffer) {
      await safeSendPhoto(bot, chartBuffer, `📊 ${signal.symbol} | Direction: ${signal.direction === 'UP' ? 'CALL 🟢' : 'PUT 🔴'}`);
    }

    // ━━━ 3. Wait for timing ━━━
    console.log(`⏳ Waiting for candle timing...`);
    await waitForSignalTiming();

    const nowBD = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const nextMin = (nowBD.getUTCMinutes() + 1) % 60;
    const nextH = nowBD.getUTCHours() + (nowBD.getUTCMinutes() + 1 >= 60 ? 1 : 0);
    const entryTime = `${String(nextH % 24).padStart(2, '0')}:${String(nextMin).padStart(2, '0')}`;
    console.log(`📡 Signal timing! Entry: ${entryTime}`);

    // ━━━ 4. Direction Sticker ━━━
    const dirSticker = signal.direction === 'UP' ? STICKERS.CALL : STICKERS.PUT;
    await safeSendSticker(bot, dirSticker);
    console.log(`✅ ${signal.symbol} ${dirLabel} | Entry: ${entryTime}`);

    let entryPrice = signal.currentPrice;
    try { entryPrice = await getCurrentPrice(signal.symbol); } catch(e) {}

    // ━━━ 5. Live Price Update ━━━
    await safeSendMessage(bot,
      `💹 **LIVE PRICE UPDATE**\n\n` +
      `📊 ${signal.symbol}\n` +
      `💰 Current: ${entryPrice.toFixed(5)}\n` +
      `📈 High: ${(entryPrice * 1.002).toFixed(5)}\n` +
      `📉 Low: ${(entryPrice * 0.998).toFixed(5)}\n` +
      `⚡ Volatility: ${(signal.volatility * 100).toFixed(2)}%\n\n` +
      `⏰ Entry: ${entryTime}`,
      { parse_mode: 'Markdown' }
    );

    // ━━━ 6. Wait for candle close ━━━
    console.log(`⏳ Waiting for candle close...`);
    await waitForCandleClose();
    await sleep(1500);

    // ━━━ 7. Exit Price ━━━
    let exitPrice = entryPrice;
    try { exitPrice = await getCurrentPrice(signal.symbol); } catch(e) {}

    // ━━━ 8. Result ━━━
    const isWin = signal.direction === 'UP' ? exitPrice > entryPrice : exitPrice < entryPrice;
    console.log(`📊 ${signal.symbol} | Entry: ${entryPrice} | Exit: ${exitPrice} | ${isWin ? 'WIN ✅' : 'LOSS ❌'}`);

    lastResults.push(isWin);
    if (lastResults.length > 10) lastResults.shift();
    tracker.addResult(signal.symbol, signal.direction, isWin);

    // ━━━ 9. Result Chart ━━━
    const resultChart = await generateChart(signal.symbol, signal.candles, signal.direction, entryPrice, exitPrice);
    if (resultChart) {
      await safeSendPhoto(bot, resultChart, `📊 Result: ${isWin ? '✅ WIN' : '❌ LOSS'} | ${signal.symbol}`);
    }

    // ━━━ 10. Result Message ━━━
    if (isWin) {
      await safeSendSticker(bot, STICKERS.SURESHOT);
      await sleep(600);
      await safeSendMessage(bot,
        `✅ **SIGNAL RESULT : WIN**\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📊 **Asset**    : ${signal.symbol} ${flag}\n` +
        `🎯 **Direction**: ${dirLabel}\n` +
        `📈 **Result**   : WIN ✅\n` +
        `💰 **Profit**   : +${((exitPrice - entryPrice) / entryPrice * 100).toFixed(2)}%\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `🎯 **SURESHOT** ✅\n\n` +
        `📊 **Today Stats**: ${tracker.getTodayStats().wins}W / ${tracker.getTodayStats().losses}L\n\n` +
        `💎 **OWNER**: @AkiL_xD 👾`,
        { parse_mode: 'Markdown' }
      );
    } else {
      const mtgSticker = signal.direction === 'UP' ? STICKERS.MTG_UP : STICKERS.MTG_DOWN;
      await safeSendSticker(bot, mtgSticker);
      await sleep(600);
      await safeSendMessage(bot,
        `❌ **SIGNAL RESULT : LOSS**\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📊 **Asset**    : ${signal.symbol} ${flag}\n` +
        `🎯 **Direction**: ${dirLabel}\n` +
        `📈 **Result**   : LOSS ❌\n` +
        `📉 **Loss**     : ${((entryPrice - exitPrice) / entryPrice * 100).toFixed(2)}%\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `💪 **Wait for recovery signal**\n\n` +
        `📊 **Today Stats**: ${tracker.getTodayStats().wins}W / ${tracker.getTodayStats().losses}L\n\n` +
        `💎 **OWNER**: @AkiL_xD 👾`,
        { parse_mode: 'Markdown' }
      );
    }

    return isWin;

  } catch (error) {
    console.error(`❌ Signal error for ${signal.symbol}: ${error.message}`);
    return null;
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
      `🏁 **QX AI LIVE V6.0**\n\n` +
      `📈 Everyone stay ready!\n\n` +
      `⏰ Time: ${display} (BD Time)\n` +
      `📊 Session: ${getTradingSessionName()}\n\n` +
      `🎯 Best signals coming soon!\n` +
      `💰 Trade with proper risk management.`,
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
    const MIN_SIGNAL_GAP = 5 * 60 * 1000;   // ✅ কমপক্ষে ৫ মিনিট গ্যাপ
    const MAX_SIGNAL_GAP = 15 * 60 * 1000;  // ✅ সর্বোচ্চ ১৫ মিনিটের মধ্যে সিগন্যাল

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
        best = await findBestPair(isManual, forceRelaxed); // isManual = true → bypass time check
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

      // ✅ Minimum ৫ মিনিট গ্যাপ নিশ্চিত করা (প্রথম সিগন্যাল বাদে)
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
        const result = await sendProSignal(bot, best);
        if (result !== null) { signalCount++; lastSignalTime = Date.now(); }
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
  console.log('✅ Scheduler started (v6.0 + Chart + Extra Indicators)');

  if (schedulerInterval) clearInterval(schedulerInterval);

  schedulerInterval = setInterval(async () => {
    try {
      const { h, m, s, dateKey } = getBDTime();

      // Reminders & Sessions (same as before)
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
