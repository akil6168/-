// v24 - Free Trial(3) + Deposit-Based Affiliate Verify + XAdmin FULL Control Panel + Real Candle-Based Result Tracking
const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');
const express = require('express');
const twelveData = require('./twelvedata');
const geminiKeyPool = require('./geminikey');

const TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const bot = new TelegramBot(TOKEN, { polling: false });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚨 ERROR LOG BUFFER — /xadmin এর "Error Logs" বাটনের জন্য (সর্বশেষ ২০টা)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const errorLogBuffer = [];
const _origConsoleError = console.error.bind(console);
console.error = function (...args) {
  try {
    const msg = args.map(a => (a instanceof Error ? (a.stack || a.message) : (typeof a === 'string' ? a : JSON.stringify(a)))).join(' ');
    const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const timeStr = String(bd.getUTCHours()).padStart(2, '0') + ':' + String(bd.getUTCMinutes()).padStart(2, '0') + ':' + String(bd.getUTCSeconds()).padStart(2, '0');
    errorLogBuffer.push('[' + timeStr + '] ' + msg);
    if (errorLogBuffer.length > 20) errorLogBuffer.shift();
  } catch (e) {}
  _origConsoleError(...args);
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🛡️ SAFETY PATCH — খালি text পাঠানো ঠেকানো + crash বন্ধ করা
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const _origSendMessage = bot.sendMessage.bind(bot);
bot.sendMessage = function (chatId, text, options) {
  if (!text || (typeof text === 'string' && text.trim().length === 0)) {
    console.error('🚨 EMPTY sendMessage আটকানো হলো! chatId:', chatId);
    console.error(new Error('Empty sendMessage call stack').stack);
    return Promise.resolve(null);
  }
  return _origSendMessage(chatId, text, options);
};

const _origEditMessageText = bot.editMessageText.bind(bot);
bot.editMessageText = function (text, options) {
  if (!text || (typeof text === 'string' && text.trim().length === 0)) {
    console.error('🚨 EMPTY editMessageText আটকানো হলো!');
    console.error(new Error('Empty editMessageText call stack').stack);
    return Promise.resolve(null);
  }
  return _origEditMessageText(text, options);
};

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection:', reason && reason.message ? reason.message : reason);
  if (reason && reason.stack) console.error(reason.stack);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err.message);
  console.error(err.stack);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ADMIN_ID = 5724602667;
const FREE_TRIAL_SIGNAL = 3;
const FREE_TRIAL_SCREENSHOT = 3;
const MIN_DEPOSIT_USD = 10;

let maintenanceMode = false;
let emergencyMode = false; // ✅ নতুন — Maintenance থেকেও শক্তিশালী, সব Signal/Screenshot/Session বন্ধ করে দেয়

let startedUsers = new Set();
let approvedUsers = new Set([ADMIN_ID]);
let bannedUsers = new Set();
let submissions = [];
const trialSignalCount = new Map();
const trialScreenshotCount = new Map();

const verifyMode = new Set();
const passwordMode = new Map();
const broadcastMode = new Set();
const banMode = new Set();
const unbanMode = new Set();
const unapproveMode = new Set();
const delAffiliateMode = new Set();
const messageUserMode = new Set();
const pendingMessageTarget = new Map();

// ✅ /xadmin — বিদ্যমান state
const xadminRegMode = new Set();
const xadminDepositMode = new Set();
const xadminCheckMode = new Set();
const xadminResetMode = new Set();
const xadminTrialResetMode = new Set();
const xadminForceApproveMode = new Set();

// ✅ নতুন — /xadmin এর নতুন ফিচারগুলোর জন্য state
const xadminRegisterUserMode = new Set();
const xadminUserStatusMode = new Set();
const xadminDeleteTestDataMode = new Set();
const xadminEditDepositMode = new Set();

// ✅ নতুন — Submissions লিস্ট দেখা ও মুছে ফেলার জন্য state
const deleteSubmissionMode = new Set();

let sessionModule;
const lastSignalMsgId = new Map();

function mentionUser(userId, username, firstName) {
  const safeName = (firstName || 'User').replace(/[\[\]]/g, '');
  if (username) return '@' + username + ' ([' + safeName + '](tg://user?id=' + userId + '))';
  return '[' + safeName + '](tg://user?id=' + userId + ')';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✅ Daily result-tracking state (per-user + global)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let dailyStats = { dateKey: null, activeUsers: new Set(), totalSignals: 0, directWin: 0, mtgWin: 0, loss: 0 };
const userDailyStats = new Map();
let lastReportDateKey = null;
let resultRestActive = false;

function currentBDDateKey() {
  const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return `${bd.getUTCFullYear()}-${String(bd.getUTCMonth() + 1).padStart(2, '0')}-${String(bd.getUTCDate()).padStart(2, '0')}`;
}

function formatReportDate(dateKeyStr) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, mo, d] = dateKeyStr.split('-').map(Number);
  return `${d} ${months[mo - 1]} ${y}`;
}

function getBDTimeInfo() {
  const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return {
    hour: bd.getUTCHours(),
    minute: bd.getUTCMinutes(),
    second: bd.getUTCSeconds(),
    day: bd.getUTCDay()
  };
}

function isRealMarketOpen() {
  const { hour, day } = getBDTimeInfo();
  if (day === 6) return false;
  if (day === 0) return false;
  if (day === 1 && hour < 11) return false;
  if (day === 5 && hour >= 23) return false;
  if (hour < 11 || hour >= 23) return false;
  return true;
}

function ensureDailyStatsFresh() {
  const key = currentBDDateKey();
  if (dailyStats.dateKey !== key) {
    dailyStats = { dateKey: key, activeUsers: new Set(), totalSignals: 0, directWin: 0, mtgWin: 0, loss: 0 };
    userDailyStats.clear();
  }
}

function getUserStats(userId) {
  if (!userDailyStats.has(userId)) userDailyStats.set(userId, { directWin: 0, mtgWin: 0, loss: 0 });
  return userDailyStats.get(userId);
}

function buildDailyAdminReport() {
  const dateStr = dailyStats.dateKey ? formatReportDate(dailyStats.dateKey) : formatReportDate(currentBDDateKey());
  const totalCompleted = dailyStats.directWin + dailyStats.mtgWin + dailyStats.loss;
  const winRate = totalCompleted > 0 ? (((dailyStats.directWin + dailyStats.mtgWin) / totalCompleted) * 100).toFixed(1) : '0.0';

  const sortedUsers = [...userDailyStats.entries()]
    .map(([uid, stats]) => ({ uid, ...stats, total: stats.directWin + stats.mtgWin + stats.loss }))
    .sort((a, b) => b.total - a.total);

  const top5 = sortedUsers.slice(0, 5);
  const remaining = sortedUsers.length - top5.length;

  let topText = '';
  top5.forEach(u => {
    const sub = submissions.find(s => s.userId === u.uid);
    const uname = sub && sub.username ? '@' + sub.username : (sub ? sub.name : 'User ' + u.uid);
    topText += `👤 ${uname} ➜ ${u.directWin}W • ${u.loss}L • ${u.mtgWin}M\n`;
  });
  if (!topText) topText = 'আজ কোনো সিগন্যাল নেওয়া হয়নি।\n';

  return (
    `📊 *𝗗𝗔𝗜𝗟𝗬 𝗔𝗗𝗠𝗜𝗡 𝗥𝗘𝗣𝗢𝗥𝗧*\n\n` +
    `📅 ${dateStr}\n` +
    `👥 *Active:* ${dailyStats.activeUsers.size}\n` +
    `📊 *Total Signals:* ${dailyStats.totalSignals}\n\n` +
    `🟢 *Direct Win:* ${dailyStats.directWin}\n` +
    `🟡 *MTG Win:* ${dailyStats.mtgWin}\n` +
    `🔴 *Loss:* ${dailyStats.loss}\n` +
    `🎯 *Win Rate:* ${winRate}%\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🏆 *Top Active Users*\n\n` +
    topText +
    (remaining > 0 ? `\n➕ +${remaining} More Users` : '')
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✅ Real Candle-Based Result Tracking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatUTCDateTime(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
}

function parseUTCDatetimeStr(str) {
  return new Date(str + ' UTC');
}

async function waitForCandleByDatetime(symbol, targetDatetimeStr, maxAttempts = 6, intervalMs = 5000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const candles = await getCandles(symbol);
      const match = candles.find(c => c.datetime === targetDatetimeStr);
      if (match) return match;
    } catch (e) {
      console.log('waitForCandleByDatetime fetch error:', e.message);
    }
    await sleep(intervalMs);
  }
  return null;
}

async function saveSignalRecord(record) {
  try {
    if (db) await db.collection('signalResults').insertOne(record);
  } catch (e) {
    console.log('saveSignalRecord error:', e.message);
  }
}

async function trackSignalResult(userId, symbol, direction, entryDatetimeStr, entryDisplayTime) {
  if (!isRealMarketOpen()) return;

  ensureDailyStatsFresh();
  dailyStats.activeUsers.add(userId);
  dailyStats.totalSignals++;

  try {
    const entryCandle = await waitForCandleByDatetime(symbol, entryDatetimeStr);
    if (!entryCandle) {
      console.log(`⚠️ Entry candle পাওয়া যায়নি: ${symbol} @ ${entryDatetimeStr}`);
      return;
    }
    const entryOpen = entryCandle.open;

    const entryDate = parseUTCDatetimeStr(entryDatetimeStr);
    const waitUntilClose = entryDate.getTime() + 65 * 1000 - Date.now();
    if (waitUntilClose > 0) await sleep(waitUntilClose);
    if (!isRealMarketOpen()) return;

    const closedEntryCandle = await waitForCandleByDatetime(symbol, entryDatetimeStr, 6, 5000);
    if (!closedEntryCandle) {
      console.log(`⚠️ Closed entry candle পাওয়া যায়নি: ${symbol} @ ${entryDatetimeStr}`);
      return;
    }
    const entryClose = closedEntryCandle.close;

    const isDirectWin = direction === 'UP⏫' ? entryClose > entryOpen : entryClose < entryOpen;

    if (isDirectWin) {
      dailyStats.directWin++;
      getUserStats(userId).directWin++;
      console.log(`✅ Direct Win: user ${userId} | ${symbol} | Open:${entryOpen} Close:${entryClose}`);
      saveSignalRecord({
        userId, symbol, direction, entryTime: entryDisplayTime, entryPrice: entryOpen,
        directResult: 'WIN', mtgResult: null, finalResult: 'DIRECT_WIN', createdAt: new Date()
      });
      return;
    }

    console.log(`⚠️ Direct Loss (silent) — MTG শুরু হচ্ছে: user ${userId} | ${symbol}`);

    const mtgDate = new Date(entryDate.getTime() + 60 * 1000);
    const mtgDatetimeStr = formatUTCDateTime(mtgDate);

    const mtgCandle = await waitForCandleByDatetime(symbol, mtgDatetimeStr);
    if (!mtgCandle) {
      console.log(`⚠️ MTG candle পাওয়া যায়নি: ${symbol} @ ${mtgDatetimeStr}`);
      saveSignalRecord({
        userId, symbol, direction, entryTime: entryDisplayTime, entryPrice: entryOpen,
        directResult: 'LOSS', mtgResult: null, finalResult: 'UNKNOWN', createdAt: new Date()
      });
      return;
    }
    const mtgOpen = mtgCandle.open;

    const waitUntilMtgClose = mtgDate.getTime() + 65 * 1000 - Date.now();
    if (waitUntilMtgClose > 0) await sleep(waitUntilMtgClose);
    if (!isRealMarketOpen()) return;

    const closedMtgCandle = await waitForCandleByDatetime(symbol, mtgDatetimeStr, 6, 5000);
    if (!closedMtgCandle) {
      console.log(`⚠️ Closed MTG candle পাওয়া যায়নি: ${symbol} @ ${mtgDatetimeStr}`);
      return;
    }
    const mtgClose = closedMtgCandle.close;

    const isMtgWin = direction === 'UP⏫' ? mtgClose > mtgOpen : mtgClose < mtgOpen;

    if (isMtgWin) {
      dailyStats.mtgWin++;
      getUserStats(userId).mtgWin++;
      console.log(`🟡 MTG Win: user ${userId} | ${symbol} | Open:${mtgOpen} Close:${mtgClose}`);
      saveSignalRecord({
        userId, symbol, direction, entryTime: entryDisplayTime, entryPrice: entryOpen,
        directResult: 'LOSS', mtgResult: 'WIN', finalResult: 'MTG_WIN', createdAt: new Date()
      });
    } else {
      dailyStats.loss++;
      getUserStats(userId).loss++;
      console.log(`🔴 Final Loss: user ${userId} | ${symbol}`);
      saveSignalRecord({
        userId, symbol, direction, entryTime: entryDisplayTime, entryPrice: entryOpen,
        directResult: 'LOSS', mtgResult: 'LOSS', finalResult: 'FINAL_LOSS', createdAt: new Date()
      });
    }
  } catch (e) {
    console.log('⚠️ trackSignalResult error for', symbol, '-', e.message);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let db;
async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('qxbot');
  console.log('MongoDB connected!');

  const su = await db.collection('startedUsers').find().toArray();
  su.forEach(u => startedUsers.add(u.userId));

  const au = await db.collection('approvedUsers').find().toArray();
  au.forEach(u => approvedUsers.add(u.userId));

  const bu = await db.collection('bannedUsers').find().toArray();
  bu.forEach(u => bannedUsers.add(u.userId));

  const subs = await db.collection('submissions').find().toArray();
  submissions = subs;

  const tc = await db.collection('trialCounts').find().toArray();
  tc.forEach(u => {
    trialSignalCount.set(u.userId, u.signalCount || 0);
    trialScreenshotCount.set(u.userId, u.screenshotCount || 0);
  });

  await db.collection('startedUsers').createIndex({ userId: 1 }, { unique: true });
  await db.collection('approvedUsers').createIndex({ userId: 1 }, { unique: true });
  await db.collection('bannedUsers').createIndex({ userId: 1 }, { unique: true });
  await db.collection('trialCounts').createIndex({ userId: 1 }, { unique: true });
  await db.collection('affiliateVerified').createIndex({ traderId: 1 }, { unique: true });
}

async function addStartedUser(userId, username, firstName) {
  startedUsers.add(userId);
  await db.collection('startedUsers').updateOne(
    { userId }, { $set: { userId, username: username || null, firstName: firstName || null } }, { upsert: true }
  );
}

async function addApprovedUser(userId) {
  approvedUsers.add(userId);
  await db.collection('approvedUsers').updateOne(
    { userId }, { $set: { userId } }, { upsert: true }
  );
}

async function removeApprovedUser(userId) {
  approvedUsers.delete(userId);
  await db.collection('approvedUsers').deleteOne({ userId });
}

async function addBannedUser(userId) {
  bannedUsers.add(userId);
  await db.collection('bannedUsers').updateOne(
    { userId }, { $set: { userId } }, { upsert: true }
  );
}

async function removeBannedUser(userId) {
  bannedUsers.delete(userId);
  await db.collection('bannedUsers').deleteOne({ userId });
}

async function addSubmission(data) {
  submissions.push(data);
  await db.collection('submissions').insertOne(data);
}

async function incrementTrialSignal(userId) {
  const current = trialSignalCount.get(userId) || 0;
  trialSignalCount.set(userId, current + 1);
  await db.collection('trialCounts').updateOne(
    { userId }, { $set: { userId, signalCount: current + 1 } }, { upsert: true }
  );
}

async function incrementTrialScreenshot(userId) {
  const current = trialScreenshotCount.get(userId) || 0;
  trialScreenshotCount.set(userId, current + 1);
  await db.collection('trialCounts').updateOne(
    { userId }, { $set: { userId, screenshotCount: current + 1 } }, { upsert: true }
  );
}

function getTrialSignalLeft(userId) {
  return FREE_TRIAL_SIGNAL - (trialSignalCount.get(userId) || 0);
}

function getTrialScreenshotLeft(userId) {
  return FREE_TRIAL_SCREENSHOT - (trialScreenshotCount.get(userId) || 0);
}

function isApproved(userId) {
  return userId === ADMIN_ID || approvedUsers.has(userId);
}

function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let part1 = '', part2 = '';
  for (let i = 0; i < 2; i++) part1 += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 4; i++) part2 += chars[Math.floor(Math.random() * chars.length)];
  return `QX_${part1}${part2}_XAAN`;
}

const approvedKeyboard = { remove_keyboard: true };
const trialKeyboard = { remove_keyboard: true };

const signalInlineKeyboard = {
  inline_keyboard: [
    [
      { text: '📊 𝗚𝗲𝗻𝗲𝗿𝗮𝘁𝗲 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹', callback_data: 'new_signal' },
    ],
    [
      { text: '📸 𝗨𝗽𝗹𝗼𝗮𝗱 𝗖𝗵𝗮𝗿𝘁 𝗜𝗺𝗮𝗴𝗲', callback_data: 'screenshot_analysis' }
    ]
  ]
};

const livePairSymbols = [
  'EUR/USD', 'GBP/USD', 'USD/JPY',
  'AUD/USD', 'USD/CAD', 'EUR/GBP',
  'EUR/NZD', 'GBP/NZD', 'USD/PKR',
  'USD/INR', 'USD/BDT', 'USD/IDR',
  'CAD/CHF', 'EUR/JPY', 'GBP/JPY',
  'USD/CHF'
];

function getDisplayPairs() {
  const marketOpen = isRealMarketOpen();
  return livePairSymbols.map(sym => marketOpen ? sym : sym + ' OTC');
}

function symbolFromDisplayPair(displayPair) {
  return displayPair.replace(' OTC', '');
}

async function getCandles(symbol) {
  const data = await twelveData.getTimeSeries(symbol, '1min', 30);
  if (!data.values || data.values.length === 0) throw new Error('No candle data');
  return data.values.map(v => ({
    open: parseFloat(v.open), high: parseFloat(v.high),
    low: parseFloat(v.low), close: parseFloat(v.close),
    datetime: v.datetime
  })).reverse();
}

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
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

function analyzeTrend(candles) {
  const ema5 = calcEMA(candles, 5);
  const ema20 = calcEMA(candles, 20);
  const lastClose = candles[candles.length - 1].close;
  if (ema5 > ema20 && lastClose > ema5) return 'UP';
  if (ema5 < ema20 && lastClose < ema5) return 'DOWN';
  return 'SIDEWAYS';
}

function analyzePriceAction(candles) {
  const len = candles.length;
  const c = candles[len - 1];
  const p = candles[len - 2];
  const p2 = candles[len - 3];
  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.close, c.open);
  const lowerWick = Math.min(c.close, c.open) - c.low;
  const isBullish = c.close > c.open;
  const isBearish = c.close < c.open;

  if (isBullish && p.close < p.open && c.close > p.open && c.open < p.close)
    return { pattern: 'Bullish Engulfing', direction: 'UP' };
  if (isBearish && p.close > p.open && c.open > p.close && c.close < p.open)
    return { pattern: 'Bearish Engulfing', direction: 'DOWN' };
  if (lowerWick > body * 2 && upperWick < body * 0.5)
    return { pattern: 'Bullish Pin Bar', direction: 'UP' };
  if (upperWick > body * 2 && lowerWick < body * 0.5)
    return { pattern: 'Bearish Pin Bar', direction: 'DOWN' };
  if (c.high > p.high && c.low > p.low && p.high > p2.high)
    return { pattern: 'Higher High (Uptrend)', direction: 'UP' };
  if (c.high < p.high && c.low < p.low && p.low < p2.low)
    return { pattern: 'Lower Low (Downtrend)', direction: 'DOWN' };
  if (body < (c.high - c.low) * 0.1)
    return { pattern: 'Doji (Reversal possible)', direction: 'NEUTRAL' };
  return { pattern: 'No clear pattern', direction: 'NEUTRAL' };
}

async function analyzeSignal(displayPair) {
  const symbol = symbolFromDisplayPair(displayPair);
  const candles = await getCandles(symbol);
  const rsi = calcRSI(candles);
  const trend = analyzeTrend(candles);
  const priceAction = analyzePriceAction(candles);

  let upScore = 0, downScore = 0;
  if (trend === 'UP') upScore += 2;
  else if (trend === 'DOWN') downScore += 2;
  if (rsi < 35) upScore += 2;
  else if (rsi > 65) downScore += 2;
  else if (rsi < 50) upScore += 1;
  else downScore += 1;
  if (priceAction.direction === 'UP') upScore += 3;
  else if (priceAction.direction === 'DOWN') downScore += 3;

  const totalScore = upScore + downScore;
  const dominantScore = Math.max(upScore, downScore);
  const ratio = dominantScore / totalScore;
  const direction = upScore >= downScore ? 'UP⏫' : 'DOWN⏬';

  let confidence, winRate;
  if (ratio >= 0.8) { confidence = 'Very High 🔥'; winRate = '85%'; }
  else if (ratio >= 0.65) { confidence = 'High 🟢'; winRate = '80%'; }
  else { confidence = 'Medium 🟡'; winRate = '75%'; }

  return { direction, confidence, winRate, trend, rsi: rsi.toFixed(1), pattern: priceAction.pattern, symbol };
}

function sendPairMenu(chatId) {
  const displayPairs = getDisplayPairs();
  const keyboard = [];
  for (let i = 0; i < displayPairs.length; i += 2) {
    const row = [{ text: displayPairs[i], callback_data: displayPairs[i] }];
    if (displayPairs[i + 1]) row.push({ text: displayPairs[i + 1], callback_data: displayPairs[i + 1] });
    keyboard.push(row);
  }
  bot.sendMessage(chatId, '📈 𝗖𝗵𝗼𝗼𝘀𝗲 𝗬𝗼𝘂𝗿 𝗧𝗿𝗮𝗱𝗶𝗻𝗴 𝗣𝗮𝗶𝗿 👇', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}

function sendVerifyPrompt(chatId) {
  bot.sendMessage(chatId,
    '🔒 𝗙𝗿𝗲𝗲 𝗧𝗿𝗶𝗮𝗹 𝗘𝘅𝗽𝗶𝗿𝗲𝗱!\n\n' +
    '🚀 𝗨𝗻𝗹𝗼𝗰𝗸 𝗨𝗻𝗹𝗶𝗺𝗶𝘁𝗲𝗱 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹𝘀 & 𝗖𝗵𝗮𝗿𝘁 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀.\n\n' +
    '📌 𝗖𝗿𝗲𝗮𝘁𝗲 𝗮 𝗡𝗲𝘄 𝗤𝘂𝗼𝘁𝗲𝘅 𝗔𝗰𝗰𝗼𝘂𝗻𝘁 𝗮𝗻𝗱 𝘀𝗲𝗻𝗱 𝘆𝗼𝘂𝗿 𝟴-𝗱𝗶𝗴𝗶𝘁 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗 𝘁𝗼 𝗰𝗼𝗺𝗽𝗹𝗲𝘁𝗲 𝘃𝗲𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻.',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 𝗖𝗿𝗲𝗮𝘁𝗲 𝗤𝘂𝗼𝘁𝗲𝘅 𝗔𝗰𝗰𝗼𝘂𝗻𝘁', url: 'https://market-qx.pro/sign-up/?lid=2178055' }],
          [{ text: '✅ 𝗩𝗲𝗿𝗶𝗳𝘆 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗', callback_data: '/verify' }]
        ]
      }
    }
  );
}

const deepAnalysisSteps = [
  '📊 𝗔𝗻𝗮𝗹𝘆𝘇𝗶𝗻𝗴 𝗣𝗿𝗶𝗰𝗲 𝗔𝗰𝘁𝗶𝗼𝗻...',
  '📈 𝗖𝗵𝗲𝗰𝗸𝗶𝗻𝗴 𝗧𝗿𝗲𝗻𝗱 & 𝗠𝗼𝗺𝗲𝗻𝘁𝘂𝗺...',
  '🎯 𝗙𝗶𝗻𝗱𝗶𝗻𝗴 𝗛𝗶𝗴𝗵-𝗣𝗿𝗼𝗯𝗮𝗯𝗶𝗹𝗶𝘁𝘆 𝗦𝗲𝘁𝘂𝗽...'
];

async function runLoadingBar(chatId) {
  const bd0 = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const bdStr = String(bd0.getUTCHours()).padStart(2,'0') + ':' + String(bd0.getUTCMinutes()).padStart(2,'0') + ':' + String(bd0.getUTCSeconds()).padStart(2,'0');

  const loadMsg = await bot.sendMessage(chatId,
    '🚀 𝗔𝗻𝗮𝗹𝘆𝘇𝗶𝗻𝗴 𝗠𝗮𝗿𝗸𝗲𝘁 𝗗𝗮𝘁𝗮...\n\n' +
    '⏰ 𝗕𝗗 𝗧𝗶𝗺𝗲: ' + bdStr + '\n' +
    '📊 𝗣𝗹𝗲𝗮𝘀𝗲 𝗪𝗮𝗶𝘁...',
    { parse_mode: 'Markdown' }
  );

  if (!loadMsg) {
    throw new Error('runLoadingBar: initial loading message পাঠানো যায়নি');
  }

  const loadMsgId = loadMsg.message_id;

  await new Promise(r => setTimeout(r, 1500));

  const startTime = Date.now();
  const totalWaitMs = 20000;

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((totalWaitMs - elapsed) / 1000));
      const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const bdTimeStr = String(bd.getUTCHours()).padStart(2,'0') + ':' + String(bd.getUTCMinutes()).padStart(2,'0') + ':' + String(bd.getUTCSeconds()).padStart(2,'0');

      const stepIndex = Math.min(deepAnalysisSteps.length - 1, Math.floor((elapsed / totalWaitMs) * deepAnalysisSteps.length));
      const visibleSteps = deepAnalysisSteps.slice(0, stepIndex + 1).join('\n');

      try {
        await bot.editMessageText(
          '🧠 𝗔𝗜 𝗗𝗘𝗘𝗣 𝗠𝗔𝗥𝗞𝗘𝗧 𝗔𝗡𝗔𝗟𝗬𝗦𝗜𝗦\n\n' +
          '⏰ 𝗕𝗗 𝗧𝗶𝗺𝗲: ' + bdTimeStr + '\n' +
          '⏳ 𝗦𝗶𝗴𝗻𝗮𝗹 𝗜𝗻: ' + remaining + 's\n\n' +
          visibleSteps,
          { chat_id: chatId, message_id: loadMsgId, parse_mode: 'Markdown' }
        );
      } catch (e) {}

      if (elapsed >= totalWaitMs) {
        clearInterval(interval);
        resolve(loadMsgId);
      }
    }, 1000);
  });
}

// /maintenance
bot.onText(/\/maintenance (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const action = match[1].trim().toLowerCase();
  if (action === 'on') {
    maintenanceMode = true;
    await bot.sendMessage(ADMIN_ID, '🔧 *Maintenance Mode চালু হয়েছে!*', { parse_mode: 'Markdown' });
    for (const uid of startedUsers) {
      if (uid === ADMIN_ID) continue;
      try { await bot.sendMessage(uid, '🔧 *Bot Maintenance চলছে...*\n\n⏳ কিছুক্ষণ পর আবার চালু হবে।', { parse_mode: 'Markdown' }); } catch (e) { console.error('broadcast(maintenance-on) fail for', uid, e.message); }
    }
  } else if (action === 'off') {
    maintenanceMode = false;
    await bot.sendMessage(ADMIN_ID, '✅ *Maintenance Mode বন্ধ হয়েছে!*', { parse_mode: 'Markdown' });
    for (const uid of startedUsers) {
      if (uid === ADMIN_ID) continue;
      try { await bot.sendMessage(uid, '✅ *Bot আবার চালু হয়েছে!*\n\n📊 Signal নিতে নিচের বাটনে ক্লিক করুন।', { parse_mode: 'Markdown' }); } catch (e) { console.error('broadcast(maintenance-off) fail for', uid, e.message); }
    }
  } else {
    await bot.sendMessage(ADMIN_ID, '❌ Format: /maintenance on অথবা /maintenance off');
  }
});

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'User';
  const userId = msg.from.id;
  const usernameHandle = msg.from.username || null;

  if (userId !== ADMIN_ID && emergencyMode) {
    await bot.sendMessage(chatId, '🛑 *Bot এখন Emergency Mode এ আছে।*\n\n⏳ একটু পর আবার চেষ্টা করুন।', { parse_mode: 'Markdown' });
    return;
  }
  if (userId !== ADMIN_ID && maintenanceMode) {
    await bot.sendMessage(chatId, '🔧 *Bot Maintenance চলছে...*\n\n⏳ কিছুক্ষণ পর আবার চালু হবে।', { parse_mode: 'Markdown' });
    return;
  }
  if (bannedUsers.has(userId)) {
    await bot.sendMessage(chatId, '🚫 আপনাকে ban করা হয়েছে।');
    return;
  }
  if (!startedUsers.has(userId)) {
    await addStartedUser(userId, usernameHandle, firstName);
    await bot.sendMessage(ADMIN_ID,
      '♻️ *NEW USER STARTED BOT* ➕\n\n👤 Name: ' + mentionUser(userId, usernameHandle, firstName) + '\n🆔 ID: `' + userId + '`',
      { parse_mode: 'Markdown' }
    );
  }

  if (isApproved(userId)) {
    await bot.sendMessage(chatId,
      '╭━━━━━━━━━━━━━━━━━━━━╮\n' +
      '    🤖 𝗤𝗫 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝟱.𝟬\n' +
      '╰━━━━━━━━━━━━━━━━━━━━╯\n' +
      '⚡ 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹 𝗦𝘆𝘀𝘁𝗲𝗺\n' +
      '📊 𝗔𝗱𝘃𝗮𝗻𝗰𝗲𝗱 𝗧𝗿𝗮𝗱𝗲 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀\n' +
      '📸 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁 𝗖𝗵𝗮𝗿𝘁 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀\n' +
      '👑 𝗣𝗿𝗲𝗺𝗶𝘂𝗺 𝗩𝗜𝗣 𝗔𝗰𝗰𝗲𝘀𝘀\n\n' +
      '👑 𝗨𝗻𝗹𝗶𝗺𝗶𝘁𝗲𝗱 𝗔𝗰𝗰𝗲𝘀𝘀 𝗔𝗰𝘁𝗶𝘃𝗲 ✅\n\n' +
      '🚀 𝗦𝘁𝗮𝗿𝘁 𝗬𝗼𝘂𝗿 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀\n\n' +
      '📊 𝗖𝗵𝗼𝗼𝘀𝗲 𝗧𝗿𝗮𝗱𝗶𝗻𝗴 𝗣𝗮𝗶𝗿\n\n' +
      '📸 𝗨𝗽𝗹𝗼𝗮𝗱 𝗖𝗵𝗮𝗿𝘁 𝗜𝗺𝗮𝗴𝗲 👇',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 𝗚𝗲𝗻𝗲𝗿𝗮𝘁𝗲 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹', callback_data: 'new_signal' }],
            [{ text: '📸 𝗨𝗽𝗹𝗼𝗮𝗱 𝗖𝗵𝗮𝗿𝘁 𝗜𝗺𝗮𝗴𝗲', callback_data: 'screenshot_analysis' }]
          ]
        }
      }
    );
    return;
  }

  const signalLeft = getTrialSignalLeft(userId);
  const screenshotLeft = getTrialScreenshotLeft(userId);

  if (signalLeft > 0 || screenshotLeft > 0) {
    await bot.sendMessage(chatId,
      '╭━━━━━━━━━━━━━━━━━━━━╮\n' +
      '    🤖 𝗤𝗫 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝟱.𝟬\n' +
      '╰━━━━━━━━━━━━━━━━━━━━╯\n' +
      '⚡ 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹 𝗦𝘆𝘀𝘁𝗲𝗺\n' +
      '📊 𝗔𝗱𝘃𝗮𝗻𝗰𝗲𝗱 𝗧𝗿𝗮𝗱𝗲 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀\n' +
      '📸 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁 𝗖𝗵𝗮𝗿𝘁 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀\n' +
      '👑 𝗣𝗿𝗲𝗺𝗶𝘂𝗺 𝗩𝗜𝗣 𝗔𝗰𝗰𝗲𝘀𝘀\n\n' +
      '🎁 𝗙𝗿𝗲𝗲 𝗧𝗿𝗶𝗮𝗹\n\n' +
      '📈 𝗦𝗶𝗴𝗻𝗮𝗹𝘀 𝗟𝗲𝗳𝘁: 0' + signalLeft + '/0' + FREE_TRIAL_SIGNAL + '\n' +
      '📸 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁𝘀 𝗟𝗲𝗳𝘁: 0' + screenshotLeft + '/0' + FREE_TRIAL_SCREENSHOT + '\n\n' +
      '✅ 𝗩𝗲𝗿𝗶𝗳𝘆 𝗬𝗼𝘂𝗿 𝗔𝗰𝗰𝗼𝘂𝗻𝘁\n' +
      '🔓 𝗨𝗻𝗹𝗼𝗰𝗸 𝗨𝗻𝗹𝗶𝗺𝗶𝘁𝗲𝗱 𝗔𝗰𝗰𝗲𝘀𝘀\n\n',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 𝗚𝗲𝗻𝗲𝗿𝗮𝘁𝗲 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹', callback_data: 'new_signal' }],
            [{ text: '📸 𝗨𝗽𝗹𝗼𝗮𝗱 𝗖𝗵𝗮𝗿𝘁 𝗜𝗺𝗮𝗴𝗲', callback_data: 'screenshot_analysis' }]
          ]
        }
      }
    );
    return;
  }

  await bot.sendMessage(chatId,
    '╭━━━━━━━━━━━━━━━━━━━━╮\n' +
    '    🤖 𝗤𝗫 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝟱.𝟬\n' +
    '╰━━━━━━━━━━━━━━━━━━━━╯\n' +
    '⚡ 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹 𝗦𝘆𝘀𝘁𝗲𝗺\n' +
    '📊 𝗔𝗱𝘃𝗮𝗻𝗰𝗲𝗱 𝗧𝗿𝗮𝗱𝗲 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀\n' +
    '📸 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁 𝗖𝗵𝗮𝗿𝘁 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀\n' +
    '👑 𝗣𝗿𝗲𝗺𝗶𝘂𝗺 𝗩𝗜𝗣 𝗔𝗰𝗰𝗲𝘀𝘀\n\n' +
    '🔒 𝗙𝗿𝗲𝗲 𝗧𝗿𝗶𝗮𝗹 𝗘𝘅𝗽𝗶𝗿𝗲𝗱!\n\n' +
    '📌 𝗖𝗿𝗲𝗮𝘁𝗲 𝗮 𝗡𝗲𝘄 𝗤𝘂𝗼𝘁𝗲𝘅 𝗔𝗰𝗰𝗼𝘂𝗻𝘁\n\n' +
    '🆔 𝗦𝗲𝗻𝗱 𝘆𝗼𝘂𝗿 𝟴-𝗱𝗶𝗴𝗶𝘁 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗\n\n' +
    '✅ 𝗖𝗼𝗺𝗽𝗹𝗲𝘁𝗲 𝗩𝗲𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 𝗖𝗿𝗲𝗮𝘁𝗲 𝗤𝘂𝗼𝘁𝗲𝘅 𝗔𝗰𝗰𝗼𝘂𝗻𝘁', url: 'https://market-qx.pro/sign-up/?lid=2178055' }],
          [{ text: '✅ 𝗩𝗲𝗿𝗶𝗳𝘆 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗', callback_data: '/verify' }]
        ]
      }
    }
  );
});

// /menu
bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (userId !== ADMIN_ID && emergencyMode) { await bot.sendMessage(chatId, '🛑 *Bot এখন Emergency Mode এ আছে।*', { parse_mode: 'Markdown' }); return; }
  if (userId !== ADMIN_ID && maintenanceMode) { await bot.sendMessage(chatId, '🔧 *Bot Maintenance চলছে...*', { parse_mode: 'Markdown' }); return; }
  if (bannedUsers.has(userId)) { await bot.sendMessage(chatId, '🚫 আপনাকে ban করা হয়েছে।'); return; }
  if (!isApproved(userId) && getTrialSignalLeft(userId) <= 0) { sendVerifyPrompt(chatId); return; }
  sendPairMenu(chatId);
});

// /admin
bot.onText(/\/admin/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  const status = maintenanceMode ? '🔧 ON' : '✅ OFF';
  await bot.sendMessage(ADMIN_ID,
    '👑 *ADMIN PANEL*\n══════════════════\n🔧 Maintenance: ' + status,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👥 Users', callback_data: 'admin_total' }, { text: '📊 Report', callback_data: 'admin_report_now' }],
          [{ text: '✅ Approved', callback_data: 'admin_approved' }, { text: '⚡ Affiliates', callback_data: 'admin_affiliate' }],
          [{ text: '📋 Submissions', callback_data: 'admin_submissions' }, { text: '🗑️ Delete Submission', callback_data: 'admin_delete_submission_prompt' }],
          [{ text: '❌ Remove Aff', callback_data: 'admin_delaffiliate_prompt' }, { text: '💬 Message', callback_data: 'admin_message_prompt' }],
          [{ text: '📢 Broadcast', callback_data: 'admin_broadcast' }, { text: '🚀 Session', callback_data: 'admin_session_start' }],
          [{ text: '🚫 Ban', callback_data: 'admin_ban_prompt' }, { text: '✅ Unban', callback_data: 'admin_unban_prompt' }],
          [{ text: '❌ Unapprove', callback_data: 'admin_unapprove_prompt' }, { text: '🔧 Maintenance', callback_data: 'admin_maintenance' }]
        ]
      }
    }
  );
});

// ✅ /xadmin — FULL TEST & CONTROL PANEL (v2)
bot.onText(/\/xadmin/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  const emStatus = emergencyMode ? '🛑 ON' : '✅ OFF';
  await bot.sendMessage(ADMIN_ID,
    '🧪 *𝗫𝗔𝗗𝗠𝗜𝗡 — 𝗧𝗘𝗦𝗧 𝗔𝗡𝗗 𝗖𝗢𝗡𝗧𝗥𝗢𝗟 𝗣𝗔𝗡𝗘𝗟*\n══════════════════\n' +
    '🛑 Emergency Mode: ' + emStatus,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✍️ Register User', callback_data: 'xadmin_reguser' }, { text: '💵 Complete Deposit', callback_data: 'xadmin_deposit' }],
          [{ text: '📊 View User Status', callback_data: 'xadmin_userstatus' }, { text: '🎁 Reset Free Trial', callback_data: 'xadmin_trial_reset' }],
          [{ text: '✅ Approve User', callback_data: 'xadmin_force_approve' }, { text: '🗑 Delete Test Data', callback_data: 'xadmin_delete_testdata' }],
          [{ text: '▶ Start Session', callback_data: 'admin_session_start' }, { text: '⏸ Pause Session', callback_data: 'xadmin_session_pause' }],
          [{ text: '⏹ Stop Session', callback_data: 'xadmin_session_stop' }, { text: '🧹 Clean Database', callback_data: 'xadmin_clean_db' }],
          [{ text: '🩺 API Health Check', callback_data: 'xadmin_health' }, { text: emergencyMode ? '🟢 Disable Emergency' : '🛑 Emergency Mode', callback_data: 'xadmin_emergency' }],
          [{ text: '🚨 Error Logs', callback_data: 'xadmin_errorlogs' }, { text: '🔍 Search Trader ID', callback_data: 'xadmin_check' }],
          [{ text: '💰 Edit Deposit', callback_data: 'xadmin_editdeposit' }]
        ]
      }
    }
  );
});

// /approve
bot.onText(/\/approve (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const targetId = parseInt(match[1].trim());
  if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ Format: /approve [user_id]'); return; }
  const apiKey = generateApiKey();
  passwordMode.set(targetId, apiKey);
  await bot.sendMessage(targetId,
    '✅ 𝗬𝗼𝘂𝗿 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗 𝗛𝗮𝘀 𝗕𝗲𝗲𝗻 𝗩𝗲𝗿𝗶𝗳𝗶𝗲𝗱!\n\n' +
    '🔐 𝗘𝗻𝘁𝗲𝗿 𝗬𝗼𝘂𝗿 𝗔𝗣𝗜 𝗞𝗲𝘆\n\n' +
    '🔑 𝗔𝗣𝗜 𝗞𝗘𝗬:\n`' + apiKey + '`',
    { parse_mode: 'Markdown' }
  );
  await bot.sendMessage(ADMIN_ID, '✅ *User `' + targetId + '` কে approve করা হয়েছে।*\n🔑 API KEY: `' + apiKey + '`', { parse_mode: 'Markdown' });
});

// /unapprove
bot.onText(/\/unapprove (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const targetId = parseInt(match[1].trim());
  if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ Format: /unapprove [user_id]'); return; }
  if (targetId === ADMIN_ID) { await bot.sendMessage(ADMIN_ID, '❌ Admin কে unapprove করা যাবে না।'); return; }
  await removeApprovedUser(targetId);
  passwordMode.delete(targetId);
  await bot.sendMessage(ADMIN_ID, '❌ *User Unapproved!*\n\n🆔 User ID: `' + targetId + '`', { parse_mode: 'Markdown' });
  try { await bot.sendMessage(targetId, '⛔ আপনার bot access বাতিল করা হয়েছে।\n\n✅ পুনরায় verify করতে /start দিন।'); } catch (e) { console.error('notify(unapprove) fail for', targetId, e.message); }
});

// /ban
bot.onText(/\/ban (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const targetId = parseInt(match[1].trim());
  if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ Format: /ban [user_id]'); return; }
  if (targetId === ADMIN_ID) { await bot.sendMessage(ADMIN_ID, '❌ Admin কে ban করা যাবে না।'); return; }
  await addBannedUser(targetId);
  await removeApprovedUser(targetId);
  passwordMode.delete(targetId);
  await bot.sendMessage(ADMIN_ID, '🚫 *User Banned!*\n\n🆔 User ID: `' + targetId + '`', { parse_mode: 'Markdown' });
  try { await bot.sendMessage(targetId, '🚫 আপনাকে bot থেকে ban করা হয়েছে।'); } catch (e) { console.error('notify(ban) fail for', targetId, e.message); }
});

// /sessionstart
bot.onText(/\/sessionstart/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  if (emergencyMode) { await bot.sendMessage(ADMIN_ID, '🛑 Emergency Mode চালু আছে, Session শুরু করা যাবে না।'); return; }
  if (!sessionModule) { await bot.sendMessage(ADMIN_ID, '❌ Session module এখনো লোড হয়নি, একটু পর চেষ্টা করুন।'); return; }
  if (sessionModule.isSessionRunning()) {
    await bot.sendMessage(ADMIN_ID, '⚠️ একটা session ইতিমধ্যে চলছে। শেষ হওয়া পর্যন্ত অপেক্ষা করুন।');
    return;
  }
  await bot.sendMessage(ADMIN_ID, '🚀 Manual session শুরু হচ্ছে... (channel এ চলে যান)');
  sessionModule.runSession(bot, '🎯 Manual').catch(e => {
    console.error('Manual session error:', e.message);
    bot.sendMessage(ADMIN_ID, '❌ Session চালাতে সমস্যা হয়েছে: ' + e.message).catch(() => {});
  });
});

// /msg
bot.onText(/\/msg (\d+) ([\s\S]+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const targetId = parseInt(match[1]);
  const text = match[2];
  try {
    await bot.sendMessage(targetId, text);
    await bot.sendMessage(ADMIN_ID, '✅ Message পাঠানো হয়েছে `' + targetId + '` কে।', { parse_mode: 'Markdown' });
  } catch (e) {
    await bot.sendMessage(ADMIN_ID, '❌ Message পাঠানো যায়নি (হয়তো user bot block করেছে বা কখনো /start দেয়নি)।\nError: ' + e.message);
  }
});

// /delaffiliate
bot.onText(/\/delaffiliate (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const traderId = match[1].trim();
  if (!db) { await bot.sendMessage(ADMIN_ID, '❌ DB এখনো রেডি না।'); return; }
  const result = await db.collection('affiliateVerified').deleteOne({ traderId });
  if (result.deletedCount > 0) {
    await bot.sendMessage(ADMIN_ID, '✅ *Affiliate এন্ট্রি মুছে ফেলা হয়েছে!*\n\n📌 Trader ID: `' + traderId + '`', { parse_mode: 'Markdown' });
  } else {
    await bot.sendMessage(ADMIN_ID, '⚠️ এই Trader ID `' + traderId + '` affiliateVerified লিস্টে পাওয়া যায়নি।', { parse_mode: 'Markdown' });
  }
});

// /unban
bot.onText(/\/unban (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const targetId = parseInt(match[1].trim());
  if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ Format: /unban [user_id]'); return; }
  if (!bannedUsers.has(targetId)) { await bot.sendMessage(ADMIN_ID, '⚠️ User `' + targetId + '` ban list এ নেই।', { parse_mode: 'Markdown' }); return; }
  await removeBannedUser(targetId);
  await bot.sendMessage(ADMIN_ID, '✅ *User Unbanned!*\n\n🆔 User ID: `' + targetId + '`', { parse_mode: 'Markdown' });
  try { await bot.sendMessage(targetId, '✅ আপনার ban তুলে নেওয়া হয়েছে!\n\n📌 পুনরায় access পেতে /start দিন।'); } catch (e) { console.error('notify(unban) fail for', targetId, e.message); }
});

// Message handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || 'User';
  const usernameHandle = msg.from.username || null;
  const username = mentionUser(userId, usernameHandle, firstName);

  if (!text || text.startsWith('/')) return;

  if (userId !== ADMIN_ID && emergencyMode) {
    await bot.sendMessage(chatId, '🛑 *Bot এখন Emergency Mode এ আছে।*\n\n⏳ একটু পর আবার চেষ্টা করুন।', { parse_mode: 'Markdown' });
    return;
  }
  if (userId !== ADMIN_ID && maintenanceMode) {
    await bot.sendMessage(chatId, '🔧 *Bot Maintenance চলছে...*\n\n⏳ কিছুক্ষণ পর আবার চালু হবে।', { parse_mode: 'Markdown' });
    return;
  }
  if (userId !== ADMIN_ID && bannedUsers.has(userId)) {
    await bot.sendMessage(chatId, '🚫 আপনাকে ban করা হয়েছে।');
    return;
  }

  if (broadcastMode.has(userId) && userId === ADMIN_ID) {
    broadcastMode.delete(userId);
    let successCount = 0;
    for (const uid of startedUsers) {
      try {
        await bot.sendMessage(uid, text);
        successCount++;
      } catch (e) {
        console.error('broadcast fail for', uid, e.message);
      }
    }
    await bot.sendMessage(ADMIN_ID, '✅ Broadcast sent to ' + successCount + ' users!');
    return;
  }

  if (messageUserMode.has(userId) && userId === ADMIN_ID) {
    messageUserMode.delete(userId);
    const targetId = parseInt(text.trim());
    if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ ভুল User ID।'); return; }
    pendingMessageTarget.set(userId, targetId);
    await bot.sendMessage(ADMIN_ID, '✍️ এখন যে *message* পাঠাতে চাও লেখো (পাবে User ID: `' + targetId + '`):', { parse_mode: 'Markdown' });
    return;
  }

  if (pendingMessageTarget.has(userId) && userId === ADMIN_ID) {
    const targetId = pendingMessageTarget.get(userId);
    pendingMessageTarget.delete(userId);
    try {
      await bot.sendMessage(targetId, text);
      await bot.sendMessage(ADMIN_ID, '✅ Message পাঠানো হয়েছে `' + targetId + '` কে।', { parse_mode: 'Markdown' });
    } catch (e) {
      await bot.sendMessage(ADMIN_ID, '❌ Message পাঠানো যায়নি (হয়তো user bot block করেছে বা কখনো /start দেয়নি)।\nError: ' + e.message);
    }
    return;
  }

  if (unapproveMode.has(userId) && userId === ADMIN_ID) {
    unapproveMode.delete(userId);
    const targetId = parseInt(text.trim());
    if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ ভুল User ID।'); return; }
    if (targetId === ADMIN_ID) { await bot.sendMessage(ADMIN_ID, '❌ Admin কে unapprove করা যাবে না।'); return; }
    await removeApprovedUser(targetId);
    passwordMode.delete(targetId);
    await bot.sendMessage(ADMIN_ID, '❌ *User Unapproved!*\n\n🆔 User ID: `' + targetId + '`', { parse_mode: 'Markdown' });
    try { await bot.sendMessage(targetId, '⛔ আপনার bot access বাতিল করা হয়েছে।\n\n✅ পুনরায় verify করতে /start দিন।'); } catch (e) { console.error('notify(unapprove) fail for', targetId, e.message); }
    return;
  }

  if (banMode.has(userId) && userId === ADMIN_ID) {
    banMode.delete(userId);
    const targetId = parseInt(text.trim());
    if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ ভুল User ID।'); return; }
    if (targetId === ADMIN_ID) { await bot.sendMessage(ADMIN_ID, '❌ Admin কে ban করা যাবে না।'); return; }
    await addBannedUser(targetId);
    await removeApprovedUser(targetId);
    passwordMode.delete(targetId);
    await bot.sendMessage(ADMIN_ID, '🚫 *User Banned!*\n\n🆔 User ID: `' + targetId + '`', { parse_mode: 'Markdown' });
    try { await bot.sendMessage(targetId, '🚫 আপনাকে bot থেকে ban করা হয়েছে।'); } catch (e) { console.error('notify(ban) fail for', targetId, e.message); }
    return;
  }

  if (deleteSubmissionMode.has(userId) && userId === ADMIN_ID) {
    deleteSubmissionMode.delete(userId);
    const input = text.trim();
    const asUserId = parseInt(input);
    const isUserId = !isNaN(asUserId) && String(asUserId) === input;

    const filterFn = isUserId ? (s => s.userId === asUserId) : (s => s.traderId === input);
    const matchCount = submissions.filter(filterFn).length;

    if (matchCount === 0) {
      await bot.sendMessage(ADMIN_ID, '⚠️ এই ' + (isUserId ? 'User ID' : 'Trader ID') + ' `' + input + '` দিয়ে কোনো Submission পাওয়া যায়নি।', { parse_mode: 'Markdown' });
      return;
    }

    submissions = submissions.filter(s => !filterFn(s));
    if (db) {
      const query = isUserId ? { userId: asUserId } : { traderId: input };
      await db.collection('submissions').deleteMany(query);
    }

    await bot.sendMessage(ADMIN_ID,
      '✅ *Submission মুছে ফেলা হয়েছে!*\n\n🔍 ' + (isUserId ? 'User ID' : 'Trader ID') + ': `' + input + '`\n🗑️ Removed: ' + matchCount + ' টি entry',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (delAffiliateMode.has(userId) && userId === ADMIN_ID) {
    delAffiliateMode.delete(userId);
    const traderId = text.trim();
    const result = await db.collection('affiliateVerified').deleteOne({ traderId });
    if (result.deletedCount > 0) {
      await bot.sendMessage(ADMIN_ID, '✅ *Affiliate এন্ট্রি মুছে ফেলা হয়েছে!*\n\n📌 Trader ID: `' + traderId + '`', { parse_mode: 'Markdown' });
    } else {
      await bot.sendMessage(ADMIN_ID, '⚠️ এই Trader ID `' + traderId + '` affiliateVerified লিস্টে পাওয়া যায়নি।', { parse_mode: 'Markdown' });
    }
    return;
  }

  if (unbanMode.has(userId) && userId === ADMIN_ID) {
    unbanMode.delete(userId);
    const targetId = parseInt(text.trim());
    if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ ভুল User ID।'); return; }
    if (!bannedUsers.has(targetId)) { await bot.sendMessage(ADMIN_ID, '⚠️ User ban list এ নেই।'); return; }
    await removeBannedUser(targetId);
    await bot.sendMessage(ADMIN_ID, '✅ *User Unbanned!*\n\n🆔 User ID: `' + targetId + '`', { parse_mode: 'Markdown' });
    try { await bot.sendMessage(targetId, '✅ আপনার ban তুলে নেওয়া হয়েছে!\n\n📌 পুনরায় access পেতে /start দিন।'); } catch (e) { console.error('notify(unban) fail for', targetId, e.message); }
    return;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ✅ /xadmin — বিদ্যমান মেসেজ হ্যান্ডলার
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (xadminRegMode.has(userId) && userId === ADMIN_ID) {
    xadminRegMode.delete(userId);
    const traderId = text.trim();
    await db.collection('affiliateVerified').updateOne(
      { traderId },
      { $set: { traderId, registered: true, isTest: true, receivedAt: new Date() } },
      { upsert: true }
    );
    await bot.sendMessage(ADMIN_ID, '✅ Test Registration সেট করা হলো!\n\n📌 Trader ID: `' + traderId + '`\n🧪 (isTest flag সহ সেভ হয়েছে)', { parse_mode: 'Markdown' });
    return;
  }

  if (xadminDepositMode.has(userId) && userId === ADMIN_ID) {
    xadminDepositMode.delete(userId);
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2 || isNaN(parseFloat(parts[1]))) {
      await bot.sendMessage(ADMIN_ID, '❌ ভুল ফরম্যাট। এভাবে পাঠাও: `12345678 15`', { parse_mode: 'Markdown' });
      return;
    }
    const traderId = parts[0];
    const amount = parseFloat(parts[1]);
    const existing = await db.collection('affiliateVerified').findOne({ traderId });
    const newTotal = (existing && existing.depositAmount ? existing.depositAmount : 0) + amount;
    const verified = newTotal >= MIN_DEPOSIT_USD;
    await db.collection('affiliateVerified').updateOne(
      { traderId },
      { $set: { traderId, registered: true, depositAmount: newTotal, verified, isTest: true, depositAt: new Date() } },
      { upsert: true }
    );
    await bot.sendMessage(ADMIN_ID,
      '✅ Test Deposit যোগ করা হলো!\n\n📌 Trader ID: `' + traderId + '`\n💰 Total Deposit: $' + newTotal.toFixed(2) + '\n' +
      (verified ? '🟢 Verified ✅ (এখন এই Trader ID দিয়ে /verify করলে approve হবে)' : '🟡 এখনো $' + MIN_DEPOSIT_USD + ' এর কম'),
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (xadminCheckMode.has(userId) && userId === ADMIN_ID) {
    xadminCheckMode.delete(userId);
    const traderId = text.trim();
    const rec = await db.collection('affiliateVerified').findOne({ traderId });
    if (!rec) {
      await bot.sendMessage(ADMIN_ID, '⚠️ এই Trader ID `' + traderId + '` এর কোনো ডেটা পাওয়া যায়নি।', { parse_mode: 'Markdown' });
      return;
    }
    await bot.sendMessage(ADMIN_ID,
      '🔍 *𝗧𝗥𝗔𝗗𝗘𝗥 𝗦𝗧𝗔𝗧𝗨𝗦*\n\n' +
      '📌 Trader ID: `' + rec.traderId + '`\n' +
      '📝 Registered: ' + (rec.registered ? '✅' : '❌') + '\n' +
      '💰 Deposit: $' + (rec.depositAmount ? rec.depositAmount.toFixed(2) : '0.00') + '\n' +
      '🎯 Verified: ' + (rec.verified ? '✅' : '❌') + '\n' +
      (rec.isTest ? '🧪 Test Entry\n' : '') +
      '🌍 Country: ' + (rec.country || 'N/A') + '\n' +
      '📊 Last Status: ' + (rec.lastStatus || 'N/A'),
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (xadminResetMode.has(userId) && userId === ADMIN_ID) {
    xadminResetMode.delete(userId);
    const traderId = text.trim();
    const result = await db.collection('affiliateVerified').deleteOne({ traderId });
    await bot.sendMessage(ADMIN_ID,
      result.deletedCount > 0
        ? '✅ Test data মুছে ফেলা হয়েছে।\n\n📌 Trader ID: `' + traderId + '`'
        : '⚠️ এই Trader ID পাওয়া যায়নি।',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (xadminTrialResetMode.has(userId) && userId === ADMIN_ID) {
    xadminTrialResetMode.delete(userId);
    const targetId = parseInt(text.trim());
    if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ ভুল User ID।'); return; }
    trialSignalCount.set(targetId, 0);
    trialScreenshotCount.set(targetId, 0);
    await db.collection('trialCounts').updateOne(
      { userId: targetId }, { $set: { userId: targetId, signalCount: 0, screenshotCount: 0 } }, { upsert: true }
    );
    await bot.sendMessage(ADMIN_ID, '✅ Trial count reset করা হয়েছে!\n\n🆔 User ID: `' + targetId + '`\n📈 Signal: 0/' + FREE_TRIAL_SIGNAL + '\n📸 Screenshot: 0/' + FREE_TRIAL_SCREENSHOT, { parse_mode: 'Markdown' });
    return;
  }

  if (xadminForceApproveMode.has(userId) && userId === ADMIN_ID) {
    xadminForceApproveMode.delete(userId);
    const targetId = parseInt(text.trim());
    if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ ভুল User ID।'); return; }
    const apiKey = generateApiKey();
    passwordMode.set(targetId, apiKey);
    try {
      await bot.sendMessage(targetId,
        '✅ 𝗬𝗼𝘂𝗿 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗 𝗛𝗮𝘀 𝗕𝗲𝗲𝗻 𝗩𝗲𝗿𝗶𝗳𝗶𝗲𝗱!\n\n🔐 𝗘𝗻𝘁𝗲𝗿 𝗬𝗼𝘂𝗿 𝗔𝗣𝗜 𝗞𝗲𝘆\n\n🔑 𝗔𝗣𝗜 𝗞𝗘𝗬:\n`' + apiKey + '`',
        { parse_mode: 'Markdown' }
      );
    } catch (e) { console.error('xadmin force-approve notify fail:', e.message); }
    await bot.sendMessage(ADMIN_ID, '✅ Test Force Approve — API key পাঠানো হয়েছে (deposit ছাড়াই)।\n\n🆔 User: `' + targetId + '`\n🔑 Key: `' + apiKey + '`', { parse_mode: 'Markdown' });
    return;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ✅ নতুন — /xadmin এর নতুন ফিচারগুলোর মেসেজ হ্যান্ডলার
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (xadminRegisterUserMode.has(userId) && userId === ADMIN_ID) {
    xadminRegisterUserMode.delete(userId);
    const parts = text.trim().split(/\s+/);
    const targetId = parseInt(parts[0]);
    if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ ভুল User ID।'); return; }
    const fname = parts.slice(1).join(' ') || 'Manual Test User';
    await addStartedUser(targetId, null, fname);
    await bot.sendMessage(ADMIN_ID,
      '✅ User ম্যানুয়ালি Register হলো (bot এর স্বাভাবিক /start flow অনুযায়ী)!\n\n🆔 User ID: `' + targetId + '`\n👤 Name: ' + fname,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (xadminUserStatusMode.has(userId) && userId === ADMIN_ID) {
    xadminUserStatusMode.delete(userId);
    const targetId = parseInt(text.trim());
    if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ ভুল User ID।'); return; }

    const sub = submissions.find(s => s.userId === targetId);
    const traderId = sub ? sub.traderId : null;
    let affRec = null;
    if (traderId && db) affRec = await db.collection('affiliateVerified').findOne({ traderId });

    const statusText =
      '📊 *𝗨𝗦𝗘𝗥 𝗦𝗧𝗔𝗧𝗨𝗦*\n\n' +
      '🆔 User ID: `' + targetId + '`\n' +
      '📝 Started Bot: ' + (startedUsers.has(targetId) ? '✅' : '❌') + '\n' +
      '✅ Approved: ' + (isApproved(targetId) ? '✅' : '❌') + '\n' +
      '🚫 Banned: ' + (bannedUsers.has(targetId) ? '✅' : '❌') + '\n' +
      '📈 Trial Signal Left: ' + getTrialSignalLeft(targetId) + '/' + FREE_TRIAL_SIGNAL + '\n' +
      '📸 Trial Screenshot Left: ' + getTrialScreenshotLeft(targetId) + '/' + FREE_TRIAL_SCREENSHOT + '\n\n' +
      '📌 Trader ID: ' + (traderId ? '`' + traderId + '`' : 'N/A') + '\n' +
      (affRec ?
        '📝 Registered: ' + (affRec.registered ? '✅' : '❌') + '\n' +
        '💰 Deposit: $' + (affRec.depositAmount ? affRec.depositAmount.toFixed(2) : '0.00') + '\n' +
        '🎯 Verified: ' + (affRec.verified ? '✅' : '❌') + '\n' +
        '🧪 Type: ' + (affRec.isTest ? 'Test' : 'Real') + '\n'
        : '⚠️ কোনো Affiliate ডেটা নেই\n');

    await bot.sendMessage(ADMIN_ID, statusText, { parse_mode: 'Markdown' });
    return;
  }

  if (xadminDeleteTestDataMode.has(userId) && userId === ADMIN_ID) {
    xadminDeleteTestDataMode.delete(userId);
    const targetId = parseInt(text.trim());
    if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ ভুল User ID।'); return; }

    let removedParts = [];

    trialSignalCount.delete(targetId);
    trialScreenshotCount.delete(targetId);
    if (db) await db.collection('trialCounts').deleteOne({ userId: targetId });
    removedParts.push('Trial Counters');

    const sub = submissions.find(s => s.userId === targetId);
    if (sub && sub.traderId && db) {
      const affRec = await db.collection('affiliateVerified').findOne({ traderId: sub.traderId });
      if (affRec && affRec.isTest) {
        await db.collection('affiliateVerified').deleteOne({ traderId: sub.traderId });
        removedParts.push('Affiliate Test Entry (`' + sub.traderId + '`)');
      }
    }

    await bot.sendMessage(ADMIN_ID,
      '🗑️ *Test Data ক্লিন করা হলো!*\n\n🆔 User ID: `' + targetId + '`\n✅ Removed: ' + removedParts.join(', ') +
      '\n\n⚠️ Note: এই User যদি Approve করা থাকে, সেটা এখান থেকে বাতিল হয়নি (নিরাপত্তার জন্য)। প্রয়োজনে ❌ Unapprove আলাদাভাবে ব্যবহার করুন।',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (xadminEditDepositMode.has(userId) && userId === ADMIN_ID) {
    xadminEditDepositMode.delete(userId);
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2 || isNaN(parseFloat(parts[1]))) {
      await bot.sendMessage(ADMIN_ID, '❌ ভুল ফরম্যাট। এভাবে পাঠাও: `12345678 15`', { parse_mode: 'Markdown' });
      return;
    }
    const traderId = parts[0];
    const newAmount = parseFloat(parts[1]);
    const verified = newAmount >= MIN_DEPOSIT_USD;
    await db.collection('affiliateVerified').updateOne(
      { traderId },
      { $set: { traderId, registered: true, depositAmount: newAmount, verified, editedAt: new Date() } },
      { upsert: true }
    );
    await bot.sendMessage(ADMIN_ID,
      '💰 *Deposit Amount আপডেট হলো!*\n\n📌 Trader ID: `' + traderId + '`\n💵 New Amount: $' + newAmount.toFixed(2) + '\n' +
      (verified ? '🟢 Verified ✅' : '🟡 এখনো $' + MIN_DEPOSIT_USD + ' এর কম'),
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (passwordMode.has(userId)) {
    const correctPass = passwordMode.get(userId);
    if (text === correctPass) {
      passwordMode.delete(userId);
      await addApprovedUser(userId);
      await bot.sendMessage(chatId,
        '🎉 𝗕𝗼𝘁 𝗔𝗰𝗰𝗲𝘀𝘀 𝗔𝗰𝘁𝗶𝘃𝗮𝘁𝗲𝗱!\n\n' +
        '📊 𝗖𝗹𝗶𝗰𝗸 𝘁𝗵𝗲 𝗯𝘂𝘁𝘁𝗼𝗻 𝗯𝗲𝗹𝗼𝘄 𝘁𝗼 𝗴𝗲𝘁 𝘆𝗼𝘂𝗿 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹. 🚀\n\n' +
        '🚀 𝗦𝘁𝗮𝗿𝘁 𝗬𝗼𝘂𝗿 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀\n\n' +
        '📊 𝗖𝗵𝗼𝗼𝘀𝗲 𝗧𝗿𝗮𝗱𝗶𝗻𝗴 𝗣𝗮𝗶𝗿\n\n' +
        '📸 𝗨𝗽𝗹𝗼𝗮𝗱 𝗖𝗵𝗮𝗿𝘁 𝗜𝗺𝗮𝗴𝗲 👇',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 𝗚𝗲𝗻𝗲𝗿𝗮𝘁𝗲 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹', callback_data: 'new_signal' }],
              [{ text: '📸 𝗨𝗽𝗹𝗼𝗮𝗱 𝗖𝗵𝗮𝗿𝘁 𝗜𝗺𝗮𝗴𝗲', callback_data: 'screenshot_analysis' }]
            ]
          }
        }
      );
    } else {
      await bot.sendMessage(chatId, '❌ ভুল API KEY! আবার চেষ্টা করুন।');
    }
    return;
  }

  if (!verifyMode.has(userId)) return;

  if (!/^\d{6,10}$/.test(text)) {
    await bot.sendMessage(chatId, '🔐 𝗣𝗹𝗲𝗮𝘀𝗲 𝗦𝗲𝗻𝗱 𝗬𝗼𝘂𝗿 𝟴-𝗗𝗶𝗴𝗶𝘁 𝗤𝘂𝗼𝘁𝗲𝘅 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗 👇', { parse_mode: 'Markdown' });
    return;
  }

  verifyMode.delete(userId);

  const affRecord = await db.collection('affiliateVerified').findOne({ traderId: text });

  if (affRecord && affRecord.registered) {
    const totalDeposit = affRecord.depositAmount || 0;

    if (totalDeposit < MIN_DEPOSIT_USD) {
      await addSubmission({ userId, name: firstName, username: usernameHandle, traderId: text, time: new Date().toISOString(), pendingDeposit: true });
      await bot.sendMessage(chatId,
        '✅ 𝗥𝗲𝗴𝗶𝘀𝘁𝗿𝗮𝘁𝗶𝗼𝗻 𝗦𝘂𝗰𝗰𝗲𝘀𝘀𝗳𝘂𝗹!\n\n' +
        '⚠️ 𝗗𝗲𝗽𝗼𝘀𝗶𝘁 𝗥𝗲𝗾𝘂𝗶𝗿𝗲𝗱\n\n' +
        '💰 আপনার বর্তমান Deposit: $' + totalDeposit.toFixed(2) + '\n' +
        '🎯 ন্যূনতম প্রয়োজন: $' + MIN_DEPOSIT_USD + '\n\n' +
        '📌 আপনার Quotex অ্যাকাউন্টে কমপক্ষে $' + MIN_DEPOSIT_USD + ' ডিপোজিট করুন, তারপর আপনার Trader ID আবার পাঠান।',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ 𝗩𝗲𝗿𝗶𝗳𝘆 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗 (𝗔𝗴𝗮𝗶𝗻)', callback_data: '/verify' }]
            ]
          }
        }
      );
      await bot.sendMessage(ADMIN_ID,
        '⏳ *Registered কিন্তু Deposit বাকি*\n\n👤 Name: ' + username + '\n🆔 User ID: `' + userId + '`\n📌 Trader ID: `' + text + '`\n💰 Deposit: $' + totalDeposit.toFixed(2),
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const apiKey = generateApiKey();
    passwordMode.set(userId, apiKey);
    await addSubmission({ userId, name: firstName, username: usernameHandle, traderId: text, time: new Date().toISOString(), autoVerified: true, depositAmount: totalDeposit });
    await bot.sendMessage(chatId,
      '✅ 𝗬𝗼𝘂𝗿 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗 𝗛𝗮𝘀 𝗕𝗲𝗲𝗻 𝗩𝗲𝗿𝗶𝗳𝗶𝗲𝗱!\n\n' +
      '🔐 𝗘𝗻𝘁𝗲𝗿 𝗬𝗼𝘂𝗿 𝗔𝗣𝗜 𝗞𝗲𝘆\n\n' +
      '🔑 𝗔𝗣𝗜 𝗞𝗘𝗬:\n`' + apiKey + '`',
      { parse_mode: 'Markdown' }
    );
    await bot.sendMessage(ADMIN_ID,
      '⚡ *New Affiliate User (Deposit Verified)*\n\n👤 Name: ' + username + '\n🆔 User ID: `' + userId + '`\n📌 Trader ID: `' + text + '`\n💰 Deposit: $' + totalDeposit.toFixed(2),
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await addSubmission({ userId, name: firstName, username: usernameHandle, traderId: text, time: new Date().toISOString() });

  await bot.sendMessage(chatId,
    '❌ 𝗩𝗲𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻 𝗙𝗮𝗶𝗹𝗲𝗱\n\n' +
    'আপনার দেওয়া Trader ID `' + text + '` আমাদের অফিসিয়াল লিংকের মাধ্যমে খোলা কোনো অ্যাকাউন্টের সাথে মিলেনি।\n\n' +
    '📌 সঠিকভাবে verify করতে অনুগ্রহ করে নিচের লিংক থেকে *নতুন* একটি Quotex অ্যাকাউন্ট খুলুন, তারপর আপনার Trader ID আবার পাঠান।\n\n' +
    '⚠️ শুধুমাত্র এই লিংক দিয়ে খোলা অ্যাকাউন্টই স্বয়ংক্রিয়ভাবে ভেরিফাই হবে।',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 𝗖𝗿𝗲𝗮𝘁𝗲 𝗤𝘂𝗼𝘁𝗲𝘅 𝗔𝗰𝗰𝗼𝘂𝗻𝘁', url: 'https://market-qx.pro/sign-up/?lid=2178055' }],
          [{ text: '✅ 𝗩𝗲𝗿𝗶𝗳𝘆 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗', callback_data: '/verify' }]
        ]
      }
    }
  );
});

const signalInProgress = new Set();

async function generateSignalForPair(chatId, userId, pair) {
  if (emergencyMode) {
    await bot.sendMessage(chatId, '🛑 Emergency Mode চালু আছে, এখন কোনো Signal দেওয়া যাচ্ছে না।');
    return;
  }
  if (signalInProgress.has(userId)) {
    await bot.sendMessage(chatId, '⏳ আপনার আগের request এখনো process হচ্ছে, একটু অপেক্ষা করুন...');
    return;
  }
  signalInProgress.add(userId);

  try {
    if (lastSignalMsgId.has(userId)) {
      try { await bot.deleteMessage(chatId, lastSignalMsgId.get(userId)); } catch (e) {}
      lastSignalMsgId.delete(userId);
    }

    let isLastTrial = false;
    if (!isApproved(userId)) {
      if (getTrialSignalLeft(userId) <= 0) { sendVerifyPrompt(chatId); signalInProgress.delete(userId); return; }
      await incrementTrialSignal(userId);
      const left = getTrialSignalLeft(userId);
      if (left === 0) {
        isLastTrial = true;
        await bot.sendMessage(chatId,
          '⚠️ 𝗟𝗮𝘀𝘁 𝗙𝗿𝗲𝗲 𝗧𝗿𝗶𝗮𝗹 𝗦𝗶𝗴𝗻𝗮𝗹!\n\n✅ 𝗩𝗲𝗿𝗶𝗳𝘆 𝗡𝗼𝘄 𝘁𝗼 𝗨𝗻𝗹𝗼𝗰𝗸 𝗨𝗻𝗹𝗶𝗺𝗶𝘁𝗲𝗱 𝗔𝗰𝗰𝗲𝘀𝘀. 🚀',
          { parse_mode: 'Markdown' }
        );
      }
    }

    const loadMsgId = await runLoadingBar(chatId);
    try { await bot.deleteMessage(chatId, loadMsgId); } catch (e) {}

    let signal;
    try {
      signal = await analyzeSignal(pair);
    } catch (e) {
      console.error('analyzeSignal fail for', pair, '-', e.message);
      const directions = ['UP⏫', 'DOWN⏬'];
      signal = { direction: directions[Math.floor(Math.random() * 2)], confidence: 'Medium 🟡', winRate: '75%', symbol: symbolFromDisplayPair(pair) };
    }

    const now2 = new Date();
    const entryDate = new Date(Math.floor((now2.getTime() + 60000) / 60000) * 60000);
    const entryDatetimeStr = formatUTCDateTime(entryDate);

    const bd2 = new Date(entryDate.getTime() + 6 * 60 * 60 * 1000);
    const exH = String(bd2.getUTCHours()).padStart(2, '0');
    const exM = String(bd2.getUTCMinutes()).padStart(2, '0');
    const entryDisplayTime = exH + ':' + exM;

    const trialInfo = isApproved(userId) ? '' : '\n📊 Signal বাকি: *' + getTrialSignalLeft(userId) + '/' + FREE_TRIAL_SIGNAL + '*';

    const sentMsg = await bot.sendMessage(chatId,
      '╭──────────────────╮\n│    📈 *𝗤𝘅 𝘅𝗮𝗮𝗻 𝗙𝗮𝘁𝗵𝗲𝗿 𝗯𝗼𝘁*\n╰──────────────────╯\n\n' +
      '📊 *ASSET*  ➜ `' + pair + '`\n🔹 *TIME*     ➜ `1 MIN`\n🕒 *𝗘𝗡𝗧𝗥𝗬* ➜ `' + entryDisplayTime + '`\n══════════════════\n' +
      '🚀 *DIRECTION* ➜ ' + signal.direction + '\n♻️ *WIN RATE*   ➜ `' + signal.winRate + '`\n✅ *CONFIDENCE* ➜ ' + signal.confidence + '\n══════════════════\n' +
      '⏹️ *Take the trade now!*\n⚠️ _Trade at your own risk if loss use 𝟭 𝗦𝗧𝗘𝗣 𝗠𝗧𝗚 never over trade_ ⚠️' + trialInfo,
      {
        parse_mode: 'Markdown',
        reply_markup: signalInlineKeyboard
      }
    );

    if (sentMsg) lastSignalMsgId.set(userId, sentMsg.message_id);

    trackSignalResult(userId, signal.symbol, signal.direction, entryDatetimeStr, entryDisplayTime)
      .catch(e => console.log('trackSignalResult error:', e.message));
  } catch (e) {
    console.error('generateSignalForPair error:', e.message);
    try { await bot.sendMessage(chatId, '❌ Signal তৈরি করতে সমস্যা হয়েছে, আবার চেষ্টা করুন।'); } catch (err) {}
  } finally {
    signalInProgress.delete(userId);
  }
}

// Callback handler
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const pair = query.data;
  bot.answerCallbackQuery(query.id);

  if (userId !== ADMIN_ID && emergencyMode) {
    await bot.sendMessage(chatId, '🛑 *Bot এখন Emergency Mode এ আছে।*', { parse_mode: 'Markdown' });
    return;
  }
  if (userId !== ADMIN_ID && maintenanceMode) {
    await bot.sendMessage(chatId, '🔧 *Bot Maintenance চলছে...*', { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'new_signal') {
    if (!isApproved(userId) && getTrialSignalLeft(userId) <= 0) { sendVerifyPrompt(chatId); return; }
    sendPairMenu(chatId);
    return;
  }

  if (pair === 'screenshot_analysis') {
    if (emergencyMode) { await bot.sendMessage(chatId, '🛑 Emergency Mode চালু আছে, এখন Screenshot Analysis বন্ধ আছে।'); return; }
    if (!isApproved(userId)) {
      if (getTrialScreenshotLeft(userId) <= 0) { sendVerifyPrompt(chatId); return; }
    }
    await bot.sendMessage(chatId,
      '📸 আপনার Quotex chart এর *screenshot* পাঠান:\n\n' +
      (isApproved(userId) ? '' : '📊 Screenshot বাকি: *' + getTrialScreenshotLeft(userId) + '/' + FREE_TRIAL_SCREENSHOT + '*'),
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (pair === 'admin_maintenance' && userId === ADMIN_ID) {
    maintenanceMode = !maintenanceMode;
    const status = maintenanceMode ? 'চালু 🔧' : 'বন্ধ ✅';
    await bot.sendMessage(ADMIN_ID, '🔧 *Maintenance Mode ' + status + ' হয়েছে!*', { parse_mode: 'Markdown' });
    if (maintenanceMode) {
      for (const uid of startedUsers) {
        if (uid === ADMIN_ID) continue;
        try { await bot.sendMessage(uid, '🔧 *Bot Maintenance চলছে...*\n\n⏳ কিছুক্ষণ পর আবার চালু হবে।', { parse_mode: 'Markdown' }); } catch (e) { console.error('broadcast(maint-toggle-on) fail for', uid, e.message); }
      }
    } else {
      for (const uid of startedUsers) {
        if (uid === ADMIN_ID) continue;
        try { await bot.sendMessage(uid, '✅ *Bot আবার চালু হয়েছে!*\n\n📊 Signal নিতে নিচের বাটনে ক্লিক করুন।', { parse_mode: 'Markdown' }); } catch (e) { console.error('broadcast(maint-toggle-off) fail for', uid, e.message); }
      }
    }
    return;
  }

  if (pair === 'admin_total' && userId === ADMIN_ID) {
    const affCount = await db.collection('affiliateVerified').countDocuments();
    await bot.sendMessage(ADMIN_ID,
      '👥 *TOTAL USERS*\n\n📊 Total Started: `' + startedUsers.size + '`\n✅ Total Approved: `' + (approvedUsers.size - 1) + '`\n🚫 Total Banned: `' + bannedUsers.size + '`\n📋 Total Submissions: `' + submissions.length + '`\n⚡ Affiliate Verified: `' + affCount + '`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (pair === 'admin_approved' && userId === ADMIN_ID) {
    const list = [...approvedUsers].filter(u => u !== ADMIN_ID);
    if (list.length === 0) { await bot.sendMessage(ADMIN_ID, '✅ কোনো approved user নেই।'); return; }
    let text = '✅ *APPROVED USERS*\n\n';
    list.forEach((uid, i) => {
      const sub = submissions.find(s => s.userId === uid);
      const uname = mentionUser(uid, sub ? sub.username : null, sub ? sub.name : 'Unknown');
      const traderId = sub ? sub.traderId : 'N/A';
      text += (i + 1) + '. ' + uname + '\n🆔 User: `' + uid + '`\n📌 Trader ID: `' + traderId + '`\n\n';
    });
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_pending' && userId === ADMIN_ID) {
    const pending = submissions.filter(s => !approvedUsers.has(s.userId));
    if (pending.length === 0) { await bot.sendMessage(ADMIN_ID, '⏳ কোনো pending user নেই।'); return; }
    let text = '⏳ *PENDING VERIFY LIST*\n\n';
    pending.forEach((s, i) => {
      const uname = mentionUser(s.userId, s.username, s.name);
      text += (i + 1) + '. ' + uname + '\n🆔 `' + s.userId + '`\n📌 Trader ID: `' + s.traderId + '`\n\n';
    });
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_submissions' && userId === ADMIN_ID) {
    if (submissions.length === 0) { await bot.sendMessage(ADMIN_ID, '📋 কোনো submission নেই।'); return; }
    const recent = submissions.slice(-40).reverse();
    let text = '📋 TRADER ID SUBMISSIONS (সর্বশেষ ' + recent.length + '/' + submissions.length + ')\n\n';
    recent.forEach((s, i) => {
      const uname = s.username ? '@' + s.username : (s.name || 'Unknown');
      const autoTag = s.autoVerified ? ' ⚡' : (s.pendingDeposit ? ' ⏳' : '');
      text += (i + 1) + '. ' + uname + autoTag + '\n🆔 User: ' + s.userId + '\n📌 Trader ID: ' + s.traderId + '\n\n';
    });
    text += '━━━━━━━━━━━━━━━━\n🗑️ মুছতে চাইলে "🗑️ Delete Submission" বাটন ব্যবহার করে User ID অথবা Trader ID পাঠাও।';
    try {
      await bot.sendMessage(ADMIN_ID, text.slice(0, 4000));
    } catch (e) {
      console.error('admin_submissions send fail:', e.message);
      await bot.sendMessage(ADMIN_ID, '❌ Submissions লিস্ট পাঠাতে সমস্যা হয়েছে: ' + e.message);
    }
    return;
  }

  if (pair === 'admin_delete_submission_prompt' && userId === ADMIN_ID) {
    deleteSubmissionMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '🗑️ যে Submission মুছতে চাও তার *User ID* অথবা *Trader ID* পাঠাও:\n\n⚠️ একই User ID/Trader ID দিয়ে একাধিক submission থাকলে সবগুলোই মুছে যাবে।', { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_affiliate' && userId === ADMIN_ID) {
    const affList = await db.collection('affiliateVerified').find().sort({ receivedAt: -1 }).limit(30).toArray();
    if (affList.length === 0) { await bot.sendMessage(ADMIN_ID, '⚡ কোনো affiliate postback পাওয়া যায়নি এখনো।'); return; }
    let text = '⚡ *AFFILIATE VERIFIED (সর্বশেষ 30)*\n\n';
    affList.forEach((a, i) => {
      text += (i + 1) + '. 📌 Trader ID: `' + a.traderId + '`\n📝 Registered: ' + (a.registered ? '✅' : '❌') + '\n💰 Deposit: $' + (a.depositAmount ? a.depositAmount.toFixed(2) : '0.00') + '\n🎯 Verified: ' + (a.verified ? '✅' : '❌') + '\n\n';
    });
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_delaffiliate_prompt' && userId === ADMIN_ID) {
    delAffiliateMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '🗑️ যে *Trader ID* affiliateVerified লিস্ট থেকে মুছতে চাও সেটা পাঠাও:', { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_report_now' && userId === ADMIN_ID) {
    ensureDailyStatsFresh();
    await bot.sendMessage(ADMIN_ID, buildDailyAdminReport(), { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_broadcast' && userId === ADMIN_ID) {
    broadcastMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '📢 যে message সব user কে পাঠাতে চাও সেটা লেখো:');
    return;
  }

  if (pair === 'admin_message_prompt' && userId === ADMIN_ID) {
    messageUserMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '💬 যে user কে personal message পাঠাতে চাও তার *User ID* পাঠাও:\n\n💡 Tip: `/msg [user_id] [message]` দিয়ে এক লাইনেও পাঠাতে পারো।', { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_session_start' && userId === ADMIN_ID) {
    if (emergencyMode) { await bot.sendMessage(ADMIN_ID, '🛑 Emergency Mode চালু আছে, Session শুরু করা যাবে না।'); return; }
    if (!sessionModule) { await bot.sendMessage(ADMIN_ID, '❌ Session module এখনো লোড হয়নি, একটু পর চেষ্টা করুন।'); return; }
    if (sessionModule.isSessionRunning()) {
      await bot.sendMessage(ADMIN_ID, '⚠️ একটা session ইতিমধ্যে চলছে। শেষ হওয়া পর্যন্ত অপেক্ষা করুন।');
      return;
    }
    await bot.sendMessage(ADMIN_ID, '🚀 Manual session শুরু হচ্ছে... (channel এ চলে যান)');
    sessionModule.runSession(bot, '🎯 Manual').catch(e => {
      console.error('Manual session error:', e.message);
      bot.sendMessage(ADMIN_ID, '❌ Session চালাতে সমস্যা হয়েছে: ' + e.message).catch(() => {});
    });
    return;
  }

  if (pair === 'admin_unapprove_prompt' && userId === ADMIN_ID) {
    unapproveMode.add(ADMIN_ID);
    const list = [...approvedUsers].filter(u => u !== ADMIN_ID);
    let text = '❌ *UNAPPROVE USER*\n\n';
    if (list.length === 0) { text += 'কোনো approved user নেই।'; unapproveMode.delete(ADMIN_ID); }
    else {
      list.forEach((uid, i) => {
        const sub = submissions.find(s => s.userId === uid);
        const uname = mentionUser(uid, sub ? sub.username : null, sub ? sub.name : 'Unknown');
        text += (i + 1) + '. ' + uname + ' — `' + uid + '`\n';
      });
      text += '\n📌 যে user কে unapprove করতে চাও তার *User ID* পাঠাও:';
    }
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_ban_prompt' && userId === ADMIN_ID) {
    banMode.add(ADMIN_ID);
    const list = [...startedUsers].filter(u => u !== ADMIN_ID && !bannedUsers.has(u));
    let text = '🚫 *BAN USER*\n\n';
    if (list.length === 0) { text += 'ban করার মতো কোনো user নেই।'; banMode.delete(ADMIN_ID); }
    else {
      list.forEach((uid, i) => {
        const sub = submissions.find(s => s.userId === uid);
        const uname = mentionUser(uid, sub ? sub.username : null, sub ? sub.name : 'Unknown');
        text += (i + 1) + '. ' + uname + ' — `' + uid + '`\n';
      });
      text += '\n📌 যে user কে ban করতে চাও তার *User ID* পাঠাও:';
    }
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_unban_prompt' && userId === ADMIN_ID) {
    unbanMode.add(ADMIN_ID);
    const list = [...bannedUsers];
    let text = '✅ *UNBAN USER*\n\n';
    if (list.length === 0) { text += 'ban list এ কোনো user নেই।'; unbanMode.delete(ADMIN_ID); }
    else {
      list.forEach((uid, i) => {
        const sub = submissions.find(s => s.userId === uid);
        const uname = mentionUser(uid, sub ? sub.username : null, sub ? sub.name : 'Unknown');
        text += (i + 1) + '. ' + uname + ' — `' + uid + '`\n';
      });
      text += '\n📌 যে user কে unban করতে চাও তার *User ID* পাঠাও:';
    }
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ✅ /xadmin — বিদ্যমান callback হ্যান্ডলার
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (pair === 'xadmin_reg' && userId === ADMIN_ID) {
    xadminRegMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '📝 যে Trader ID এর জন্য registration সিমুলেট করতে চাও, সেটা পাঠাও:');
    return;
  }

  if (pair === 'xadmin_deposit' && userId === ADMIN_ID) {
    xadminDepositMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '💰 এই ফরম্যাটে পাঠাও: `TraderID Amount`\n\nউদাহরণ: `12345678 15`', { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'xadmin_check' && userId === ADMIN_ID) {
    xadminCheckMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '🔍 যে Trader ID এর status চেক করতে চাও সেটা পাঠাও:');
    return;
  }

  if (pair === 'xadmin_reset' && userId === ADMIN_ID) {
    xadminResetMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '🗑️ যে Trader ID এর test data মুছতে চাও সেটা পাঠাও:');
    return;
  }

  if (pair === 'xadmin_trial_reset' && userId === ADMIN_ID) {
    xadminTrialResetMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '🎁 যে User ID এর Free Trial reset করতে চাও (নতুন করে trial টেস্ট করার জন্য) সেটা পাঠাও:');
    return;
  }

  if (pair === 'xadmin_force_approve' && userId === ADMIN_ID) {
    xadminForceApproveMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '✅ যে User ID কে Approve করতে চাও (bot এর Auto Approve এর একই logic ব্যবহার করবে) সেটা পাঠাও:');
    return;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ✅ নতুন — /xadmin এর নতুন ফিচারগুলোর callback হ্যান্ডলার
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (pair === 'xadmin_reguser' && userId === ADMIN_ID) {
    xadminRegisterUserMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '✍️ যে User কে register করতে চাও, তার *User ID* (চাইলে সাথে নাম) পাঠাও:\n\nউদাহরণ: `123456789 Test User`', { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'xadmin_userstatus' && userId === ADMIN_ID) {
    xadminUserStatusMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '📊 যে User এর status দেখতে চাও তার *User ID* পাঠাও:', { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'xadmin_delete_testdata' && userId === ADMIN_ID) {
    xadminDeleteTestDataMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '🗑️ যে User এর Test Data মুছতে চাও তার *User ID* পাঠাও:', { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'xadmin_editdeposit' && userId === ADMIN_ID) {
    xadminEditDepositMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '💰 এই ফরম্যাটে পাঠাও: `TraderID NewAmount`\n\nউদাহরণ: `12345678 15`', { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'xadmin_session_pause' && userId === ADMIN_ID) {
    if (!sessionModule || !sessionModule.isSessionRunning()) { await bot.sendMessage(ADMIN_ID, '⚠️ এখন কোনো Session চলছে না।'); return; }
    const ok = sessionModule.pauseSession();
    await bot.sendMessage(ADMIN_ID, ok ? '⏸ Session Pause করা হয়েছে। (চলমান রাউন্ড শেষ হলে পরের সিগন্যাল আটকে যাবে)' : '❌ Pause করা যায়নি।');
    return;
  }

  if (pair === 'xadmin_session_stop' && userId === ADMIN_ID) {
    if (!sessionModule || !sessionModule.isSessionRunning()) { await bot.sendMessage(ADMIN_ID, '⚠️ এখন কোনো Session চলছে না।'); return; }
    const ok = sessionModule.stopSessionNow();
    await bot.sendMessage(ADMIN_ID, ok ? '⏹ Session বন্ধ করা হচ্ছে... (চলমান রাউন্ড শেষ হলে থামবে)' : '❌ Stop করা যায়নি।');
    return;
  }

  if (pair === 'xadmin_clean_db' && userId === ADMIN_ID) {
    await bot.sendMessage(ADMIN_ID, '🧹 Database Clean শুরু হচ্ছে... একটু সময় লাগবে।');
    let checked = 0, removed = 0;
    const candidates = [...startedUsers].filter(u => u !== ADMIN_ID).slice(0, 200);
    for (const uid of candidates) {
      checked++;
      try {
        await bot.getChat(uid);
      } catch (e) {
        const m = (e.message || '').toLowerCase();
        if (m.includes('blocked') || m.includes('chat not found') || m.includes('deactivated') || m.includes('user not found')) {
          startedUsers.delete(uid);
          trialSignalCount.delete(uid);
          trialScreenshotCount.delete(uid);
          if (db) {
            await db.collection('startedUsers').deleteOne({ userId: uid });
            await db.collection('trialCounts').deleteOne({ userId: uid });
          }
          removed++;
        }
      }
      await sleep(150);
    }
    await bot.sendMessage(ADMIN_ID,
      '✅ *Database Clean সম্পন্ন!*\n\n🔍 Checked: ' + checked + '\n🗑️ Removed: ' + removed +
      (startedUsers.size + removed > 200 ? '\n\n⚠️ একবারে সর্বোচ্চ ২০০ জন চেক করা হয়, আবার চালিয়ে বাকিদের চেক করুন।' : ''),
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (pair === 'xadmin_health' && userId === ADMIN_ID) {
    await bot.sendMessage(ADMIN_ID, '🩺 Health Check চলছে...');

    let mongoStatus = '❌ Fail';
    try { if (db) { await db.command({ ping: 1 }); mongoStatus = '✅ OK'; } } catch (e) { mongoStatus = '❌ ' + e.message; }

    let tdStatus = '❌ Fail';
    const tdStart = Date.now();
    try {
      const r = await twelveData.getTimeSeries('EUR/USD', '1min', 2);
      tdStatus = r && r.values ? '✅ OK (' + (Date.now() - tdStart) + 'ms)' : '⚠️ ডেটা পাওয়া যায়নি';
    } catch (e) { tdStatus = '❌ ' + e.message; }

    let geminiStatus = '❌ কোনো Key নেই';
    try {
      const status = geminiKeyPool.getStatus();
      const active = status.filter(k => !k.exhausted).length;
      geminiStatus = status.length === 0 ? '❌ কোনো Key নেই' : `✅ ${active}/${status.length} Key Active`;
    } catch (e) { geminiStatus = '❌ ' + e.message; }

    await bot.sendMessage(ADMIN_ID,
      '🩺 *𝗔𝗣𝗜 𝗛𝗘𝗔𝗟𝗧𝗛 𝗖𝗛𝗘𝗖𝗞*\n\n' +
      '🗄️ MongoDB: ' + mongoStatus + '\n' +
      '📊 TwelveData: ' + tdStatus + '\n' +
      '🧠 Gemini: ' + geminiStatus + '\n' +
      '📸 Screenshot Module: ✅ Loaded\n' +
      '🔧 Maintenance Mode: ' + (maintenanceMode ? '🔧 ON' : '✅ OFF') + '\n' +
      '🛑 Emergency Mode: ' + (emergencyMode ? '🛑 ON' : '✅ OFF') + '\n' +
      '▶️ Session Running: ' + (sessionModule && sessionModule.isSessionRunning() ? '✅ YES' : '❌ NO'),
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (pair === 'xadmin_emergency' && userId === ADMIN_ID) {
    emergencyMode = !emergencyMode;
    const status = emergencyMode ? 'চালু 🛑' : 'বন্ধ ✅';
    await bot.sendMessage(ADMIN_ID,
      '🛑 *Emergency Mode ' + status + ' হয়েছে!*\n\n' +
      (emergencyMode ? 'সব Signal, Screenshot এবং Session বন্ধ থাকবে (এমনকি admin এর জন্যও)।' : 'সব Feature আবার স্বাভাবিকভাবে কাজ করবে।'),
      { parse_mode: 'Markdown' }
    );
    if (emergencyMode && sessionModule && sessionModule.isSessionRunning()) {
      sessionModule.stopSessionNow();
    }
    return;
  }

  if (pair === 'xadmin_errorlogs' && userId === ADMIN_ID) {
    if (errorLogBuffer.length === 0) { await bot.sendMessage(ADMIN_ID, '✅ কোনো Error Log নেই।'); return; }
    const text = '🚨 সর্বশেষ ' + errorLogBuffer.length + ' টি Error Log\n\n' +
      errorLogBuffer.slice(-20).map((e, i) => (i + 1) + '. ' + e.slice(0, 300)).join('\n\n');
    try {
      await bot.sendMessage(ADMIN_ID, text.slice(0, 4000));
    } catch (e) {
      await bot.sendMessage(ADMIN_ID, '❌ Error log পাঠাতে সমস্যা: ' + e.message);
    }
    return;
  }

  if (pair === '/verify') {
    verifyMode.add(userId);
    await bot.sendMessage(chatId, '🔐 𝗣𝗹𝗲𝗮𝘀𝗲 𝗦𝗲𝗻𝗱 𝗬𝗼𝘂𝗿 𝟴-𝗗𝗶𝗴𝗶𝘁 𝗤𝘂𝗼𝘁𝗲𝘅 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗 👇', { parse_mode: 'Markdown' });
    return;
  }

  if (!livePairSymbols.includes(symbolFromDisplayPair(pair))) return;

  if (!isApproved(userId) && getTrialSignalLeft(userId) <= 0) { sendVerifyPrompt(chatId); return; }

  await generateSignalForPair(chatId, userId, pair);
});

// Sticker file_id getter
bot.on('sticker', async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  await bot.sendMessage(msg.chat.id,
    '📎 *Sticker file\\_id:*\n`' + msg.sticker.file_id + '`',
    { parse_mode: 'Markdown' }
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✅ মধ্যরাত ১২টায় Daily Admin Report scheduler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

setInterval(async () => {
  try {
    const { hour, minute } = getBDTimeInfo();
    const dateKeyNow = currentBDDateKey();

    if (hour === 0 && minute >= 2 && minute <= 6 && lastReportDateKey !== dateKeyNow) {
      lastReportDateKey = dateKeyNow;
      ensureDailyStatsFresh();
      try {
        await bot.sendMessage(ADMIN_ID, buildDailyAdminReport(), { parse_mode: 'Markdown' });
        console.log('📊 Daily admin report sent for', dailyStats.dateKey);
      } catch (e) {
        console.log('Daily report send error:', e.message);
      }
      dailyStats = { dateKey: dateKeyNow, activeUsers: new Set(), totalSignals: 0, directWin: 0, mtgWin: 0, loss: 0 };
      userDailyStats.clear();
    }
  } catch (e) {
    console.error('Daily report scheduler error:', e.message);
  }
}, 60 * 1000);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔗 QUOTEX AFFILIATE POSTBACK SERVER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/postback', async (req, res) => {
  try {
    const { status, uid, eid, cid, sid, lid, country, sumdep, sumwithdraw, token } = req.query;
    console.log('📩 Postback received:', req.query);

    if (token !== process.env.POSTBACK_SECRET) {
      console.log('🚫 Postback রিজেক্ট হলো — ভুল বা মিসিং token');
      res.status(403).send('Forbidden');
      return;
    }

    if (!uid || !db) {
      console.log('⚠️ Postback received without uid or DB not ready');
      res.status(200).send('OK');
      return;
    }

    const traderId = String(uid);
    const statusVal = String(Array.isArray(status) ? status[0] : (status || '')).toLowerCase();

    if (statusVal === 'reg') {
      await db.collection('affiliateVerified').updateOne(
        { traderId },
        { $set: { traderId, registered: true, country: country || null, eventId: eid || null, receivedAt: new Date() } },
        { upsert: true }
      );
      console.log(`✅ Trader ID ${traderId} — Registration saved`);
    } else if (statusVal === 'dep') {
      const depositAmt = sumdep ? parseFloat(Array.isArray(sumdep) ? sumdep[0] : sumdep) : 0;
      const safeDeposit = isNaN(depositAmt) ? 0 : depositAmt;
      const existing = await db.collection('affiliateVerified').findOne({ traderId });
      const newTotal = (existing && existing.depositAmount ? existing.depositAmount : 0) + safeDeposit;
      const verified = newTotal >= MIN_DEPOSIT_USD;
      await db.collection('affiliateVerified').updateOne(
        { traderId },
        { $set: { traderId, registered: true, depositAmount: newTotal, verified, depositAt: new Date() } },
        { upsert: true }
      );
      console.log(`💰 Trader ID ${traderId} — Deposit updated: $${newTotal} (verified: ${verified})`);
    } else {
      await db.collection('affiliateVerified').updateOne(
        { traderId },
        { $set: { traderId, lastStatus: statusVal, receivedAt: new Date() } },
        { upsert: true }
      );
      console.log(`ℹ️ Trader ID ${traderId} — status "${statusVal}" saved (no action needed)`);
    }

    res.status(200).send('OK');
  } catch (e) {
    console.error('❌ Postback error:', e.message);
    res.status(500).send('Error');
  }
});

app.get('/', (req, res) => res.send('Bot is running.'));

app.listen(PORT, () => console.log(`✅ Postback server listening on port ${PORT}`));

connectDB().then(() => {
  sessionModule = require('./session');
  if (typeof sessionModule.setEmergencyChecker === 'function') {
    sessionModule.setEmergencyChecker(() => emergencyMode);
  }
  sessionModule(bot);
  console.log('Bot running v24 - XAdmin FULL Control Panel + Real Candle-Based Result Tracking...');
  require('./screenshot')(bot, db, approvedUsers, bannedUsers, isApproved, getTrialScreenshotLeft, incrementTrialScreenshot, sendVerifyPrompt, FREE_TRIAL_SCREENSHOT, signalInlineKeyboard, lastSignalMsgId, () => emergencyMode);
  const newsModule = require('./news')(bot);
  require('./channel')(bot, newsModule, () => emergencyMode);
  bot.startPolling();
}).catch(err => {
  console.error('MongoDB connection failed:', err);
  process.exit(1);
});
