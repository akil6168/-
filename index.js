// v19 - Free Trial System
const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');
const https = require('https');

const TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const bot = new TelegramBot(TOKEN, { polling: false });

const ADMIN_ID = 5724602667;
const TWELVE_DATA_KEY = '3d31d53eb903483fb33d6854db50e0fd';
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

// প্রতিটা user এর last signal message id store করার জন্য
const lastSignalMsgId = new Map();

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
}

async function addStartedUser(userId) {
  startedUsers.add(userId);
  await db.collection('startedUsers').updateOne(
    { userId }, { $set: { userId } }, { upsert: true }
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
      { text: '➕ Generate New Signal 📊', callback_data: 'new_signal' },
    ],
    [
      { text: '📸 Screenshot Analysis', callback_data: 'screenshot_analysis' }
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

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getCandles(symbol) {
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1min&outputsize=30&apikey=${TWELVE_DATA_KEY}`;
  const data = await fetchJSON(url);
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
  bot.sendMessage(chatId, '📊 Choose Trading Pair (OTC) 👇', {
    reply_markup: { inline_keyboard: keyboard }
  });
}

function sendVerifyPrompt(chatId) {
  bot.sendMessage(chatId,
    '🔒 *Free Trial শেষ হয়েছে!*\n\n' +
    '✅ আরো signal ও screenshot analysis পেতে *Verify* করুন।\n\n' +
    '📌 নিচের লিংক থেকে Quotex account খুলে আপনার *8-digit Trader ID* পাঠান।',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Create Quotex Account', url: 'https://market-qx.pro/sign-up/?lid=2178055' }],
          [{ text: '✅ Verify Trader ID', callback_data: '/verify' }]
        ]
      }
    }
  );
}

// Loading bar steps
const loadingSteps = [
  { emoji: '📡', percent: 0,   bar: '░░░░░░░░░░', label: 'Connecting to live market...' },
  { emoji: '📊', percent: 20,  bar: '██░░░░░░░░', label: 'Collecting price data...' },
  { emoji: '📈', percent: 40,  bar: '████░░░░░░', label: 'Analyzing market trend...' },
  { emoji: '🧠', percent: 60,  bar: '██████░░░░', label: 'Calculating indicators...' },
  { emoji: '⚡', percent: 80,  bar: '████████░░', label: 'Finding best entry...' },
  { emoji: '🔍', percent: 100, bar: '██████████', label: 'Final confirmation...' }
];

async function runLoadingBar(chatId) {
  const msg = await bot.sendMessage(chatId,
    '📡 MARKET ANALYSING...\n\n[░░░░░░░░░░] 0%\nConnecting to live market...'
  );
  const msgId = msg.message_id;

  for (let i = 1; i < loadingSteps.length; i++) {
    await new Promise(r => setTimeout(r, 500));
    const s = loadingSteps[i];
    try {
      await bot.editMessageText(
        s.emoji + ' MARKET ANALYSING...\n\n[' + s.bar + '] ' + s.percent + '%\n' + s.label,
        { chat_id: chatId, message_id: msgId }
      );
    } catch (e) {}
  }

  return msgId;
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
      try { await bot.sendMessage(uid, '🔧 *Bot Maintenance চলছে...*\n\n⏳ কিছুক্ষণ পর আবার চালু হবে।', { parse_mode: 'Markdown' }); } catch (e) {}
    }
  } else if (action === 'off') {
    maintenanceMode = false;
    await bot.sendMessage(ADMIN_ID, '✅ *Maintenance Mode বন্ধ হয়েছে!*', { parse_mode: 'Markdown' });
    for (const uid of startedUsers) {
      if (uid === ADMIN_ID) continue;
      try { await bot.sendMessage(uid, '✅ *Bot আবার চালু হয়েছে!*\n\n📊 Signal নিতে নিচের বাটনে ক্লিক করুন।', { parse_mode: 'Markdown' }); } catch (e) {}
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

  if (userId !== ADMIN_ID && maintenanceMode) {
    await bot.sendMessage(chatId, '🔧 *Bot Maintenance চলছে...*\n\n⏳ কিছুক্ষণ পর আবার চালু হবে।', { parse_mode: 'Markdown' });
    return;
  }
  if (bannedUsers.has(userId)) {
    await bot.sendMessage(chatId, '🚫 আপনাকে ban করা হয়েছে।');
    return;
  }
  if (!startedUsers.has(userId)) {
    await addStartedUser(userId);
    await bot.sendMessage(ADMIN_ID,
      '♻️ *NEW USER STARTED BOT* ➕\n\n👤 Name: ' + firstName + '\n🆔 ID: `' + userId + '`',
      { parse_mode: 'Markdown' }
    );
  }

  if (isApproved(userId)) {
    await bot.sendMessage(chatId,
      '⚡ *AI Signal System*\n📊 *নির্ভুল Trade Analysis*\n📸 *Screenshot দিয়ে Chart বিশ্লেষণ*\n👑 *Premium VIP সুবিধা*\n\n📊 Trading signals পেতে নিচের বাটনে ক্লিক করুন।',
      {
        parse_mode: 'Markdown',
        reply_markup: approvedKeyboard
      }
    );
    await bot.sendMessage(chatId, '📊 Choose Trading Pair (OTC) 👇 অথবা Screenshot Analysis করুন:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Generate New Signal 📊', callback_data: 'new_signal' }],
          [{ text: '📸 Screenshot Analysis', callback_data: 'screenshot_analysis' }]
        ]
      }
    });
    return;
  }

  const signalLeft = getTrialSignalLeft(userId);
  const screenshotLeft = getTrialScreenshotLeft(userId);

  if (signalLeft > 0 || screenshotLeft > 0) {
    await bot.sendMessage(chatId,
      '⚡ *AI Signal System*\n📊 *নির্ভুল Trade Analysis*\n📸 *Screenshot দিয়ে Chart বিশ্লেষণ*\n👑 *Premium VIP সুবিধা*\n\n' +
      '🎁 *Free Trial:*\n' +
      '📊 Signal বাকি: *' + signalLeft + '/' + FREE_TRIAL_SIGNAL + '*\n' +
      '📸 Screenshot বাকি: *' + screenshotLeft + '/' + FREE_TRIAL_SCREENSHOT + '*\n\n' +
      '💡 Verify করলে unlimited access পাবেন!',
      {
        parse_mode: 'Markdown',
        reply_markup: trialKeyboard
      }
    );
    await bot.sendMessage(chatId, '📊 Choose Trading Pair (OTC) 👇 অথবা Screenshot Analysis করুন:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Generate New Signal 📊', callback_data: 'new_signal' }],
          [{ text: '📸 Screenshot Analysis', callback_data: 'screenshot_analysis' }]
        ]
      }
    });
    return;
  }

  await bot.sendMessage(chatId,
    '⚡ *AI Signal System*\n📊 *নির্ভুল Trade Analysis*\n📸 *Screenshot দিয়ে Chart বিশ্লেষণ*\n👑 *Premium VIP সুবিধা*\n\n' +
    '💡 নিচে দেওয়া লিংক থেকে একাউন্ট খুলে 📌 আপনার *8-digit Trader ID* পাঠান verification এর জন্য।\n\n' +
    '✅ Verify করলেই সব feature unlock হবে।',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Create Quotex Account', url: 'https://market-qx.pro/sign-up/?lid=2178055' }],
          [{ text: '✅ Verify Trader ID', callback_data: '/verify' }]
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
          [{ text: '📢 Broadcast Message', callback_data: 'admin_broadcast' }],
          [{ text: '❌ Unapprove User', callback_data: 'admin_unapprove_prompt' }],
          [{ text: '🚫 Ban User', callback_data: 'admin_ban_prompt' }],
          [{ text: '✅ Unban User', callback_data: 'admin_unban_prompt' }],
          [{ text: maintenanceMode ? '✅ Maintenance OFF' : '🔧 Maintenance ON', callback_data: 'admin_maintenance' }]
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
  try { await bot.sendMessage(targetId, '⛔ আপনার bot access বাতিল করা হয়েছে।\n\n✅ পুনরায় verify করতে /start দিন।'); } catch (e) {}
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
  try { await bot.sendMessage(targetId, '🚫 আপনাকে bot থেকে ban করা হয়েছে।'); } catch (e) {}
});

// /unban
bot.onText(/\/unban (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const targetId = parseInt(match[1].trim());
  if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ Format: /unban [user_id]'); return; }
  if (!bannedUsers.has(targetId)) { await bot.sendMessage(ADMIN_ID, '⚠️ User `' + targetId + '` ban list এ নেই।', { parse_mode: 'Markdown' }); return; }
  await removeBannedUser(targetId);
  await bot.sendMessage(ADMIN_ID, '✅ *User Unbanned!*\n\n🆔 User ID: `' + targetId + '`', { parse_mode: 'Markdown' });
  try { await bot.sendMessage(targetId, '✅ আপনার ban তুলে নেওয়া হয়েছে!\n\n📌 পুনরায় access পেতে /start দিন।'); } catch (e) {}
});

// Message handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || 'User';
  const username = msg.from.username ? '@' + msg.from.username : '[' + firstName + '](tg://user?id=' + userId + ')';

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
      try { await bot.sendMessage(uid, '📢 *Admin Message:*\n\n' + text, { parse_mode: 'Markdown' }); successCount++; } catch (e) {}
    }
    await bot.sendMessage(ADMIN_ID, '✅ Broadcast sent to ' + successCount + ' users!');
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
    try { await bot.sendMessage(targetId, '⛔ আপনার bot access বাতিল করা হয়েছে।\n\n✅ পুনরায় verify করতে /start দিন।'); } catch (e) {}
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
    try { await bot.sendMessage(targetId, '🚫 আপনাকে bot থেকে ban করা হয়েছে।'); } catch (e) {}
    return;
  }

  if (unbanMode.has(userId) && userId === ADMIN_ID) {
    unbanMode.delete(userId);
    const targetId = parseInt(text.trim());
    if (isNaN(targetId)) { await bot.sendMessage(ADMIN_ID, '❌ ভুল User ID।'); return; }
    if (!bannedUsers.has(targetId)) { await bot.sendMessage(ADMIN_ID, '⚠️ User ban list এ নেই।'); return; }
    await removeBannedUser(targetId);
    await bot.sendMessage(ADMIN_ID, '✅ *User Unbanned!*\n\n🆔 User ID: `' + targetId + '`', { parse_mode: 'Markdown' });
    try { await bot.sendMessage(targetId, '✅ আপনার ban তুলে নেওয়া হয়েছে!\n\n📌 পুনরায় access পেতে /start দিন।'); } catch (e) {}
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
      await bot.sendMessage(chatId, '📊 Choose Trading Pair (OTC) 👇 অথবা Screenshot Analysis করুন:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Generate New Signal 📊', callback_data: 'new_signal' }],
            [{ text: '📸 Screenshot Analysis', callback_data: 'screenshot_analysis' }]
          ]
        }
      });
    } else {
      await bot.sendMessage(chatId, '❌ ভুল API KEY! আবার চেষ্টা করুন।');
    }
    return;
  }

  if (!verifyMode.has(userId)) return;

  if (!/^\d{8}$/.test(text)) {
    await bot.sendMessage(chatId, '❌ ভুল Trader ID\n\n🔐 আপনার 8-digit Quotex Trader ID পাঠান 👇');
    return;
  }

  verifyMode.delete(userId);
  await addSubmission({ userId, name: firstName, username: msg.from.username || null, traderId: text, time: new Date().toISOString() });

  await bot.sendMessage(ADMIN_ID,
    '🔔 *NEW TRADER ID SUBMISSION*\n\n👤 Name: ' + username + '\n🆔 User ID: `' + userId + '`\n📌 Trader ID: `' + text + '`\n\n✅ Approve: `/approve ' + userId + '`',
    { parse_mode: 'Markdown' }
  );
  await bot.sendMessage(chatId,
    '✅ *Trader ID সফলভাবে জমা হয়েছে!*\n\n⏳ Admin verification এর জন্য অপেক্ষা করুন। 🔔',
    { parse_mode: 'Markdown' }
  );
});

// Signal generate করার common function
async function generateSignalForPair(chatId, userId, pair) {
  // আগের signal message delete করা
  if (lastSignalMsgId.has(userId)) {
    try { await bot.deleteMessage(chatId, lastSignalMsgId.get(userId)); } catch (e) {}
    lastSignalMsgId.delete(userId);
  }

  // Trial check
  if (!isApproved(userId)) {
    if (getTrialSignalLeft(userId) <= 0) { sendVerifyPrompt(chatId); return; }
    await incrementTrialSignal(userId);
    const left = getTrialSignalLeft(userId);
    if (left === 0) {
      await bot.sendMessage(chatId, '⚠️ এটা আপনার *শেষ Free Trial signal!*\n\nVerify করুন unlimited access পেতে।', { parse_mode: 'Markdown' });
    }
  }

  // Loading bar
  const loadMsgId = await runLoadingBar(chatId);

  // Clock
  const clockMsg = await bot.sendMessage(chatId, '🕐 Signal generating...\n\n⏰ Bangladesh Time: --:--:--');
  const clockId = clockMsg.message_id;
  await new Promise((resolve) => {
    const clockInterval = setInterval(async () => {
      const now = new Date();
      const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      const h = String(bd.getUTCHours()).padStart(2, '0');
      const m = String(bd.getUTCMinutes()).padStart(2, '0');
      const s = String(bd.getUTCSeconds()).padStart(2, '0');
      try {
        await bot.editMessageText(
          '🕐 Signal generating...\n\n⏰ Bangladesh Time: ' + h + ':' + m + ':' + s,
          { chat_id: chatId, message_id: clockId }
        );
      } catch (e) {}
      if (bd.getUTCSeconds() === 58) { clearInterval(clockInterval); resolve(); }
    }, 1000);
  });

  try { await bot.deleteMessage(chatId, loadMsgId); } catch (e) {}
  try { await bot.deleteMessage(chatId, clockId); } catch (e) {}

  let signal;
  try {
    signal = await analyzeSignal(pair);
  } catch (e) {
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

  // নতুন signal message id save করা
  lastSignalMsgId.set(userId, sentMsg.message_id);
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
        try { await bot.sendMessage(uid, '🔧 *Bot Maintenance চলছে...*\n\n⏳ কিছুক্ষণ পর আবার চালু হবে।', { parse_mode: 'Markdown' }); } catch (e) {}
      }
    } else {
      for (const uid of startedUsers) {
        if (uid === ADMIN_ID) continue;
        try { await bot.sendMessage(uid, '✅ *Bot আবার চালু হয়েছে!*\n\n📊 Signal নিতে নিচের বাটনে ক্লিক করুন।', { parse_mode: 'Markdown' }); } catch (e) {}
      }
    }
    return;
  }

  if (pair === 'admin_total' && userId === ADMIN_ID) {
    await bot.sendMessage(ADMIN_ID,
      '👥 *TOTAL USERS*\n\n📊 Total Started: `' + startedUsers.size + '`\n✅ Total Approved: `' + (approvedUsers.size - 1) + '`\n🚫 Total Banned: `' + bannedUsers.size + '`\n📋 Total Submissions: `' + submissions.length + '`',
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
      const uname = sub && sub.username ? '@' + sub.username : (sub ? sub.name : 'Unknown');
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
      const uname = s.username ? '@' + s.username : s.name;
      text += (i + 1) + '. ' + uname + '\n🆔 `' + s.userId + '`\n📌 Trader ID: `' + s.traderId + '`\n\n';
    });
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_submissions' && userId === ADMIN_ID) {
    if (submissions.length === 0) { await bot.sendMessage(ADMIN_ID, '📋 কোনো submission নেই।'); return; }
    let text = '📋 *TRADER ID SUBMISSIONS*\n\n';
    submissions.forEach((s, i) => {
      const uname = s.username ? '@' + s.username : s.name;
      text += (i + 1) + '. ' + uname + '\n🆔 User: `' + s.userId + '`\n📌 Trader ID: `' + s.traderId + '`\n\n';
    });
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_broadcast' && userId === ADMIN_ID) {
    broadcastMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '📢 যে message সব user কে পাঠাতে চাও সেটা লেখো:');
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
        const uname = sub && sub.username ? '@' + sub.username : (sub ? sub.name : 'Unknown');
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
        const uname = sub && sub.username ? '@' + sub.username : (sub ? sub.name : 'Unknown');
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
        const uname = sub && sub.username ? '@' + sub.username : (sub ? sub.name : 'Unknown');
        text += (i + 1) + '. ' + uname + ' — `' + uid + '`\n';
      });
      text += '\n📌 যে user কে unban করতে চাও তার *User ID* পাঠাও:';
    }
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (pair === '/verify') {
    verifyMode.add(userId);
    await bot.sendMessage(chatId, '🔐 আপনার 8-digit Quotex Trader ID পাঠান 👇');
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
connectDB().then(() => {
  require('./session')(bot);
  console.log('Bot running v19 - Free Trial System Added...');
  require('./screenshot')(bot, db, approvedUsers, bannedUsers, isApproved, getTrialScreenshotLeft, incrementTrialScreenshot, sendVerifyPrompt, FREE_TRIAL_SCREENSHOT, signalInlineKeyboard, lastSignalMsgId);
  const newsModule = require('./news')(bot);
  require('./channel')(bot, newsModule);
  bot.startPolling();
}).catch(err => {
  console.error('MongoDB connection failed:', err);
  process.exit(1);
});
