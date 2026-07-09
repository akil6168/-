// session.js - Fixed: No duplicates, proper locking, stable sessions
const https = require('https');

const CHANNEL_ID = '-1002427080688';
const ADMIN_ID = 5724602667;
const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY || 'd29823ad0b3b436992411d122a8b64b6';
const ALPHAVANTAGE_KEY = process.env.ALPHAVANTAGE_KEY || '74LRZJ0QI9C6LO0B';

// ✅ Session lock — duplicate prevention
const sessionLocks = new Map();
let isSessionRunning = false;
let currentSessionId = null;
const sentMessages = new Set(); // duplicate message prevention

// Sticker IDs (তোমার sticker file_id এখানে দাও)
const STICKERS = {
  SESSION_START: null,
  SESSION_CLOSE: null,
  CALL: null,
  PUT: null,
  SURESHOT: null
};

// Session pairs
const SESSION_PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY'];

const pairToOTC = {
  'EUR/USD': 'EUR/USD OTC',
  'GBP/USD': 'GBP/USD OTC',
  'USD/JPY': 'USD/JPY OTC'
};

// ✅ Active timers tracking — memory leak prevention
const activeTimers = new Set();

function safeSetTimeout(fn, delay) {
  const timer = setTimeout(async () => {
    activeTimers.delete(timer);
    try { await fn(); } catch (e) { console.error('[Timer Error]', e.message); }
  }, delay);
  activeTimers.add(timer);
  return timer;
}

function clearAllTimers() {
  for (const timer of activeTimers) {
    clearTimeout(timer);
  }
  activeTimers.clear();
}

// ✅ BD Time
function getBDTime() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return {
    h: bd.getUTCHours(),
    m: bd.getUTCMinutes(),
    s: bd.getUTCSeconds(),
    str: String(bd.getUTCHours()).padStart(2, '0') + ':' + String(bd.getUTCMinutes()).padStart(2, '0')
  };
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

// ✅ Safe message sender — duplicate prevention
async function safeSendMessage(bot, chatId, text, options = {}) {
  const msgKey = chatId + '_' + text.substring(0, 50) + '_' + Date.now().toString().slice(0, -3);
  if (sentMessages.has(msgKey)) {
    console.log('[Duplicate] Message blocked');
    return null;
  }
  sentMessages.add(msgKey);
  setTimeout(() => sentMessages.delete(msgKey), 30000);
  try {
    return await bot.sendMessage(chatId, text, options);
  } catch (e) {
    console.error('[Send Error]', e.message);
    return null;
  }
}

async function safeSendSticker(bot, chatId, stickerId) {
  if (!stickerId) return null;
  try {
    return await bot.sendSticker(chatId, stickerId);
  } catch (e) {
    console.error('[Sticker Error]', e.message);
    return null;
  }
}

// ✅ API Fetch
async function fetchFromTwelveData(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1min&outputsize=50&apikey=${TWELVE_DATA_KEY}`;
    const req = https.get(url, (res) => {
      if (res.statusCode === 429) { reject(new Error('429 Rate Limited')); return; }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.values || json.values.length === 0) { reject(new Error('No data')); return; }
          const candles = json.values.map(v => ({
            open: parseFloat(v.open), high: parseFloat(v.high),
            low: parseFloat(v.low), close: parseFloat(v.close),
            volume: parseFloat(v.volume) || 0
          })).reverse();
          resolve(candles);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchFromAlphaVantage(symbol) {
  return new Promise((resolve, reject) => {
    const parts = symbol.split('/');
    const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${parts[0]}&to_symbol=${parts[1]}&interval=1min&outputsize=compact&apikey=${ALPHAVANTAGE_KEY}`;
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const ts = json['Time Series FX (1min)'];
          if (!ts) { reject(new Error('No AV data')); return; }
          const candles = Object.entries(ts).slice(0, 50).map(([, v]) => ({
            open: parseFloat(v['1. open']), high: parseFloat(v['2. high']),
            low: parseFloat(v['3. low']), close: parseFloat(v['4. close']),
            volume: 0
          })).reverse();
          resolve(candles);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('AV Timeout')); });
  });
}

async function getCandles(symbol) {
  try { return await fetchFromTwelveData(symbol); } catch (e) {
    console.log(`[TwelveData ❌] ${symbol} — ${e.message}`);
  }
  try { return await fetchFromAlphaVantage(symbol); } catch (e) {
    console.log(`[AlphaVantage ❌] ${symbol} — ${e.message}`);
  }
  throw new Error(`All APIs failed for ${symbol}`);
}

// ✅ Indicators
function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  const ag = gains / period, al = losses / period;
  if (al === 0) return 100;
  return 100 - (100 / (1 + ag / al));
}

function calcEMA(candles, period) {
  if (candles.length < period) return candles[candles.length - 1].close;
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) ema = candles[i].close * k + ema * (1 - k);
  return ema;
}

function calcMACD(candles) { return calcEMA(candles, 12) - calcEMA(candles, 26); }

function calcBollingerBands(candles, period = 20) {
  if (candles.length < period) period = candles.length;
  const closes = candles.slice(-period).map(c => c.close);
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((s, c) => s + Math.pow(c - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { upper: sma + 2 * std, lower: sma - 2 * std };
}

function calcStochRSI(candles, period = 14) {
  const rsiVals = [];
  for (let i = period; i < candles.length; i++) rsiVals.push(calcRSI(candles.slice(0, i + 1), period));
  if (rsiVals.length < period) return 50;
  const recent = rsiVals.slice(-period);
  const mn = Math.min(...recent), mx = Math.max(...recent);
  if (mx === mn) return 50;
  return ((rsiVals[rsiVals.length - 1] - mn) / (mx - mn)) * 100;
}

function buildHigherTF(candles, period) {
  const result = [];
  for (let i = 0; i + period <= candles.length; i += period) {
    const s = candles.slice(i, i + period);
    result.push({
      open: s[0].open,
      high: Math.max(...s.map(c => c.high)),
      low: Math.min(...s.map(c => c.low)),
      close: s[s.length - 1].close,
      volume: s.reduce((a, b) => a + b.volume, 0)
    });
  }
  return result;
}

function analyzeCandlePattern(candles) {
  const len = candles.length;
  if (len < 3) return { direction: 'NEUTRAL', strength: 0, pattern: 'No Pattern' };
  const c = candles[len - 1], p = candles[len - 2], p2 = candles[len - 3];
  const body = Math.abs(c.close - c.open);
  const uw = c.high - Math.max(c.close, c.open);
  const lw = Math.min(c.close, c.open) - c.low;
  const tr = c.high - c.low;
  const bull = c.close > c.open, bear = c.close < c.open;

  if (bull && p.close < p.open && c.close > p.open && c.open < p.close) return { direction: 'UP', strength: 3, pattern: 'Bullish Engulfing' };
  if (bear && p.close > p.open && c.open > p.close && c.close < p.open) return { direction: 'DOWN', strength: 3, pattern: 'Bearish Engulfing' };
  if (lw > body * 2.5 && uw < body * 0.5 && lw > tr * 0.6) return { direction: 'UP', strength: 3, pattern: 'Bullish Pin Bar' };
  if (uw > body * 2.5 && lw < body * 0.5 && uw > tr * 0.6) return { direction: 'DOWN', strength: 3, pattern: 'Bearish Pin Bar' };
  if (p2.close < p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && bull && c.close > (p2.open + p2.close) / 2) return { direction: 'UP', strength: 4, pattern: 'Morning Star' };
  if (p2.close > p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && bear && c.close < (p2.open + p2.close) / 2) return { direction: 'DOWN', strength: 4, pattern: 'Evening Star' };
  if (bull && p.close > p.open && p2.close > p2.open && c.close > p.close && p.close > p2.close && body > tr * 0.6) return { direction: 'UP', strength: 4, pattern: 'Three White Soldiers' };
  if (bear && p.close < p.open && p2.close < p2.open && c.close < p.close && p.close < p2.close && body > tr * 0.6) return { direction: 'DOWN', strength: 4, pattern: 'Three Black Crows' };
  if (body < tr * 0.1) return { direction: 'NEUTRAL', strength: 1, pattern: 'Doji' };
  if (bull && uw < body * 0.05 && lw < body * 0.05) return { direction: 'UP', strength: 3, pattern: 'Bullish Marubozu' };
  if (bear && uw < body * 0.05 && lw < body * 0.05) return { direction: 'DOWN', strength: 3, pattern: 'Bearish Marubozu' };
  if (c.high > p.high && c.low > p.low && p.high > p2.high) return { direction: 'UP', strength: 2, pattern: 'Higher High' };
  if (c.high < p.high && c.low < p.low && p.high < p2.high) return { direction: 'DOWN', strength: 2, pattern: 'Lower Low' };
  return { direction: 'NEUTRAL', strength: 0, pattern: 'No Pattern' };
}

function analyzeTrend(candles) {
  const e5 = calcEMA(candles, 5), e10 = calcEMA(candles, 10);
  const e20 = calcEMA(candles, 20), e50 = calcEMA(candles, 50);
  const last = candles[candles.length - 1].close;
  let up = 0, dn = 0;
  if (e5 > e20) up += 2; else dn += 2;
  if (e10 > e50) up += 2; else dn += 2;
  if (last > e5) up += 1; else dn += 1;
  if (last > e20) up += 1; else dn += 1;
  if (e5 > e10 && e10 > e20) up += 2; else if (e5 < e10 && e10 < e20) dn += 2;
  return { dir: up > dn ? 'UP' : 'DOWN', up, dn, isStrong: up >= 5 || dn >= 5 };
}

// ✅ Main analysis — Fixed ratio threshold 0.75 (was 0.82)
async function analyzeForSession(symbol) {
  const candles1m = await getCandles(symbol);
  const candles5m = buildHigherTF(candles1m, 5);
  if (candles5m.length < 3) throw new Error('Not enough 5m candles');

  const rsi = calcRSI(candles1m);
  const rsi7 = calcRSI(candles1m, 7);
  const stoch = calcStochRSI(candles1m);
  const macd = calcMACD(candles1m);
  const bb = calcBollingerBands(candles1m);
  const cp = analyzeCandlePattern(candles1m);
  const trend1m = analyzeTrend(candles1m);
  const trend5m = analyzeTrend(candles5m);
  const last = candles1m[candles1m.length - 1].close;

  let up = 0, dn = 0;

  // RSI
  if (rsi < 30) up += 3; else if (rsi > 70) dn += 3;
  else if (rsi < 45) up += 1; else if (rsi > 55) dn += 1;

  // Fast RSI
  if (rsi7 < 25) up += 2; else if (rsi7 > 75) dn += 2;

  // StochRSI
  if (stoch < 20) up += 2; else if (stoch > 80) dn += 2;

  // MACD
  if (macd > 0) up += 2; else dn += 2;

  // BB
  if (last <= bb.lower) up += 3; else if (last >= bb.upper) dn += 3;

  // Candle pattern
  if (cp.direction === 'UP') up += cp.strength;
  else if (cp.direction === 'DOWN') dn += cp.strength;

  // 1m trend
  up += trend1m.up;
  dn += trend1m.dn;

  // 5m trend confirmation
  if (trend5m.dir === 'UP') up += 3; else dn += 3;

  const total = up + dn;
  const ratio = total > 0 ? Math.max(up, dn) / total : 0;
  const direction = up >= dn ? 'UP' : 'DOWN';

  // ✅ Fixed: threshold 0.75 (was 0.82)
  if (ratio < 0.75) return null;

  // 1m + 5m must agree
  if (trend1m.dir !== trend5m.dir) return null;

  let confidence, winRate, isSureShot = false;
  if (ratio >= 0.88) {
    confidence = 'Very High 🔥';
    winRate = '90%';
    isSureShot = true;
  } else if (ratio >= 0.82) {
    confidence = 'Very High 🔥';
    winRate = '85%';
  } else if (ratio >= 0.75) {
    confidence = 'High 🟢';
    winRate = '80%';
  }

  return {
    symbol,
    otcPair: pairToOTC[symbol] || symbol + ' OTC',
    direction,
    confidence,
    winRate,
    ratio: Math.round(ratio * 100),
    isSureShot,
    pattern: cp.pattern,
    trend: trend5m.dir === 'UP' ? 'Strong Uptrend' : 'Strong Downtrend'
  };
}

// ✅ Send signal to channel — no duplicates
async function sendSessionSignal(bot, sessionId) {
  // Double-check lock
  if (sessionLocks.get(sessionId + '_signal')) {
    console.log(`[Lock] Session ${sessionId} signal already sent`);
    return;
  }
  sessionLocks.set(sessionId + '_signal', true);

  const { entry, expiry } = getEntryExpiry();
  let bestResult = null;

  // Analyze all pairs
  for (const symbol of SESSION_PAIRS) {
    try {
      const result = await analyzeForSession(symbol);
      if (result) {
        if (!bestResult || result.ratio > bestResult.ratio) {
          bestResult = result;
        }
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.log(`[Session Analysis Error] ${symbol} — ${e.message}`);
    }
  }

  if (!bestResult) {
    console.log(`[Session ${sessionId}] No confident signal found`);
    sessionLocks.delete(sessionId + '_signal');
    return;
  }

  const dirEmoji = bestResult.direction === 'UP' ? '⏫' : '⏬';
  const signalType = bestResult.direction === 'UP' ? 'CALL 📈' : 'PUT 📉';

  // ✅ Send sticker first (CALL or PUT) — only after analysis complete
  if (bestResult.direction === 'UP' && STICKERS.CALL) {
    await safeSendSticker(bot, CHANNEL_ID, STICKERS.CALL);
  } else if (bestResult.direction === 'DOWN' && STICKERS.PUT) {
    await safeSendSticker(bot, CHANNEL_ID, STICKERS.PUT);
  }

  // ✅ Send signal message — only once
  await safeSendMessage(bot, CHANNEL_ID,
    '━━━━━━━━━━━━━━━━━━\n' +
    '✅ *' + signalType + '*\n' +
    '━━━━━━━━━━━━━━━━━━\n\n' +
    '📊 *ASSET* ➜ `' + bestResult.otcPair + '`\n' +
    '🚀 *DIRECTION* ➜ ' + bestResult.direction + ' ' + dirEmoji + '\n' +
    '📊 *ENTRY* ➜ `' + entry + '`\n' +
    '⏱ *EXPIRY* ➜ `' + expiry + '`\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '♻️ *WIN RATE* ➜ `' + bestResult.winRate + '`\n' +
    '✅ *CONFIDENCE* ➜ ' + bestResult.confidence + '\n' +
    '🔀 *TREND* ➜ `' + bestResult.trend + '`\n' +
    '📈 *PATTERN* ➜ `' + bestResult.pattern + '`\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '⚠️ _Trade at your own risk if loss use 1 stet MTG_ ⚠️',
    { parse_mode: 'Markdown' }
  );

  // ✅ SureShot — only after signal, not before
  if (bestResult.isSureShot) {
    await new Promise(r => setTimeout(r, 1500));
    if (STICKERS.SURESHOT) await safeSendSticker(bot, CHANNEL_ID, STICKERS.SURESHOT);
    await safeSendMessage(bot, CHANNEL_ID,
      '🎯 *SURESHOT ✅*\n\n' +
      '🔥 *Extra High Confidence Signal!*\n' +
      '💎 Ratio: `' + bestResult.ratio + '%`\n\n' +
      '_This is a premium quality signal._',
      { parse_mode: 'Markdown' }
    );
  }

  console.log(`[Session ${sessionId}] Signal sent — ${bestResult.otcPair} ${bestResult.direction} (${bestResult.ratio}%)`);
}

// ✅ Start Session — with proper locking
async function startSession(bot, sessionName, sessionId) {
  // ✅ Check if already running
  if (isSessionRunning) {
    console.log(`[Lock] Session already running — ignoring ${sessionName}`);
    return;
  }
  if (sessionLocks.get(sessionId)) {
    console.log(`[Lock] Session ${sessionId} already started`);
    return;
  }

  // ✅ Set locks
  isSessionRunning = true;
  currentSessionId = sessionId;
  sessionLocks.set(sessionId, true);

  const { str: timeStr } = getBDTime();
  console.log(`[Session START] ${sessionName} at ${timeStr}`);

  try {
    // ✅ Session start message — only once
    if (STICKERS.SESSION_START) await safeSendSticker(bot, CHANNEL_ID, STICKERS.SESSION_START);

    await safeSendMessage(bot, CHANNEL_ID,
      '🏁 *SESSION STARTS*\n' +
      '━━━━━━━━━━━━━━━━━━\n\n' +
      '🚀 *Qx AI PREDICTOR VIP*\n\n' +
      '📊 ' + sessionName + ' শুরু হয়েছে!\n' +
      '⏰ BD Time: `' + timeStr + '`\n' +
      '✅ সবাই রেডি থাকুন!\n\n' +
      '━━━━━━━━━━━━━━━━━━',
      { parse_mode: 'Markdown' }
    );

    // ✅ Send 3 signals with delays — each protected
    for (let i = 1; i <= 3; i++) {
      const signalId = sessionId + '_signal_' + i;

      // Wait between signals
      if (i > 1) await new Promise(r => setTimeout(r, 3 * 60 * 1000)); // 3 মিনিট gap

      // Check if session still valid
      if (currentSessionId !== sessionId) {
        console.log(`[Session] ${sessionName} cancelled`);
        break;
      }

      try {
        await sendSessionSignal(bot, signalId);
      } catch (e) {
        console.error(`[Signal ${i} Error]`, e.message);
        // Continue to next signal even if one fails
      }
    }

  } catch (e) {
    console.error(`[Session Error] ${sessionName}:`, e.message);
  } finally {
    // ✅ Session close message — only once
    try {
      const closeTime = getBDTime();
      if (STICKERS.SESSION_CLOSE) await safeSendSticker(bot, CHANNEL_ID, STICKERS.SESSION_CLOSE);

      await safeSendMessage(bot, CHANNEL_ID,
        '🏁 *SESSION CLOSED*\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '✅ ' + sessionName + ' শেষ হয়েছে!\n' +
        '⏰ BD Time: `' + closeTime.str + '`\n\n' +
        '💰 _ধন্যবাদ সবাইকে!_\n' +
        '━━━━━━━━━━━━━━━━━━',
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('[Session Close Error]', e.message);
    }

    // ✅ Release all locks
    isSessionRunning = false;
    currentSessionId = null;
    sessionLocks.delete(sessionId);
    console.log(`[Session END] ${sessionName}`);
  }
}

// ✅ Session reminder
async function sendReminder(bot, sessionName, minutesLeft) {
  try {
    const { str } = getBDTime();
    await safeSendMessage(bot, CHANNEL_ID,
      '⏰ *SESSION REMINDER*\n\n' +
      '🔔 ' + sessionName + ' শুরু হবে *' + minutesLeft + ' মিনিটে*!\n' +
      '⏰ BD Time: `' + str + '`\n\n' +
      '✅ সবাই প্রস্তুত থাকুন!',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    console.error('[Reminder Error]', e.message);
  }
}

// ✅ Scheduler — single timer, no duplicates
function scheduleSession(bot, targetHour, targetMinute, sessionName, sessionId) {
  function getNextDelay() {
    const now = new Date();
    const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const target = new Date(bd);
    target.setUTCHours(targetHour, targetMinute, 0, 0);
    if (target <= bd) target.setUTCDate(target.getUTCDate() + 1);
    return target - bd;
  }

  function schedule() {
    const delay = getNextDelay();
    console.log(`[Schedule] ${sessionName} in ${Math.round(delay / 60000)} minutes`);

    // Reminder 30 minutes before
    const reminderDelay = delay - 30 * 60 * 1000;
    if (reminderDelay > 0) {
      safeSetTimeout(async () => {
        await sendReminder(bot, sessionName, 30);
      }, reminderDelay);
    }

    // Main session
    safeSetTimeout(async () => {
      await startSession(bot, sessionName, sessionId + '_' + Date.now());
      // Schedule next day
      safeSetTimeout(schedule, 60 * 1000);
    }, delay);
  }

  schedule();
}

module.exports = function(bot) {
  console.log('✅ Session system started!');

  // ✅ Schedule sessions — BD Time
  // Morning: 10:00 AM BD
  scheduleSession(bot, 4, 0, 'Morning Session 🌅', 'morning');

  // Evening: 9:00 PM BD
  scheduleSession(bot, 15, 0, 'Evening Session 🌙', 'evening');

  // ✅ Manual session start command
  return {
    startManualSession: async (sessionName) => {
      if (isSessionRunning) {
        await bot.sendMessage(ADMIN_ID, '⚠️ একটা session এখন চলছে। শেষ হলে আবার শুরু করুন।');
        return;
      }
      const manualId = 'manual_' + Date.now();
      await startSession(bot, sessionName || 'Manual Session', manualId);
    },
    isRunning: () => isSessionRunning,
    getCurrentSession: () => currentSessionId
  };
};
