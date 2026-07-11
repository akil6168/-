// v20 - Free Trial System + Affiliate Postback Auto-Verify
const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');
const express = require('express');
const twelveData = require('./twelvedata');

const TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const bot = new TelegramBot(TOKEN, { polling: false });

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
const FREE_TRIAL_SIGNAL = 5;
const FREE_TRIAL_SCREENSHOT = 5;

let maintenanceMode = false;

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
const messageUserMode = new Set();       // admin এখন target user id দিচ্ছে
const pendingMessageTarget = new Map();  // adminId -> targetUserId (এখন message text এর অপেক্ষায়)

// session.js module reference — admin panel থেকে manual session চালানোর জন্য
let sessionModule;

// প্রতিটা user এর last signal message id store করার জন্য
const lastSignalMsgId = new Map();

// ✅ প্রতিটা user এর জন্য সবসময় একটা ক্লিকযোগ্য mention বানানোর হেল্পার —
// username না থাকলেও tg://user?id= লিংক দিয়ে এক ক্লিকে প্রোফাইলে যাওয়া যায়
function mentionUser(userId, username, firstName) {
  const safeName = (firstName || 'User').replace(/[\[\]]/g, '');
  if (username) return '@' + username + ' ([' + safeName + '](tg://user?id=' + userId + '))';
  return '[' + safeName + '](tg://user?id=' + userId + ')';
}

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

  // Indexes — বড় user base এ query fast রাখার জন্য
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

// নিচে কোনো keyboard নেই
const approvedKeyboard = { remove_keyboard: true };
const trialKeyboard = { remove_keyboard: true };

// Signal message এর নিচে inline button
const signalInlineKeyboard = {
  inline_keyboard: [
    [
      { text: '➕ 𝗚𝗲𝗻𝗲𝗿𝗮𝘁𝗲 𝗡𝗲𝘄 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹 📊', callback_data: 'new_signal' },
    ],
    [
      { text: '📸 𝗔𝗻𝗮𝗹𝘆𝘇𝗲 𝗖𝗵𝗮𝗿𝘁 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁', callback_data: 'screenshot_analysis' }
    ]
  ]
};

const pairs = [
  'EUR/USD OTC', 'GBP/USD OTC', 'USD/JPY OTC',
  'AUD/USD OTC', 'USD/CAD OTC', 'EUR/GBP OTC',
  'EUR/NZD OTC', 'GBP/NZD OTC', 'USD/PKR OTC',
  'USD/INR OTC', 'USD/BDT OTC', 'USD/IDR OTC',
  'CAD/CHF OTC', 'EUR/JPY OTC', 'GBP/JPY OTC',
  'USD/CHF OTC'
];

const pairSymbolMap = {
  'EUR/USD OTC': 'EUR/USD', 'GBP/USD OTC': 'GBP/USD',
  'USD/JPY OTC': 'USD/JPY', 'AUD/USD OTC': 'AUD/USD',
  'USD/CAD OTC': 'USD/CAD', 'EUR/GBP OTC': 'EUR/GBP',
  'EUR/NZD OTC': 'EUR/NZD', 'GBP/NZD OTC': 'GBP/NZD',
  'USD/PKR OTC': 'USD/PKR', 'USD/INR OTC': 'USD/INR',
  'USD/BDT OTC': 'USD/BDT', 'USD/IDR OTC': 'USD/IDR',
  'CAD/CHF OTC': 'CAD/CHF', 'EUR/JPY OTC': 'EUR/JPY',
  'GBP/JPY OTC': 'GBP/JPY', 'USD/CHF OTC': 'USD/CHF'
};

async function getCandles(symbol) {
  const data = await twelveData.getTimeSeries(symbol, '1min', 30);
  if (!data.values || data.values.length === 0) throw new Error('No candle data');
  return data.values.map(v => ({
    open: parseFloat(v.open), high: parseFloat(v.high),
    low: parseFloat(v.low), close: parseFloat(v.close)
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

async function analyzeSignal(otcPair) {
  const symbol = pairSymbolMap[otcPair];
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

  return { direction, confidence, winRate, trend, rsi: rsi.toFixed(1), pattern: priceAction.pattern };
}

function sendPairMenu(chatId) {
  const keyboard = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const row = [{ text: pairs[i], callback_data: pairs[i] }];
    if (pairs[i + 1]) row.push({ text: pairs[i + 1], callback_data: pairs[i + 1] });
    keyboard.push(row);
  }
  bot.sendMessage(chatId, '📈 𝗖𝗵𝗼𝗼𝘀𝗲 𝗬𝗼𝘂𝗿 𝗧𝗿𝗮𝗱𝗶𝗻𝗴 𝗣𝗮𝗶𝗿 (𝗢𝗧𝗖) 👇', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}

function sendVerifyPrompt(chatId) {
  bot.sendMessage(chatId,
    '🔒 𝗙𝗿𝗲𝗲 𝗧𝗿𝗶𝗮𝗹 𝗘𝘅𝗽𝗶𝗿𝗲𝗱!\n\n' +
    '🚀 𝗨𝗻𝗹𝗼𝗰𝗸 𝗨𝗻𝗹𝗶𝗺𝗶𝘁𝗲𝗱 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹𝘀 & 𝗖𝗵𝗮𝗿𝘁 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀.\n\n' +
    '📌 𝗖𝗿𝗲𝗮𝘁𝗲 𝗮 𝗤𝘂𝗼𝘁𝗲𝘅 𝗔𝗰𝗰𝗼𝘂𝗻𝘁 𝗮𝗻𝗱 𝘀𝗲𝗻𝗱 𝘆𝗼𝘂𝗿 𝟴-𝗱𝗶𝗴𝗶𝘁 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗 𝘁𝗼 𝗰𝗼𝗺𝗽𝗹𝗲𝘁𝗲 𝘃𝗲𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻.',
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

// Deep Analysis স্টেপ
const deepAnalysisSteps = [
  '📊 𝗔𝗻𝗮𝗹𝘆𝘇𝗶𝗻𝗴 𝗣𝗿𝗶𝗰𝗲 𝗔𝗰𝘁𝗶𝗼𝗻...',
  '📈 𝗖𝗵𝗲𝗰𝗸𝗶𝗻𝗴 𝗧𝗿𝗲𝗻𝗱 & 𝗠𝗼𝗺𝗲𝗻𝘁𝘂𝗺...',
  '🎯 𝗙𝗶𝗻𝗱𝗶𝗻𝗴 𝗛𝗶𝗴𝗵-𝗣𝗿𝗼𝗯𝗮𝗯𝗶𝗹𝗶𝘁𝘆 𝗦𝗲𝘁𝘂𝗽...'
];

async function runLoadingBar(chatId) {
  // ধাপ ১ — প্রাথমিক লোডিং মেসেজ
  const bd0 = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const bdStr = String(bd0.getUTCHours()).padStart(2,'0') + ':' + String(bd0.getUTCMinutes()).padStart(2,'0') + ':' + String(bd0.getUTCSeconds()).padStart(2,'0');

  const loadMsg = await bot.sendMessage(chatId,
    '🚀 𝗔𝗻𝗮𝗹𝘆𝘇𝗶𝗻𝗴 𝗠𝗮𝗿𝗸𝗲𝘁 𝗗𝗮𝘁𝗮...\n\n' +
    '⏰ 𝗕𝗗 𝗧𝗶𝗺𝗲: ' + bdStr + '\n' +
    '📊 𝗣𝗹𝗲𝗮𝘀𝗲 𝗪𝗮𝗶𝘁...',
    { parse_mode: 'Markdown' }
  );

  if (!loadMsg) {
    // sendMessage patch এ আটকে গেলে (বা Telegram থেকে fail করলে) এখানে থেমে যাওয়া দরকার
    throw new Error('runLoadingBar: initial loading message পাঠানো যায়নি');
  }

  const loadMsgId = loadMsg.message_id;

  await new Promise(r => setTimeout(r, 1500));

  // ধাপ ২ — Deep Analysis (countdown সহ)
  const startTime = Date.now();
  const totalWaitMs = 20000; // মোট ~20 সেকেন্ড analysis সময়

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

  const welcomeCore =
    '╭━━━〔 🤖 𝗤𝗫 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝟱.𝟬 〕━━━╮\n\n' +
    '⚡ 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹 𝗦𝘆𝘀𝘁𝗲𝗺\n' +
    '📊 𝗔𝗱𝘃𝗮𝗻𝗰𝗲𝗱 𝗧𝗿𝗮𝗱𝗲 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀\n' +
    '📸 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁 𝗖𝗵𝗮𝗿𝘁 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀\n' +
    '👑 𝗣𝗿𝗲𝗺𝗶𝘂𝗺 𝗩𝗜𝗣 𝗔𝗰𝗰𝗲𝘀𝘀\n\n';

  if (isApproved(userId)) {
    await bot.sendMessage(chatId,
      welcomeCore +
      '👑 𝗨𝗻𝗹𝗶𝗺𝗶𝘁𝗲𝗱 𝗔𝗰𝗰𝗲𝘀𝘀 𝗔𝗰𝘁𝗶𝘃𝗲 ✅\n\n' +
      '╰━━━━━━━━━━━━━━━━━━━━╯\n\n' +
      '🚀 𝗦𝘁𝗮𝗿𝘁 𝗬𝗼𝘂𝗿 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀\n\n' +
      '📊 𝗖𝗵𝗼𝗼𝘀𝗲 𝗧𝗿𝗮𝗱𝗶𝗻𝗴 𝗣𝗮𝗶𝗿 (𝗢𝗧𝗖)\n' +
      '📸 𝗢𝗿 𝗨𝗽𝗹𝗼𝗮𝗱 𝗮 𝗖𝗵𝗮𝗿𝘁 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁 👇',
      { parse_mode: 'Markdown', reply_markup: approvedKeyboard }
    );
    await bot.sendMessage(chatId, '👇 নিচের বাটনগুলো থেকে বেছে নিন:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ 𝗚𝗲𝗻𝗲𝗿𝗮𝘁𝗲 𝗡𝗲𝘄 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹 📊', callback_data: 'new_signal' }],
          [{ text: '📸 𝗔𝗻𝗮𝗹𝘆𝘇𝗲 𝗖𝗵𝗮𝗿𝘁 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁', callback_data: 'screenshot_analysis' }]
        ]
      }
    });
    return;
  }

  const signalLeft = getTrialSignalLeft(userId);
  const screenshotLeft = getTrialScreenshotLeft(userId);

  if (signalLeft > 0 || screenshotLeft > 0) {
    await bot.sendMessage(chatId,
      welcomeCore +
      '🎁 𝗙𝗿𝗲𝗲 𝗧𝗿𝗶𝗮𝗹\n' +
      '📈 𝗦𝗶𝗴𝗻𝗮𝗹𝘀 𝗟𝗲𝗳𝘁: 𝟬' + signalLeft + '/𝟬' + FREE_TRIAL_SIGNAL + '\n' +
      '📸 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁𝘀 𝗟𝗲𝗳𝘁: 𝟬' + screenshotLeft + '/𝟬' + FREE_TRIAL_SCREENSHOT + '\n\n' +
      '✅ 𝗩𝗲𝗿𝗶𝗳𝘆 𝗬𝗼𝘂𝗿 𝗔𝗰𝗰𝗼𝘂𝗻𝘁 𝘁𝗼 𝗨𝗻𝗹𝗼𝗰𝗸 𝗨𝗻𝗹𝗶𝗺𝗶𝘁𝗲𝗱 𝗔𝗰𝗰𝗲𝘀𝘀 🚀\n\n' +
      '╰━━━━━━━━━━━━━━━━━━━━╯\n\n' +
      '🚀 𝗦𝘁𝗮𝗿𝘁 𝗬𝗼𝘂𝗿 𝗔𝗻𝗮𝗹𝘆𝘀𝗶𝘀\n\n' +
      '📊 𝗖𝗵𝗼𝗼𝘀𝗲 𝗧𝗿𝗮𝗱𝗶𝗻𝗴 𝗣𝗮𝗶𝗿 (𝗢𝗧𝗖)\n' +
      '📸 𝗢𝗿 𝗨𝗽𝗹𝗼𝗮𝗱 𝗮 𝗖𝗵𝗮𝗿𝘁 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁 👇',
      { parse_mode: 'Markdown', reply_markup: trialKeyboard }
    );
    await bot.sendMessage(chatId, '👇 নিচের বাটনগুলো থেকে বেছে নিন:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ 𝗚𝗲𝗻𝗲𝗿𝗮𝘁𝗲 𝗡𝗲𝘄 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹 📊', callback_data: 'new_signal' }],
          [{ text: '📸 𝗔𝗻𝗮𝗹𝘆𝘇𝗲 𝗖𝗵𝗮𝗿𝘁 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁', callback_data: 'screenshot_analysis' }]
        ]
      }
    });
    return;
  }

  await bot.sendMessage(chatId,
    welcomeCore +
    '🔒 𝗙𝗿𝗲𝗲 𝗧𝗿𝗶𝗮𝗹 𝗘𝘅𝗽𝗶𝗿𝗲𝗱!\n\n' +
    '📌 𝗖𝗿𝗲𝗮𝘁𝗲 𝗮 𝗤𝘂𝗼𝘁𝗲𝘅 𝗔𝗰𝗰𝗼𝘂𝗻𝘁 𝗮𝗻𝗱 𝘀𝗲𝗻𝗱 𝘆𝗼𝘂𝗿 𝟴-𝗱𝗶𝗴𝗶𝘁 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗 𝘁𝗼 𝗰𝗼𝗺𝗽𝗹𝗲𝘁𝗲 𝘃𝗲𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻.\n\n' +
    '╰━━━━━━━━━━━━━━━━━━━━╯',
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
          [{ text: '👥 Total Users', callback_data: 'admin_total' }],
          [{ text: '✅ Approved Users', callback_data: 'admin_approved' }],
          [{ text: '⏳ Pending Verify List', callback_data: 'admin_pending' }],
          [{ text: '📋 Trader ID Submissions', callback_data: 'admin_submissions' }],
          [{ text: '⚡ Affiliate Verified List', callback_data: 'admin_affiliate' }],
          [{ text: '📢 Broadcast Message', callback_data: 'admin_broadcast' }],
          [{ text: '💬 Message a User', callback_data: 'admin_message_prompt' }],
          [{ text: '❌ Unapprove User', callback_data: 'admin_unapprove_prompt' }],
          [{ text: '🚫 Ban User', callback_data: 'admin_ban_prompt' }],
          [{ text: '✅ Unban User', callback_data: 'admin_unban_prompt' }],
          [{ text: maintenanceMode ? '✅ Maintenance OFF' : '🔧 Maintenance ON', callback_data: 'admin_maintenance' }],
          [{ text: '🚀 Start Session Now', callback_data: 'admin_session_start' }]
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
  await bot.sendMessage(targetId, '✅ *আপনার Trader ID verify হয়েছে!*\n\n🔐 Bot access করতে আপনার *API KEY* দিন: `' + apiKey + '`', { parse_mode: 'Markdown' });
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

// /sessionstart — admin যেকোনো সময় manually session চালাতে পারবে
bot.onText(/\/sessionstart/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
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

// /msg — নির্দিষ্ট user কে সরাসরি personal message পাঠানো: /msg <user_id> <message>
bot.onText(/\/msg (\d+) ([\s\S]+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const targetId = parseInt(match[1]);
  const text = match[2];
  try {
    await bot.sendMessage(targetId, '💬 Admin Message:\n\n' + text);
    await bot.sendMessage(ADMIN_ID, '✅ Message পাঠানো হয়েছে `' + targetId + '` কে।', { parse_mode: 'Markdown' });
  } catch (e) {
    await bot.sendMessage(ADMIN_ID, '❌ Message পাঠানো যায়নি (হয়তো user bot block করেছে বা কখনো /start দেয়নি)।\nError: ' + e.message);
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
        await bot.sendMessage(uid, '📢 Admin Message:\n\n' + text);
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
      await bot.sendMessage(targetId, '💬 Admin Message:\n\n' + text);
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

  if (passwordMode.has(userId)) {
    const correctPass = passwordMode.get(userId);
    if (text === correctPass) {
      passwordMode.delete(userId);
      await addApprovedUser(userId);
      await bot.sendMessage(chatId,
        '🎉 *Bot access পেয়েছেন!*\n\n📊 নিচের বাটনে ক্লিক করে signal নিন।',
        { parse_mode: 'Markdown', reply_markup: approvedKeyboard }
      );
      await bot.sendMessage(chatId, '👇 নিচের বাটনগুলো থেকে বেছে নিন:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ 𝗚𝗲𝗻𝗲𝗿𝗮𝘁𝗲 𝗡𝗲𝘄 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹 📊', callback_data: 'new_signal' }],
            [{ text: '📸 𝗔𝗻𝗮𝗹𝘆𝘇𝗲 𝗖𝗵𝗮𝗿𝘁 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁', callback_data: 'screenshot_analysis' }]
          ]
        }
      });
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

  // ✅ Affiliate postback list এ চেক করা — থাকলে সাথে সাথেই auto-approve
  const affRecord = await db.collection('affiliateVerified').findOne({ traderId: text });

  if (affRecord) {
    const apiKey = generateApiKey();
    passwordMode.set(userId, apiKey);
    await addSubmission({ userId, name: firstName, username: usernameHandle, traderId: text, time: new Date().toISOString(), autoVerified: true });
    await bot.sendMessage(chatId,
      '✅ *আপনার Trader ID স্বয়ংক্রিয়ভাবে verify হয়েছে!*\n\n🔐 Bot access করতে আপনার *API KEY* দিন: `' + apiKey + '`',
      { parse_mode: 'Markdown' }
    );
    await bot.sendMessage(ADMIN_ID,
      '⚡ *AUTO-VERIFIED (Affiliate Postback)*\n\n👤 Name: ' + username + '\n🆔 User ID: `' + userId + '`\n📌 Trader ID: `' + text + '`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Affiliate list এ না থাকলে আগের মতোই ম্যানুয়াল approval flow
  await addSubmission({ userId, name: firstName, username: usernameHandle, traderId: text, time: new Date().toISOString() });

  await bot.sendMessage(ADMIN_ID,
    '🔔 *NEW TRADER ID SUBMISSION*\n\n👤 Name: ' + username + '\n🆔 User ID: `' + userId + '`\n📌 Trader ID: `' + text + '`\n\n⚠️ Affiliate list এ পাওয়া যায়নি — ম্যানুয়ালি চেক করুন।\n\n✅ Approve: `/approve ' + userId + '`',
    { parse_mode: 'Markdown' }
  );
  await bot.sendMessage(chatId,
    '✅ *Trader ID সফলভাবে জমা হয়েছে!*\n\n⏳ Admin verification এর জন্য অপেক্ষা করুন। 🔔',
    { parse_mode: 'Markdown' }
  );
});

// একই user এর একাধিক concurrent signal request ঠেকানোর জন্য lock
const signalInProgress = new Set();

// Signal generate করার common function
async function generateSignalForPair(chatId, userId, pair) {
  if (signalInProgress.has(userId)) {
    await bot.sendMessage(chatId, '⏳ আপনার আগের request এখনো process হচ্ছে, একটু অপেক্ষা করুন...');
    return;
  }
  signalInProgress.add(userId);

  try {
    // আগের signal message delete করা
    if (lastSignalMsgId.has(userId)) {
      try { await bot.deleteMessage(chatId, lastSignalMsgId.get(userId)); } catch (e) {}
      lastSignalMsgId.delete(userId);
    }

    // Trial check
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

    // Loading + Deep Analysis (নতুন combined ফরম্যাট)
    const loadMsgId = await runLoadingBar(chatId);

    try { await bot.deleteMessage(chatId, loadMsgId); } catch (e) {}

    let signal;
    try {
      signal = await analyzeSignal(pair);
    } catch (e) {
      console.error('analyzeSignal fail for', pair, '-', e.message);
      const directions = ['UP⏫', 'DOWN⏬'];
      signal = { direction: directions[Math.floor(Math.random() * 2)], confidence: 'Medium 🟡', winRate: '75%' };
    }

    const now2 = new Date();
    const bd2 = new Date(now2.getTime() + 6 * 60 * 60 * 1000);
    bd2.setMinutes(bd2.getMinutes() + 1);
    const exH = String(bd2.getUTCHours()).padStart(2, '0');
    const exM = String(bd2.getUTCMinutes()).padStart(2, '0');

    const trialInfo = isApproved(userId) ? '' : '\n📊 Signal বাকি: *' + getTrialSignalLeft(userId) + '/' + FREE_TRIAL_SIGNAL + '*';

    const sentMsg = await bot.sendMessage(chatId,
      '╭──────────────────╮\n│    📈 *𝗤𝘅 𝘅𝗮𝗮𝗻 𝗙𝗮𝘁𝗵𝗲𝗿 𝗯𝗼𝘁*\n╰──────────────────╯\n\n' +
      '📊 *ASSET*  ➜ `' + pair + '`\n🔹 *TIME*     ➜ `1 MIN`\n🕒 *𝗘𝗡𝗧𝗥𝗬* ➜ `' + exH + ':' + exM + '`\n══════════════════\n' +
      '🚀 *DIRECTION* ➜ ' + signal.direction + '\n♻️ *WIN RATE*   ➜ `' + signal.winRate + '`\n✅ *CONFIDENCE* ➜ ' + signal.confidence + '\n══════════════════\n' +
      '⏹️ *Take the trade now!*\n⚠️ _Trade at your own risk if loss use 1 stet MTG_ ⚠️' + trialInfo,
      {
        parse_mode: 'Markdown',
        reply_markup: signalInlineKeyboard
      }
    );

    // নতুন signal message id save করা (sendMessage patch এ আটকে গেলে sentMsg null হতে পারে)
    if (sentMsg) lastSignalMsgId.set(userId, sentMsg.message_id);
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

  if (userId !== ADMIN_ID && maintenanceMode) {
    await bot.sendMessage(chatId, '🔧 *Bot Maintenance চলছে...*', { parse_mode: 'Markdown' });
    return;
  }

  // New signal button
  if (pair === 'new_signal') {
    if (!isApproved(userId) && getTrialSignalLeft(userId) <= 0) { sendVerifyPrompt(chatId); return; }
    sendPairMenu(chatId);
    return;
  }

  // Screenshot analysis button
  if (pair === 'screenshot_analysis') {
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
    let text = '📋 *TRADER ID SUBMISSIONS*\n\n';
    submissions.forEach((s, i) => {
      const uname = mentionUser(s.userId, s.username, s.name);
      const autoTag = s.autoVerified ? ' ⚡' : '';
      text += (i + 1) + '. ' + uname + autoTag + '\n🆔 User: `' + s.userId + '`\n📌 Trader ID: `' + s.traderId + '`\n\n';
    });
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_affiliate' && userId === ADMIN_ID) {
    const affList = await db.collection('affiliateVerified').find().sort({ receivedAt: -1 }).limit(30).toArray();
    if (affList.length === 0) { await bot.sendMessage(ADMIN_ID, '⚡ কোনো affiliate postback পাওয়া যায়নি এখনো।'); return; }
    let text = '⚡ *AFFILIATE VERIFIED (সর্বশেষ 30)*\n\n';
    affList.forEach((a, i) => {
      text += (i + 1) + '. 📌 Trader ID: `' + a.traderId + '`\n📊 Status: `' + (a.status || 'unknown') + '`\n\n';
    });
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
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

  if (pair === '/verify') {
    verifyMode.add(userId);
    await bot.sendMessage(chatId, '🔐 𝗣𝗹𝗲𝗮𝘀𝗲 𝗦𝗲𝗻𝗱 𝗬𝗼𝘂𝗿 𝟴-𝗗𝗶𝗴𝗶𝘁 𝗤𝘂𝗼𝘁𝗲𝘅 𝗧𝗿𝗮𝗱𝗲𝗿 𝗜𝗗 👇', { parse_mode: 'Markdown' });
    return;
  }

  if (!pairs.includes(pair)) return;

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
// 🔗 QUOTEX AFFILIATE POSTBACK SERVER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/postback', async (req, res) => {
  try {
    const { status, uid, eid, cid, lid } = req.query;
    console.log('📩 Postback received:', req.query);

    if (uid && db) {
      await db.collection('affiliateVerified').updateOne(
        { traderId: String(uid) },
        { $set: { traderId: String(uid), status: status || 'unknown', eventId: eid || null, receivedAt: new Date() } },
        { upsert: true }
      );
      console.log(`✅ Trader ID ${uid} saved as affiliate-verified (status: ${status})`);
    } else {
      console.log('⚠️ Postback received without uid or DB not ready');
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
  sessionModule(bot);
  console.log('Bot running v20 - Free Trial System + Affiliate Postback Auto-Verify...');
  require('./screenshot')(bot, db, approvedUsers, bannedUsers, isApproved, getTrialScreenshotLeft, incrementTrialScreenshot, sendVerifyPrompt, FREE_TRIAL_SCREENSHOT, signalInlineKeyboard, lastSignalMsgId);
  const newsModule = require('./news')(bot);
  require('./channel')(bot, newsModule);
  bot.startPolling();
}).catch(err => {
  console.error('MongoDB connection failed:', err);
  process.exit(1);
});
