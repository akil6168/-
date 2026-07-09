// session.js - Qx AI Predictor VIP Session (Upgraded & Fixed)
const twelveData = require('./twelvedata');

const CHANNEL_ID = '-1002268650240';
const ADMIN_ID = 5724602667;

// ✅ Updated Sticker file_ids
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
  { symbol: 'EUR/USD', flag: '🇪🇺🇺🇸' },
  { symbol: 'GBP/USD', flag: '🇬🇧🇺🇸' },
  { symbol: 'USD/JPY', flag: '🇺🇸🇯🇵' },
  { symbol: 'AUD/USD', flag: '🇦🇺🇺🇸' },
  { symbol: 'EUR/GBP', flag: '🇪🇺🇬🇧' },
  { symbol: 'USD/CHF', flag: '🇺🇸🇨🇭' },
  { symbol: 'EUR/JPY', flag: '🇪🇺🇯🇵' },
  { symbol: 'GBP/JPY', flag: '🇬🇧🇯🇵' }
];

// ─────────────────────────────────────────
// ✅ SESSION STATE MANAGEMENT (IMPROVED)
// ─────────────────────────────────────────

let sessionRunning = false;
let sessionLockTimestamp = 0;
let currentSessionId = null;
let schedulerInitialized = false;
let schedulerInterval = null;

// Track sent signals and sessions to prevent duplicates
const sentSignals = new Map(); // Map<signalKey, timestamp>
const completedSessions = new Map(); // Map<sessionKey, timestamp>
const sentReminders = new Map(); // Map<reminderKey, timestamp>

// Lock timeout (if session hangs, allow restart after 45 minutes)
const SESSION_LOCK_TIMEOUT = 45 * 60 * 1000;

// ─────────────────────────────────────────
// ✅ HELPER FUNCTIONS
// ─────────────────────────────────────────

function getBDTime() {
  const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const h = bd.getUTCHours();
  const m = bd.getUTCMinutes();
  const s = bd.getUTCSeconds();
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return {
    h, m, s,
    hStr: String(h).padStart(2, '0'),
    mStr: String(m).padStart(2, '0'),
    sStr: String(s).padStart(2, '0'),
    display: `${h12}:${String(m).padStart(2, '0')} ${period}`,
    dateKey: `${bd.getUTCFullYear()}-${bd.getUTCMonth()}-${bd.getUTCDate()}`
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function generateSessionKey(sessionName) {
  const { dateKey, h } = getBDTime();
  return `${dateKey}-${sessionName}-${h}`;
}

function generateSignalKey(symbol, direction) {
  const { dateKey, h, m } = getBDTime();
  return `${dateKey}-${h}-${Math.floor(m / 5)}-${symbol}-${direction}`;
}

function generateReminderKey(type) {
  const { dateKey, h, m } = getBDTime();
  return `${dateKey}-${type}-${h}-${m}`;
}

// Clean old entries from tracking maps (older than 2 hours)
function cleanupOldEntries() {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000;

  for (const [key, timestamp] of sentSignals.entries()) {
    if (now - timestamp > maxAge) sentSignals.delete(key);
  }
  for (const [key, timestamp] of completedSessions.entries()) {
    if (now - timestamp > maxAge) completedSessions.delete(key);
  }
  for (const [key, timestamp] of sentReminders.entries()) {
    if (now - timestamp > maxAge) sentReminders.delete(key);
  }
}

// ─────────────────────────────────────────
// ✅ SESSION LOCK MANAGEMENT
// ─────────────────────────────────────────

function acquireSessionLock(sessionName) {
  const now = Date.now();

  // If session is running but lock is stale, release it
  if (sessionRunning && sessionLockTimestamp > 0) {
    if (now - sessionLockTimestamp > SESSION_LOCK_TIMEOUT) {
      console.log(`⚠️ Session lock timeout detected, releasing stale lock`);
      releaseSessionLock();
    }
  }

  if (sessionRunning) {
    return false;
  }

  sessionRunning = true;
  sessionLockTimestamp = now;
  currentSessionId = `${sessionName}-${now}`;
  console.log(`🔒 Session lock acquired: ${currentSessionId}`);
  return true;
}

function releaseSessionLock() {
  console.log(`🔓 Session lock released: ${currentSessionId}`);
  sessionRunning = false;
  sessionLockTimestamp = 0;
  currentSessionId = null;
}

function isSessionLocked() {
  if (!sessionRunning) return false;

  // Check for stale lock
  const now = Date.now();
  if (sessionLockTimestamp > 0 && now - sessionLockTimestamp > SESSION_LOCK_TIMEOUT) {
    console.log(`⚠️ Stale session lock detected`);
    return false;
  }

  return true;
}

// ─────────────────────────────────────────
// ✅ SAFE STICKER SENDER (with retry prevention)
// ─────────────────────────────────────────

async function safeSendSticker(bot, fileId, retries = 1) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await bot.sendSticker(CHANNEL_ID, fileId);
      return true;
    } catch (e) {
      console.log(`⚠️ Sticker send failed (attempt ${attempt}): ${e.message}`);
      if (attempt < retries) await sleep(1000);
    }
  }
  return false;
}

// ─────────────────────────────────────────
// ✅ SAFE MESSAGE SENDER (with duplicate prevention)
// ─────────────────────────────────────────

async function safeSendMessage(bot, text, options = {}, retries = 1) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await bot.sendMessage(CHANNEL_ID, text, options);
      return result;
    } catch (e) {
      console.log(`⚠️ Message send failed (attempt ${attempt}): ${e.message}`);
      if (attempt < retries) await sleep(1000);
    }
  }
  return null;
}

// ─────────────────────────────────────────
// ✅ PRICE & CANDLE FUNCTIONS
// ─────────────────────────────────────────

async function getCurrentPrice(symbol) {
  const data = await twelveData.getPrice(symbol);
  return parseFloat(data.price);
}

async function getCandles(symbol, count = 50) {
  const data = await twelveData.getTimeSeries(symbol, '1min', count);
  if (!data.values || !data.values.length) throw new Error('No data');

  const lastCandleTime = new Date(data.values[0].datetime + ' UTC');
  const diffMinutes = (new Date() - lastCandleTime) / (60 * 1000);
  if (diffMinutes > 5) throw new Error('Stale data');

  return data.values.map(v => ({
    open: +v.open,
    high: +v.high,
    low: +v.low,
    close: +v.close,
    volume: +v.volume || 0
  })).reverse();
}

// ─────────────────────────────────────────
// ✅ TECHNICAL ANALYSIS
// ─────────────────────────────────────────

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
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

function calcMACD(candles) {
  return calcEMA(candles, 12) - calcEMA(candles, 26);
}

function calcStochRSI(candles, period = 14) {
  const rsiArr = [];
  for (let i = period; i < candles.length; i++) {
    rsiArr.push(calcRSI(candles.slice(0, i + 1), period));
  }
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
  return {
    upper: sma + 2 * std,
    lower: sma - 2 * std,
    mid: sma
  };
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

function calcCCI(candles, period = 20) {
  const p = Math.min(period, candles.length);
  const slice = candles.slice(-p);
  const typicals = slice.map(c => (c.high + c.low + c.close) / 3);
  const mean = typicals.reduce((a, b) => a + b, 0) / p;
  const mad = typicals.reduce((s, t) => s + Math.abs(t - mean), 0) / p;
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
  const c = candles[len - 1];
  const p = candles[len - 2];
  const p2 = candles[len - 3];
  const body = Math.abs(c.close - c.open);
  const upWick = c.high - Math.max(c.close, c.open);
  const dnWick = Math.min(c.close, c.open) - c.low;
  const range = c.high - c.low || 0.0001;
  const bull = c.close > c.open;
  const bear = c.close < c.open;

  if (bull && p.close < p.open && c.close > p.open && c.open < p.close)
    return { pattern: 'Bullish Engulfing', dir: 'UP', str: 4 };
  if (bear && p.close > p.open && c.open > p.close && c.close < p.open)
    return { pattern: 'Bearish Engulfing', dir: 'DOWN', str: 4 };
  if (dnWick > body * 2.5 && upWick < body * 0.5)
    return { pattern: 'Bullish Pin Bar', dir: 'UP', str: 3 };
  if (upWick > body * 2.5 && dnWick < body * 0.5)
    return { pattern: 'Bearish Pin Bar', dir: 'DOWN', str: 3 };
  if (p2.close < p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && bull)
    return { pattern: 'Morning Star', dir: 'UP', str: 4 };
  if (p2.close > p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && bear)
    return { pattern: 'Evening Star', dir: 'DOWN', str: 4 };
  if (bull && p.close > p.open && p2.close > p2.open && body > range * 0.6)
    return { pattern: 'Three White Soldiers', dir: 'UP', str: 5 };
  if (bear && p.close < p.open && p2.close < p2.open && body > range * 0.6)
    return { pattern: 'Three Black Crows', dir: 'DOWN', str: 5 };
  if (body < range * 0.1)
    return { pattern: 'Doji', dir: 'NEUTRAL', str: 1 };
  if (bull && upWick < body * 0.05 && dnWick < body * 0.05)
    return { pattern: 'Bullish Marubozu', dir: 'UP', str: 3 };
  if (bear && upWick < body * 0.05 && dnWick < body * 0.05)
    return { pattern: 'Bearish Marubozu', dir: 'DOWN', str: 3 };

  return { pattern: 'No Pattern', dir: 'NEUTRAL', str: 0 };
}

// ─────────────────────────────────────────
// ✅ FULL ANALYSIS
// ─────────────────────────────────────────

async function analyzeSymbol(symbol) {
  const candles = await getCandles(symbol, 50);
  const rsi = calcRSI(candles);
  const rsi7 = calcRSI(candles, 7);
  const stoch = calcStochRSI(candles);
  const macd = calcMACD(candles);
  const bb = calcBB(candles);
  const atr = calcATR(candles);
  const cci = calcCCI(candles);
  const wr = calcWilliamsR(candles);
  const trend = calcTrend(candles);
  const cp = calcCandlePattern(candles);
  const last = candles[candles.length - 1].close;

  let up = 0, dn = 0;
  const signals = [];

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

  if (cci < -100) { up += 2; signals.push('CCI Oversold'); }
  else if (cci > 100) { dn += 2; signals.push('CCI Overbought'); }

  if (wr < -80) { up += 2; signals.push('Williams %R Oversold'); }
  else if (wr > -20) { dn += 2; signals.push('Williams %R Overbought'); }

  up += trend.up;
  dn += trend.dn;
  if (trend.dir === 'UP') signals.push('EMA Bullish Alignment');
  else signals.push('EMA Bearish Alignment');

  if (cp.dir === 'UP') { up += cp.str; signals.push(cp.pattern); }
  else if (cp.dir === 'DOWN') { dn += cp.str; signals.push(cp.pattern); }

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
  else confidence = 'Medium ⚡';

  return {
    symbol,
    direction,
    ratio,
    aiScore,
    trend,
    signals: signals.slice(0, 4),
    currentPrice: last,
    volatility,
    confidence,
    isSureShot: aiScore >= 90,
    isValid: ratio >= 0.80 && trend.isStrong && volatility >= 0.005
  };
}

// ─────────────────────────────────────────
// ✅ BEST PAIR FINDER
// ─────────────────────────────────────────

async function findBestPair() {
  let best = null;

  for (const pair of SESSION_PAIRS) {
    try {
      const result = await analyzeSymbol(pair.symbol);
      result.flag = pair.flag;

      console.log(`📊 ${pair.symbol}: Score=${result.aiScore}% | Valid=${result.isValid}`);

      if (!result.isValid) {
        await sleep(1200);
        continue;
      }

      if (!best || result.aiScore > best.aiScore) {
        best = result;
      }

      await sleep(1200);
    } catch (e) {
      console.log(`❌ ${pair.symbol}: ${e.message}`);
      await sleep(500);
    }
  }

  return best;
}

// ─────────────────────────────────────────
// ✅ CANDLE TIMING
// ─────────────────────────────────────────

function waitForSignalTiming() {
  return new Promise(resolve => {
    const check = setInterval(() => {
      const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const s = now.getUTCSeconds();
      if (s >= 40 && s <= 43) {
        clearInterval(check);
        resolve();
      }
    }, 500);

    // Safety timeout after 30 seconds
    setTimeout(() => {
      clearInterval(check);
      resolve();
    }, 30000);
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

    // Safety timeout after 30 seconds
    setTimeout(() => {
      clearInterval(check);
      resolve();
    }, 30000);
  });
}

// ─────────────────────────────────────────
// ✅ SINGLE SIGNAL FLOW (FIXED - No duplicate signals)
// ─────────────────────────────────────────

async function sendSignalAndGetResult(bot, signal) {
  // Generate unique signal key to prevent duplicates
  const signalKey = generateSignalKey(signal.symbol, signal.direction);

  // Check if this signal was already sent
  if (sentSignals.has(signalKey)) {
    console.log(`⚠️ Signal already sent: ${signalKey}, skipping duplicate`);
    return null;
  }

  // Mark signal as sent immediately to prevent race conditions
  sentSignals.set(signalKey, Date.now());

  const pairInfo = SESSION_PAIRS.find(p => p.symbol === signal.symbol);
  const flag = pairInfo ? pairInfo.flag : '';
  const dirLabel = signal.direction === 'UP' ? 'CALL 🟢' : 'PUT 🔴';

  try {
    // ━━━ Step 1: Asset Info Message (Analysis complete, show details) ━━━
    await safeSendMessage(bot,
      `╔══════════════════════╗\n` +
      `     🚀 𝗤𝘅 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝗜𝗣\n` +
      `╚══════════════════════╝\n\n` +
      `💹 𝗔𝗦𝗦𝗘𝗧      ➜ ${signal.symbol} ${flag}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 𝗤𝘅 𝗔𝗜 𝗦𝗖𝗢𝗥𝗘   ➜ ${signal.aiScore}%\n` +
      `🔥 𝗖𝗢𝗡𝗙𝗜𝗗𝗘𝗡𝗖𝗘 ➜ ${signal.confidence}\n` +
      `📊 𝗧𝗥𝗘𝗡𝗗      ➜ ${signal.trend.label}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 𝗔𝗡𝗔𝗟𝗬𝗦𝗜𝗦\n` +
      signal.signals.map(s => `• ${s}`).join('\n') + '\n' +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🛡️ 𝗥𝗜𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧\n` +
      `• Maximum 1 Step MTG\n` +
      `• Never Overtrade\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🤖 Powered by 𝗤𝘅 𝗔𝗜 𝗣𝗿𝗲𝗱𝗶𝗰𝘁𝗼𝗿\n` +
      `⚠️ Trade at your own risk.`,
      { parse_mode: 'Markdown' }
    );

    // ━━━ Step 2: :40s পর্যন্ত অপেক্ষা ━━━
    console.log(`⏳ Candle timing এর জন্য অপেক্ষা...`);
    await waitForSignalTiming();

    // Entry candle time বের করো
    const nowBD = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const nextMin = (nowBD.getUTCMinutes() + 1) % 60;
    const nextH = nowBD.getUTCHours() + (nowBD.getUTCMinutes() + 1 >= 60 ? 1 : 0);
    const entryTime = `${String(nextH % 24).padStart(2, '0')}:${String(nextMin).padStart(2, '0')}`;

    console.log(`📡 Signal timing! Entry: ${entryTime}`);

    // ━━━ Step 3: CALL / PUT Sticker ONLY (No SureShot before result) ━━━
    const dirSticker = signal.direction === 'UP' ? STICKERS.CALL : STICKERS.PUT;
    await safeSendSticker(bot, dirSticker);

    console.log(`✅ ${signal.symbol} ${dirLabel} | Entry: ${entryTime}`);

    // Entry price নাও
    let entryPrice = signal.currentPrice;
    try {
      entryPrice = await getCurrentPrice(signal.symbol);
    } catch (e) {
      console.log('Entry price refresh failed, using cached.');
    }

    // ━━━ Step 4: Candle Close অপেক্ষা ━━━
    console.log(`⏳ Candle close এর জন্য অপেক্ষা...`);
    await waitForCandleClose();
    await sleep(1500);

    // ━━━ Step 5: Exit Price ━━━
    let exitPrice = entryPrice;
    try {
      exitPrice = await getCurrentPrice(signal.symbol);
    } catch (e) {
      console.log('Exit price error: ' + e.message);
    }

    // ━━━ Step 6: WIN / LOSS (SureShot shown ONLY on WIN) ━━━
    const isWin = signal.direction === 'UP'
      ? exitPrice > entryPrice
      : exitPrice < entryPrice;

    console.log(`📊 ${signal.symbol} | Entry: ${entryPrice} | Exit: ${exitPrice} | ${isWin ? 'WIN ✅' : 'LOSS ❌'}`);

    if (isWin) {
      // ✅ SURESHOT sticker ONLY shown after confirmed WIN
      await safeSendSticker(bot, STICKERS.SURESHOT);
      await sleep(600);
      await safeSendMessage(bot,
        `✅ 𝗦𝗜𝗚𝗡𝗔𝗟 𝗥𝗘𝗦𝗨𝗟𝗧\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📊 𝗔𝘀𝘀𝗲𝘁    : ${signal.symbol} ${flag}\n` +
        `🎯 𝗗𝗶𝗿𝗲𝗰𝘁𝗶𝗼𝗻: ${dirLabel}\n` +
        `📈 𝗥𝗲𝘀𝘂𝗹𝘁   : WIN ✅\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `🎯 SURESHOT ✅\n\n` +
        `💎 𝗤𝘅 𝗔𝗜 𝗢𝘄𝗻𝗲𝗿 : @AkiL_xD`,
        { parse_mode: 'Markdown' }
      );
    } else {
      const mtgSticker = signal.direction === 'UP' ? STICKERS.MTG_UP : STICKERS.MTG_DOWN;
      await safeSendSticker(bot, mtgSticker);
      await sleep(600);
      await safeSendMessage(bot,
        `❌ 𝗦𝗜𝗚𝗡𝗔𝗟 𝗥𝗘𝗦𝗨𝗟𝗧 : LOSS\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📊 𝗔𝘀𝘀𝗲𝘁    : ${signal.symbol} ${flag}\n` +
        `🎯 𝗗𝗶𝗿𝗲𝗰𝘁𝗶𝗼𝗻: ${dirLabel}\n` +
        `📈 𝗥𝗲𝘀𝘂𝗹𝘁   : LOSS ❌\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `💪 Wait a recovery signal`,
        { parse_mode: 'Markdown' }
      );
    }

    return isWin;

  } catch (error) {
    console.error(`❌ Signal error for ${signal.symbol}: ${error.message}`);
    // Don't remove from sentSignals - we already tried to send it
    return null;
  }
}

// ─────────────────────────────────────────
// ✅ MAIN SESSION RUNNER (IMPROVED LOCKING)
// ─────────────────────────────────────────

async function runSession(bot, sessionName, isManual = false) {
  // Generate session key to prevent duplicate sessions
  const sessionKey = generateSessionKey(sessionName);

  // Check if this session was already completed recently (within 25 minutes)
  if (!isManual && completedSessions.has(sessionKey)) {
    const lastRun = completedSessions.get(sessionKey);
    const timeSince = Date.now() - lastRun;
    if (timeSince < 25 * 60 * 1000) {
      console.log(`⚠️ ${sessionName} — session already completed ${Math.round(timeSince / 60000)} minutes ago, skipping.`);
      return { started: false, reason: 'already_completed' };
    }
  }

  // Try to acquire session lock
  if (!acquireSessionLock(sessionName)) {
    console.log(`⚠️ ${sessionName} — another session is running, skipping.`);
    return { started: false, reason: 'already_running' };
  }

  try {
    const { display, hStr, mStr } = getBDTime();
    console.log(`🏁 ${sessionName} Session শুরু — BD: ${hStr}:${mStr}`);

    // Mark session as started
    completedSessions.set(sessionKey, Date.now());

    // ━━━ Session Start Sticker ━━━
    await safeSendSticker(bot, STICKERS.SESSION_START);
    await sleep(1500);

    // ━━━ Opening Message ━━━
    await safeSendMessage(bot,
      `🏁 *𝗤𝘅 𝗔𝗜 𝗢𝘄𝗻𝗲𝗿*\n\n` +
      `📈 সবাই Ready থাকুন\n\n` +
      `⏰ সময়: ${display} (BD Time)\n\n` +
      `🎯 ভালো সেটআপ পাওয়া গেলে সিগন্যাল ডিরেকশন দেওয়া হবে\n\n` +
      `সবাই অপেক্ষা করুন অবশ্যই Money management এবং risk management ফলো করবেন`,
      { parse_mode: 'Markdown' }
    );

    // ━━━ ২ মিনিট অপেক্ষা ━━━
    await sleep(2 * 60 * 1000);

    // ━━━ Are You Ready Sticker ━━━
    await safeSendSticker(bot, STICKERS.ARE_YOU_READY);
    await sleep(3000);

    // ━━━ Session Loop ━━━
    const SESSION_DURATION = 30 * 60 * 1000; // ৩০ মিনিট
    const sessionStart = Date.now();
    let signalCount = 0;
    const MAX_SIGNALS = 5;
    let isFirstSignal = true;

    while (
      Date.now() - sessionStart < SESSION_DURATION &&
      signalCount < MAX_SIGNALS
    ) {
      // Check if lock is still valid
      if (!sessionRunning) {
        console.log(`⚠️ Session lock lost, stopping session`);
        break;
      }

      const timeLeft = Math.round((SESSION_DURATION - (Date.now() - sessionStart)) / 60000);
      console.log(`🔍 Scanning... Signal: ${signalCount}/${MAX_SIGNALS} | Time left: ${timeLeft}min`);

      // Best Pair খোঁজো
      let best = null;
      try {
        best = await findBestPair();
      } catch (e) {
        console.error(`❌ Error finding best pair: ${e.message}`);
        await sleep(60000); // Wait 1 minute on error
        continue;
      }

      if (!best) {
        console.log('⏭️ Valid signal নেই, ৩ মিনিট পরে retry...');
        await sleep(3 * 60 * 1000);
        continue;
      }

      // প্রথম signal না হলে NEXT_ONE sticker
      if (!isFirstSignal) {
        await safeSendSticker(bot, STICKERS.NEXT_ONE);
        await sleep(2000);
      }
      isFirstSignal = false;

      // Signal পাঠাও ও result নাও
      try {
        const result = await sendSignalAndGetResult(bot, best);
        if (result !== null) {
          signalCount++;
        }
      } catch (e) {
        console.error(`❌ Signal error: ${e.message}`);
        // Continue with next signal instead of stopping
      }

      // ৫ মিনিট ঘুম
      if (
        signalCount < MAX_SIGNALS &&
        Date.now() - sessionStart < SESSION_DURATION
      ) {
        console.log(`😴 ৫ মিনিট অপেক্ষা...`);
        await sleep(5 * 60 * 1000);
      }
    }

    // ━━━ Session Close ━━━
    await sleep(2000);
    await safeSendSticker(bot, STICKERS.SESSION_CLOSE);
    await sleep(800);

    const { display: endDisplay } = getBDTime();
    await safeSendMessage(bot,
      `🏁 *${sessionName} Session শেষ হয়েছে!*\n\n` +
      `⏰ সময়: ${endDisplay} (BD Time)\n` +
      `📊 *Total Signals:* ${signalCount}\n\n` +
      `🙏 সবাইকে ধন্যবাদ!\n` +
      `💪 পরের session এ আবার দেখা হবে।\n\n` +
      `⚠️ Always trade at your own risk.`,
      { parse_mode: 'Markdown' }
    );

    console.log(`✅ ${sessionName} Session শেষ | Total: ${signalCount}`);
    return { started: true, signalCount };

  } catch (err) {
    console.error(`💥 Session error: ${err.message}`);
    throw err;
  } finally {
    releaseSessionLock();
    // Cleanup old entries
    cleanupOldEntries();
  }
}

// ─────────────────────────────────────────
// ✅ AUTO SCHEDULER (SINGLETON - PREVENTS DUPLICATE INTERVALS)
// ─────────────────────────────────────────

module.exports = function (bot) {
  // Prevent multiple scheduler initializations
  if (schedulerInitialized) {
    console.log('⚠️ Scheduler already initialized, skipping duplicate initialization');
    return;
  }

  schedulerInitialized = true;
  console.log('✅ Session scheduler started!');

  // Clear any existing interval (safety measure)
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }

  schedulerInterval = setInterval(async () => {
    try {
      const { h, m, s } = getBDTime();

      // Morning Reminder — ৯:৩০
      if (h === 9 && m === 30 && s < 10) {
        const reminderKey = generateReminderKey('morning_reminder');
        if (!sentReminders.has(reminderKey)) {
          sentReminders.set(reminderKey, Date.now());
          await safeSendMessage(bot,
            `⏰ *Morning Session শুরু হবে ৩০ মিনিট পরে!*\n\n` +
            `🕙 সকাল ১০:০০ টায় শুরু হবে\n` +
            `📊 সবাই রেডি থাকুন! ✅\n\n` +
            `💹 আজকের Best Signals নিয়ে আসছি!`,
            { parse_mode: 'Markdown' }
          );
        }
      }

      // Morning Session — ১০:০০
      if (h === 10 && m === 0 && s < 10) {
        const sessionKey = generateSessionKey('🌅 Morning');
        if (!completedSessions.has(sessionKey) && !isSessionLocked()) {
          runSession(bot, '🌅 Morning', false).catch(err => {
            console.error('Morning session error:', err.message);
          });
        }
      }

      // Evening Reminder — ২০:৩০
      if (h === 20 && m === 30 && s < 10) {
        const reminderKey = generateReminderKey('evening_reminder');
        if (!sentReminders.has(reminderKey)) {
          sentReminders.set(reminderKey, Date.now());
          await safeSendMessage(bot,
            `🌙 *Evening Session শুরু হবে ৩০ মিনিট পরে!*\n\n` +
            `🕙 রাত ৯:০০ টায় শুরু হবে\n` +
            `📊 সবাই রেডি থাকুন! ✅\n\n` +
            `💹 Evening এর Best Signals নিয়ে আসছি!`,
            { parse_mode: 'Markdown' }
          );
        }
      }

      // Evening Session — ২১:০০
      if (h === 21 && m === 0 && s < 10) {
        const sessionKey = generateSessionKey('🌙 Evening');
        if (!completedSessions.has(sessionKey) && !isSessionLocked()) {
          runSession(bot, '🌙 Evening', false).catch(err => {
            console.error('Evening session error:', err.message);
          });
        }
      }

      // Cleanup old entries every hour
      if (m === 0 && s < 10) {
        cleanupOldEntries();
      }

    } catch (e) {
      console.error('Scheduler error:', e.message);
    }
  }, 5000);
};

// ✅ Admin manual control (with isManual flag)
module.exports.runSession = (bot, sessionName) => runSession(bot, sessionName, true);
module.exports.isSessionRunning = () => sessionRunning;

// ✅ Cleanup function for graceful shutdown
module.exports.cleanup = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  schedulerInitialized = false;
  releaseSessionLock();
  console.log('✅ Session scheduler cleaned up');
};
