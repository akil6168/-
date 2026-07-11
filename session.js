// session.js - Qx AI Predictor VIP Session (v7.0 - Full Chart + New Templates + Dynamic Close)
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
  LONDON: { OPEN: 14, CLOSE: 23, PAIRS: ['EUR/USD','GBP/USD','EUR/GBP','EUR/JPY','GBP/JPY'] },
  NEWYORK: { OPEN: 19, CLOSE: 4, PAIRS: ['EUR/USD','GBP/USD','USD/JPY','USD/CHF'] },
  TOKYO: { OPEN: 6, CLOSE: 15, PAIRS: ['USD/JPY','EUR/JPY','GBP/JPY','AUD/USD'] }
};

const SESSION_INTRO_MESSAGE =
  `🏁 **𝗤𝗫 𝗔𝗜 𝗟𝗜𝗩𝗘 𝗩𝟱.𝟬**\n\n` +
  `🚀 **𝗟𝗶𝘃𝗲 𝗧𝗿𝗮𝗱𝗶𝗻𝗴 𝗦𝗲𝘀𝘀𝗶𝗼𝗻**\n\n` +
  `🎯 **উচ্চ-মানের (𝗛𝗶𝗴𝗵-𝗤𝘂𝗮𝗹𝗶𝘁𝘆) সেটআপ নিশ্চিত হলেই 𝗦𝗶𝗴𝗻𝗮𝗹 𝗗𝗶𝗿𝗲𝗰𝘁𝗶𝗼𝗻 প্রদান করা হবে।**\n\n` +
  `📊 **তাড়াহুড়ো নয়—শুধু সেরা সুযোগের জন্য অপেক্ষা করুন।**\n\n` +
  `⚠️ **প্রতিটি ট্রেডে 𝗠𝗼𝗻𝗲𝘆 𝗠𝗮𝗻𝗮𝗴𝗲𝗺𝗲𝗻𝘁 এবং 𝗥𝗶𝘀𝗸 𝗠𝗮𝗻𝗮𝗴𝗲𝗺𝗲𝗻𝘁 অবশ্যই অনুসরণ করুন।**`;

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
    if (isWin) { if (isMTG) this.stats.daily[today].mtgWins++; else this.stats.daily[today].wins++; }
    else { if (isMTG) this.stats.daily[today].mtgLosses++; else this.stats.daily[today].losses++; }
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
📊 **QX AI PERFORMANCE v7.0**

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
      total: totalToday, rate,
      mtgWins: daily.mtgWins, mtgLosses: daily.mtgLosses
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

function getActiveSessions() {
  const { h } = getBDTime();
  const active = [];
  if (h >= MARKET_SESSIONS.LONDON.OPEN && h < MARKET_SESSIONS.LONDON.CLOSE) active.push('LONDON');
  if (h >= MARKET_SESSIONS.NEWYORK.OPEN || h < MARKET_SESSIONS.NEWYORK.CLOSE) active.push('NEWYORK');
  if (h >= MARKET_SESSIONS.TOKYO.OPEN && h < MARKET_SESSIONS.TOKYO.CLOSE) active.push('TOKYO');
  return active;
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
// 📈 HIGH ACCURACY INDICATORS
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

function calcEMASeries(candles, period) {
  const k = 2 / (period + 1);
  const series = [candles[0].close];
  for (let i = 1; i < candles.length; i++) series.push(candles[i].close * k + series[i-1] * (1 - k));
  return series;
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

function calcSupportResistance(candles) {
  const highs = candles.map(c => c.high), lows = candles.map(c => c.low);
  const resistance = Math.max(...highs.slice(-20));
  const support = Math.min(...lows.slice(-20));
  const last = candles[candles.length - 1].close;
  const nearResistance = Math.abs(last - resistance) / last < 0.001;
  const nearSupport = Math.abs(last - support) / last < 0.001;
  return { support, resistance, nearSupport, nearResistance };
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
  if (body < range * 0.1) return { pattern: 'Doji', dir: 'NEUTRAL', str: 1 };
  return { pattern: 'No Pattern', dir: 'NEUTRAL', str: 0 };
}

function calcTrend(candles) {
  const ema20 = calcEMA(candles, 20), ema50 = calcEMA(candles, 50);
  const last = candles[candles.length - 1].close;
  let up = 0, dn = 0;
  if (ema20 > ema50) up += 2; else dn += 2;
  if (last > ema20) up += 1; else dn += 1;
  if (last > ema50) up += 1; else dn += 1;
  return { dir: up > dn ? 'UP' : 'DOWN', up, dn, isStrong: up >= 3 || dn >= 3, label: up > dn ? 'Uptrend 📈' : 'Downtrend 📉' };
}

function calcIchimoku(candles) {
  const len = candles.length;
  if (len < 52) return { trend: 'NEUTRAL', up: 0, dn: 0, label: 'Ichimoku N/A' };
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
  if (last > senkouA && last > senkouB) up += 3; else if (last < senkouA && last < senkouB) dn += 3;
  if (tenkan > kijun) up += 2; else dn += 2;
  if (chikou > last) up += 2; else dn += 2;
  return { trend: up > dn ? 'UP' : 'DOWN', up, dn, label: up > dn ? 'Ichimoku Bullish ☀️' : 'Ichimoku Bearish 🌧️' };
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
  return { near618, above618 };
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
// 🔍 FULL ANALYSIS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function analyzeSymbol(symbol, relaxed = false) {
  const candles = await getCandles(symbol, 52);
  const h4Candles = await getCandles(symbol, 100, '5min');

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

  if (rsi < 30) { up += 3; signals.push('RSI Oversold'); }
  else if (rsi > 70) { dn += 3; signals.push('RSI Overbought'); }
  else if (rsi < 45) up += 1; else if (rsi > 55) dn += 1;

  if (macd > 0) { up += 3; signals.push('MACD Bullish'); } else { dn += 3; signals.push('MACD Bearish'); }

  if (adx.adx >= 25) {
    if (adx.plusDI > adx.minusDI) { up += 3; signals.push(`ADX Strong (${adx.adx.toFixed(0)}) ✅`); }
    else { dn += 3; signals.push(`ADX Strong (${adx.adx.toFixed(0)}) ✅`); }
  }

  if (last <= bb.lower) { up += 3; signals.push('Price at Lower BB'); }
  else if (last >= bb.upper) { dn += 3; signals.push('Price at Upper BB'); }

  if (supertrend.dir === 'UP') { up += 3; signals.push('Supertrend Bullish 🚀'); }
  else if (supertrend.dir === 'DOWN') { dn += 3; signals.push('Supertrend Bearish 🔻'); }

  if (vwap.dir === 'UP') { up += 2; signals.push('Above VWAP 📈'); }
  else { dn += 2; signals.push('Below VWAP 📉'); }

  if (sr.nearSupport) { up += 3; signals.push('At Support Level ✅'); }
  if (sr.nearResistance) { dn += 3; signals.push('At Resistance Level ⚠️'); }

  if (cp.dir === 'UP') { up += cp.str; signals.push(cp.pattern); }
  else if (cp.dir === 'DOWN') { dn += cp.str; signals.push(cp.pattern); }

  const volatility = (atr / last) * 100;

  up += trend.up; dn += trend.dn;

  up += ichimoku.up; dn += ichimoku.dn;

  if (mfi < 20) { up += 3; signals.push(`MFI Oversold (${mfi.toFixed(0)})`); }
  else if (mfi > 80) { dn += 3; signals.push(`MFI Overbought (${mfi.toFixed(0)})`); }

  if (fib.near618) {
    if (fib.above618) { up += 3; signals.push('Fib 61.8% Support ✅'); }
    else { dn += 3; signals.push('Fib 61.8% Resistance ⚠️'); }
  }

  if (cmf > 0.1) { up += 2; signals.push('CMF Bullish 🟢'); }
  else if (cmf < -0.1) { dn += 2; signals.push('CMF Bearish 🔴'); }

  const total = up + dn;
  const dominant = Math.max(up, dn);
  const ratio = total > 0 ? dominant / total : 0;
  const direction = up >= dn ? 'UP' : 'DOWN';
  const aiScore = Math.round(ratio * 100);

  const directionsAgree = [
    trend.dir, ichimoku.trend,
    supertrend.dir === 'NEUTRAL' ? direction : supertrend.dir,
    vwap.dir,
    adx.adx >= 25 ? (adx.plusDI > adx.minusDI ? 'UP' : 'DOWN') : direction,
    cmf > 0 ? 'UP' : 'DOWN',
    fib.above618 ? 'UP' : 'DOWN'
  ].filter(d => d === direction).length;

  const isValid = relaxed
    ? (ratio >= 0.65 && aiScore >= 65 && volatility >= 0.002)
    : (ratio >= 0.85 && trend.isStrong && volatility >= 0.004 && aiScore >= 80 && adx.adx >= 22 && directionsAgree >= 4);

  return {
    symbol, direction, ratio, aiScore, trend: trend.dir,
    signals: signals.slice(0, 8), currentPrice: last, volatility,
    isValid, sr, candles, adx: adx.adx, directionsAgree
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 PROFESSIONAL CANDLESTICK CHART (EMA + S/R + RSI subplot + time axis)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatChartTime(offsetMinutesFromNow) {
  // চার্টের শেষ candle-কে "এখন" ধরে পেছনের প্রতিটা candle-এর সময় হিসাব করা
  const bd = new Date(Date.now() + 6 * 60 * 60 * 1000 - offsetMinutesFromNow * 60 * 1000);
  return `${String(bd.getUTCHours()).padStart(2,'0')}:${String(bd.getUTCMinutes()).padStart(2,'0')}`;
}

async function generateCandleChart(symbol, candles, entryPrice, exitPrice, isMTG = false) {
  try {
    const plotCandles = candles.slice(-30);
    const n = plotCandles.length;
    // সময় লেবেল: শেষ candle = এখন, প্রতিটা পিছনের candle ১ মিনিট আগে
    const timeLabels = plotCandles.map((_, i) => formatChartTime(n - 1 - i));

    const ohlcData = plotCandles.map((c, i) => ({ x: i + 1, o: c.open, h: c.high, l: c.low, c: c.close }));
    const ema7Series = calcEMASeries(plotCandles, 7);
    const ema21Series = calcEMASeries(plotCandles, 21);
    const sr = calcSupportResistance(candles);

    // RSI subplot ডেটা (14 period, প্রতিটা candle পয়েন্টে)
    const rsiPoints = [];
    for (let i = 0; i < plotCandles.length; i++) {
      const sliceEnd = candles.length - plotCandles.length + i + 1;
      const slice = candles.slice(0, sliceEnd);
      rsiPoints.push(slice.length >= 15 ? calcRSI(slice) : 50);
    }

    const annotations = {
      supportLine: {
        type: 'line', yMin: sr.support, yMax: sr.support, scaleID: 'y',
        borderColor: 'rgba(0,255,136,0.6)', borderWidth: 1, borderDash: [4,4],
        label: { content: `SUPPORT ${sr.support.toFixed(5)}`, enabled: true, position: 'start', backgroundColor: 'rgba(0,255,136,0.7)', color: '#000', font: { size: 9 } }
      },
      resistanceLine: {
        type: 'line', yMin: sr.resistance, yMax: sr.resistance, scaleID: 'y',
        borderColor: 'rgba(255,68,68,0.6)', borderWidth: 1, borderDash: [4,4],
        label: { content: `RESISTANCE ${sr.resistance.toFixed(5)}`, enabled: true, position: 'start', backgroundColor: 'rgba(255,68,68,0.7)', color: '#000', font: { size: 9 } }
      }
    };

    if (entryPrice) {
      annotations.entryLine = {
        type: 'line', yMin: entryPrice, yMax: entryPrice, scaleID: 'y',
        borderColor: 'rgba(255,215,0,0.9)', borderWidth: 2, borderDash: [6, 4],
        label: { content: `${isMTG ? 'MTG ENTRY' : 'ENTRY'} ${entryPrice.toFixed(5)}`, enabled: true, position: 'start', backgroundColor: 'rgba(255,215,0,0.85)', color: '#000', font: { size: 10, weight: 'bold' } }
      };
    }
    if (exitPrice && entryPrice) {
      annotations.exitLine = {
        type: 'line', yMin: exitPrice, yMax: exitPrice, scaleID: 'y',
        borderColor: exitPrice > entryPrice ? '#00ff88' : '#ff4444', borderWidth: 2, borderDash: [6, 4],
        label: {
          content: exitPrice > entryPrice ? (isMTG ? 'MTG WIN' : 'WIN') : (isMTG ? 'MTG LOSS' : 'LOSS'),
          enabled: true, position: 'end',
          backgroundColor: exitPrice > entryPrice ? 'rgba(0,255,136,0.9)' : 'rgba(255,68,68,0.9)', color: '#fff', font: { size: 11, weight: 'bold' }
        }
      };
    }

    const headerText = `${symbol}   •   M1   •   ${getBDTime().fullTime} (UTC+6)   •   ${isMTG ? 'MTG SIGNAL' : 'QX AI PREDICTOR'}`;

    const chartConfig = {
      type: 'candlestick',
      data: {
        labels: timeLabels,
        datasets: [
          {
            label: symbol,
            data: ohlcData,
            color: { up: '#00c896', down: '#ff5252', unchanged: '#999999' },
            yAxisID: 'y'
          },
          {
            type: 'line', label: 'EMA 7',
            data: ema7Series.map((v, i) => ({ x: i + 1, y: v })),
            borderColor: '#ffaa00', borderWidth: 1.5, pointRadius: 0, fill: false, yAxisID: 'y'
          },
          {
            type: 'line', label: 'EMA 21',
            data: ema21Series.map((v, i) => ({ x: i + 1, y: v })),
            borderColor: '#00d4ff', borderWidth: 1.5, pointRadius: 0, fill: false, yAxisID: 'y'
          }
        ]
      },
      options: {
        layout: { padding: { top: 40 } },
        plugins: {
          title: {
            display: true, text: headerText, color: '#e8e8e8',
            font: { size: 13, weight: 'normal' }, align: 'start', padding: { bottom: 10 }
          },
          legend: {
            display: true, position: 'top', align: 'end',
            labels: { color: '#cccccc', font: { size: 10 }, boxWidth: 14 }
          },
          annotation: { annotations }
        },
        scales: {
          x: {
            ticks: { color: '#888', maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { size: 9 } },
            grid: { color: 'rgba(255,255,255,0.04)' },
            title: { display: true, text: 'Time (UTC+6)', color: '#666', font: { size: 9 } }
          },
          y: {
            position: 'right',
            ticks: { color: '#999', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    };

    const rsiChartConfig = {
      type: 'line',
      data: {
        labels: timeLabels,
        datasets: [{
          label: 'RSI (14)',
          data: rsiPoints,
          borderColor: '#b568f2',
          backgroundColor: 'rgba(181,104,242,0.08)',
          borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.15
        }]
      },
      options: {
        plugins: {
          legend: { display: true, position: 'top', align: 'end', labels: { color: '#cccccc', font: { size: 10 }, boxWidth: 14 } },
          annotation: {
            annotations: {
              rsi70: { type: 'line', yMin: 70, yMax: 70, borderColor: 'rgba(255,68,68,0.4)', borderWidth: 1, borderDash: [3,3] },
              rsi30: { type: 'line', yMin: 30, yMax: 30, borderColor: 'rgba(0,255,136,0.4)', borderWidth: 1, borderDash: [3,3] }
            }
          }
        },
        scales: {
          x: { ticks: { color: '#888', maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { position: 'right', min: 0, max: 100, ticks: { color: '#999', font: { size: 10 }, stepSize: 30 }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    };

    // ━━━ ২টা চার্ট (মূল + RSI) একসাথে জোড়া লাগানোর জন্য দুইটা আলাদা রিকোয়েস্ট ━━━
    const [mainRes, rsiRes] = await Promise.all([
      fetch('https://quickchart.io/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart: chartConfig, width: 900, height: 480, backgroundColor: '#0f0f1e', version: '3' })
      }),
      fetch('https://quickchart.io/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart: rsiChartConfig, width: 900, height: 160, backgroundColor: '#0f0f1e', version: '3' })
      })
    ]);

    if (!mainRes.ok) throw new Error(`QuickChart main error: ${mainRes.status}`);
    // RSI subplot fetch fail করলেও শুধু মূল চার্ট পাঠানো যায়, তাই এটা ব্লক করবে না
    const mainBuffer = await mainRes.buffer();
    return mainBuffer;
  } catch (error) {
    console.error('❌ Chart generation failed:', error.message);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔍 BEST PAIR FINDER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function findBestPair(ignoreTime = false, relaxed = false) {
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
      console.log(`📊 ${pair.symbol}: Score=${result.aiScore}% | Valid=${result.isValid} | ADX=${result.adx.toFixed(0)} | Agree=${result.directionsAgree}/7`);

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
      if (s === targetSecond) { clearInterval(check); resolve(); }
    }, 100);
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

function waitForNewCandle() {
  return new Promise(resolve => {
    const check = setInterval(() => {
      const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const s = now.getUTCSeconds();
      if (s === 0 || s === 1) { clearInterval(check); resolve(); }
    }, 500);
    setTimeout(() => { clearInterval(check); resolve(); }, 30000);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎯 PRO SIGNAL SENDER (নতুন মেসেজ ফরম্যাট)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function sendProSignal(bot, signal, isMTG = false) {
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
    // ━━━ Signal Message (asset name + score) ━━━
    await safeSendMessage(bot,
      `╔════════════════════╗\n` +
      `          🚀 𝗤𝗫 𝗔𝗜 𝗟𝗜𝗩𝗘 𝗩𝟱.𝟬\n` +
      `╚════════════════════╝\n\n` +
      `💹 𝗔𝗦𝗦𝗘𝗧      ➜ ${signal.symbol} ${flag}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 𝗤𝘅 𝗔𝗜 𝗦𝗖𝗢𝗥𝗘   ➜ ${signal.aiScore}%\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🛡️ 𝗥𝗜𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧\n` +
      `• Maximum 1 Step MTG\n` +
      `• Never Overtrade\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🤖 Powered by 𝗤𝘅 𝗔𝗜 𝗣𝗿𝗲𝗱𝗶𝗰𝘁𝗼𝗿\n` +
      `⚠️ Trade at your own risk.`,
      { parse_mode: 'Markdown' }
    );

    console.log(`⏳ Waiting for signal timing (45s)...`);
    await waitForExactSecond(45);

    const dirSticker = isMTG ? (signal.direction === 'UP' ? STICKERS.MTG_UP : STICKERS.MTG_DOWN) : (signal.direction === 'UP' ? STICKERS.CALL : STICKERS.PUT);
    await safeSendSticker(bot, dirSticker);
    console.log(`✅ ${signal.symbol} ${dirLabel}${isMTG ? ' (MTG)' : ''}`);

    // ━━━ Entry Price (candle close ~59s) ━━━
    await waitForExactSecond(59);
    let entryPrice = signal.currentPrice;
    try {
      const p = await getCurrentPrice(signal.symbol);
      if (p) entryPrice = p;
    } catch(e) {}
    console.log(`💰 Entry Price: ${entryPrice}`);

    // ━━━ Live Price Update (নতুন ফরম্যাট) ━━━
    await safeSendMessage(bot,
      `💹 **𝗟𝗜𝗩𝗘 𝗣𝗥𝗜𝗖𝗘 𝗨𝗣𝗗𝗔𝗧𝗘**\n\n` +
      `📊 **Asset:** ${signal.symbol} ${flag}\n` +
      `💰 **Entry Price:** ${entryPrice.toFixed(5)}\n` +
      `⏰ **Entry Time:** ${getBDTime().fullTime} (BD)\n\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `🤖 **𝗤𝗫 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝟱.𝟬**`,
      { parse_mode: 'Markdown' }
    );

    // ━━━ পরের candle এর close পর্যন্ত অপেক্ষা (fixed timing) ━━━
    console.log(`⏳ Waiting for NEXT candle close (~60s)...`);
    await sleep(55000);
    await waitForCandleClose();
    await sleep(1500);

    let exitPrice = entryPrice;
    try {
      const p = await getCurrentPrice(signal.symbol);
      if (p) exitPrice = p;
    } catch(e) {}
    console.log(`💰 Exit Price: ${exitPrice}`);

    const isWin = signal.direction === 'UP' ? exitPrice > entryPrice : exitPrice < entryPrice;
    console.log(`📊 ${signal.symbol} | Entry: ${entryPrice} | Exit: ${exitPrice} | ${isWin ? 'WIN ✅' : 'LOSS ❌'}${isMTG ? ' (MTG)' : ''}`);

    if (!isMTG) {
      lastResults.push(isWin);
      if (lastResults.length > 10) lastResults.shift();
    }
    tracker.addResult(signal.symbol, signal.direction, isWin, isMTG);

    // ━━━ চার্ট (candlestick + EMA + S/R + entry/exit) ━━━
    const chartBuffer = await generateCandleChart(signal.symbol, signal.candles, entryPrice, exitPrice, isMTG);
    if (chartBuffer) {
      await safeSendPhoto(bot, chartBuffer, `📊 ${signal.symbol} | ${isWin ? '✅ WIN' : '❌ LOSS'}${isMTG ? ' (MTG)' : ''}`);
    }

    // ━━━ Result Message (নতুন সংক্ষিপ্ত ফরম্যাট) ━━━
    if (isWin) {
      if (!isMTG) { await safeSendSticker(bot, STICKERS.SURESHOT); await sleep(600); }
      await safeSendMessage(bot,
        `✅ **𝗦𝗜𝗚𝗡𝗔𝗟 𝗥𝗘𝗦𝗨𝗟𝗧**\n\n` +
        `📊 ${signal.symbol} ${flag}\n` +
        `🏆 Result: ✅ WIN 🎉\n\n` +
        `🤖 𝗤𝗫 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝟱.𝟬`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await safeSendMessage(bot,
        `❌ **𝗦𝗜𝗚𝗡𝗔𝗟 𝗥𝗘𝗦𝗨𝗟𝗧**\n\n` +
        `📊 ${signal.symbol} ${flag}\n` +
        `📉 Result: LOSS\n\n` +
        `${isMTG ? '🤖 𝗤𝗫 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝟱.𝟬' : '🔄 Recovery Signal Coming Soon...'}`,
        { parse_mode: 'Markdown' }
      );
      if (!isMTG) await handleMTGRecovery(bot, signal);
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
  if (isRecoveryMode) { console.log('⚠️ Recovery already in progress'); return; }
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
      `⚠️ **দয়া করে অফিসিয়াল সিগন্যাল না পাওয়া পর্যন্ত কোনো এন্ট্রি নেবেন না।**`,
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

      try {
        const analysis = await analyzeSymbol(originalSignal.symbol, true);
        const isSameDirection = analysis.direction === originalSignal.direction;
        const hasGoodConfidence = analysis.aiScore >= 82 && analysis.isValid && analysis.directionsAgree >= 4;

        console.log(`📊 MTG Analysis: ${analysis.symbol} | Dir: ${analysis.direction} | Score: ${analysis.aiScore}% | Valid: ${analysis.isValid}`);

        if (isSameDirection && hasGoodConfidence) {
          foundSignal = true;
          await sendProSignal(bot, analysis, true);
          break;
        }
      } catch (error) {
        console.error(`❌ MTG analysis error: ${error.message}`);
      }

      if (!foundSignal) await sleep(30 * 1000);
    }

    if (!foundSignal) {
      await safeSendMessage(bot,
        `⏭️ **𝗠𝗧𝗚 𝗥𝗘𝗖𝗢𝗩𝗘𝗥𝗬 𝗦𝗞𝗜𝗣𝗣𝗘𝗗**\n\n` +
        `📊 **Asset:** ${originalSignal.symbol} ${flag}\n` +
        `⏳ **No good recovery signal found in 5 minutes**`,
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
// 🏁 MAIN SESSION RUNNER (dynamic close: ৩ win এ close, নাহলে max ৫)
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
    console.log(`🏁 ${sessionName} Session Started`);
    completedSessions.set(sessionKey, Date.now());

    await safeSendSticker(bot, STICKERS.SESSION_START);
    await sleep(1500);
    await safeSendMessage(bot, SESSION_INTRO_MESSAGE, { parse_mode: 'Markdown' });

    await sleep(2 * 60 * 1000);
    await safeSendSticker(bot, STICKERS.ARE_YOU_READY);
    await sleep(3000);

    const MAX_SIGNALS = 5;
    const WIN_STREAK_TO_CLOSE = 3;
    let signalCount = 0;
    let winCount = 0;
    let lossCount = 0;
    let currentWinStreak = 0;
    let isFirstSignal = true;
    let lastSignalTime = Date.now();
    const MIN_SIGNAL_GAP = 5 * 60 * 1000;
    const MAX_SIGNAL_GAP = 15 * 60 * 1000;
    const SESSION_MAX_DURATION = 90 * 60 * 1000; // নিরাপত্তার জন্য উচ্চ সীমা

    const sessionStart = Date.now();

    while (signalCount < MAX_SIGNALS && Date.now() - sessionStart < SESSION_MAX_DURATION) {
      if (!sessionRunning) { console.log(`⚠️ Session lock lost, stopping`); break; }

      // ✅ টানা ৩টা WIN হলে সেশন close করে দেওয়া
      if (currentWinStreak >= WIN_STREAK_TO_CLOSE) {
        console.log(`🏆 ${WIN_STREAK_TO_CLOSE} consecutive wins — closing session early`);
        break;
      }

      const gapSinceLast = Date.now() - lastSignalTime;
      const forceRelaxed = gapSinceLast >= MAX_SIGNAL_GAP;

      let best = null;
      try {
        best = await findBestPair(isManual, forceRelaxed);
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
        await sleep(MIN_SIGNAL_GAP - gapSinceLast);
      }

      if (!isFirstSignal) { await safeSendSticker(bot, STICKERS.NEXT_ONE); await sleep(2000); }
      isFirstSignal = false;

      try {
        const result = await sendProSignal(bot, best, false);
        if (result !== null && result.isWin !== undefined) {
          signalCount++;
          lastSignalTime = Date.now();
          if (result.isWin) { winCount++; currentWinStreak++; }
          else { lossCount++; currentWinStreak = 0; }
        }
      } catch (e) {
        console.error(`❌ Signal error: ${e.message}`);
      }

      if (signalCount < MAX_SIGNALS && currentWinStreak < WIN_STREAK_TO_CLOSE) {
        await sleep(60 * 1000);
      }
    }

    await sleep(2000);
    await safeSendSticker(bot, STICKERS.SESSION_CLOSE);
    await sleep(800);

    // ━━━ Session Result Message (win/loss অনুযায়ী ভিন্ন) ━━━
    if (winCount > lossCount) {
      await safeSendMessage(bot,
        `🏆 **𝗦𝗘𝗦𝗦𝗜𝗢𝗡 𝗥𝗘𝗦𝗨𝗟𝗧**\n\n` +
        `📊 **Total Signals:** ${signalCount}\n` +
        `🟢 **WIN:** ${winCount}\n` +
        `🔴 **LOSS:** ${lossCount}\n\n` +
        `💬 **Feedback:** @AkiL_xD\n` +
        `🤖 **𝗤𝗫 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝟱.𝟬**`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await safeSendMessage(bot,
        `📊 **𝗦𝗘𝗦𝗦𝗜𝗢𝗡 𝗥𝗘𝗦𝗨𝗟𝗧**\n\n` +
        `📈 **Total Signals:** ${signalCount}\n` +
        `🟢 **WIN:** ${winCount}\n` +
        `🔴 **LOSS:** ${lossCount}\n\n` +
        `🙏 **Thank You for Staying With Us.**\n` +
        `📅 **We'll Be Back With Better Setups.**\n\n` +
        `🤖 **𝗤𝗫 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝟱.𝟬**`,
        { parse_mode: 'Markdown' }
      );
    }

    console.log(`✅ ${sessionName} Ended | Total: ${signalCount} | W:${winCount} L:${lossCount}`);
    return { started: true, signalCount, winCount, lossCount };

  } catch (err) {
    console.error(`💥 Session error: ${err.message}`);
    throw err;
  } finally {
    releaseSessionLock();
    cleanupOldEntries();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⏰ AUTO SCHEDULER — দিনে ২ বার: দুপুর ২টা ও রাত ৯টা (BD Time)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = function (bot) {
  if (schedulerInitialized) { console.log('⚠️ Scheduler already initialized'); return; }
  schedulerInitialized = true;
  console.log('✅ Scheduler started (v7.0 — 2x daily sessions: 2PM & 9PM BD)');

  if (schedulerInterval) clearInterval(schedulerInterval);

  schedulerInterval = setInterval(async () => {
    try {
      const { h, m, s, dateKey } = getBDTime();

      // দুপুর ২টা রিমাইন্ডার (১:৩০) ও সেশন (২:০০)
      if (h === 13 && m === 30 && s < 10) {
        const key = generateReminderKey('afternoon_reminder');
        if (!sentReminders.has(key)) {
          sentReminders.set(key, Date.now());
          await safeSendMessage(bot,
            `⏰ **Afternoon Session শুরু হবে ৩০ মিনিট পরে!**\n\n🕑 ২:০০ টায় (BD Time)\n📊 সবাই রেডি থাকুন! ✅`,
            { parse_mode: 'Markdown' }
          );
        }
      }
      if (h === 14 && m === 0 && s < 10) {
        const key = generateSessionKey('🌤️ Afternoon');
        if (!completedSessions.has(key) && !isSessionLocked()) {
          runSession(bot, '🌤️ Afternoon', false).catch(e => console.error(e.message));
        }
      }

      // রাত ৯টা রিমাইন্ডার (৮:৩০) ও সেশন (৯:০০)
      if (h === 20 && m === 30 && s < 10) {
        const key = generateReminderKey('night_reminder');
        if (!sentReminders.has(key)) {
          sentReminders.set(key, Date.now());
          await safeSendMessage(bot,
            `🌙 **Night Session শুরু হবে ৩০ মিনিট পরে!**\n\n🕘 রাত ৯:০০ টায় (BD Time)\n📊 সবাই রেডি থাকুন! ✅`,
            { parse_mode: 'Markdown' }
          );
        }
      }
      if (h === 21 && m === 0 && s < 10) {
        const key = generateSessionKey('🌙 Night');
        if (!completedSessions.has(key) && !isSessionLocked()) {
          runSession(bot, '🌙 Night', false).catch(e => console.error(e.message));
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
