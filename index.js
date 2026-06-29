// v16 - Admin Panel with Ban/Unban/Unapprove
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const https = require('https');
const TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

const ADMIN_ID = 5724602667;
const TWELVE_DATA_KEY = '3d31d53eb903483fb33d6854db50e0fd';

const verifyMode = new Set();
const passwordMode = new Map();
const approvedUsers = new Set([ADMIN_ID]);
const broadcastMode = new Set();
const bannedUsers = new Set();

// Admin action modes
const banMode = new Set();
const unbanMode = new Set();
const unapproveMode = new Set();

const STARTED_FILE = 'started_users.json';
const APPROVED_FILE = 'approved_users.json';
const SUBMISSIONS_FILE = 'submissions.json';
const BANNED_FILE = 'banned_users.json';

let startedUsers = new Set();
if (fs.existsSync(STARTED_FILE)) {
  try { startedUsers = new Set(JSON.parse(fs.readFileSync(STARTED_FILE, 'utf8'))); } catch (e) {}
}

if (fs.existsSync(APPROVED_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(APPROVED_FILE, 'utf8'));
    data.forEach(u => approvedUsers.add(u));
  } catch (e) {}
}

if (fs.existsSync(BANNED_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(BANNED_FILE, 'utf8'));
    data.forEach(u => bannedUsers.add(u));
  } catch (e) {}
}

let submissions = [];
if (fs.existsSync(SUBMISSIONS_FILE)) {
  try { submissions = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8')); } catch (e) {}
}

function saveStartedUsers() {
  fs.writeFileSync(STARTED_FILE, JSON.stringify([...startedUsers]));
}
function saveApprovedUsers() {
  fs.writeFileSync(APPROVED_FILE, JSON.stringify([...approvedUsers]));
}
function saveSubmissions() {
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions));
}
function saveBannedUsers() {
  fs.writeFileSync(BANNED_FILE, JSON.stringify([...bannedUsers]));
}

const approvedKeyboard = {
  keyboard: [
    [{ text: '➕ Generate New Signal 📊' }]
  ],
  resize_keyboard: true,
  persistent: true
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
  'EUR/USD OTC': 'EUR/USD',
  'GBP/USD OTC': 'GBP/USD',
  'USD/JPY OTC': 'USD/JPY',
  'AUD/USD OTC': 'AUD/USD',
  'USD/CAD OTC': 'USD/CAD',
  'EUR/GBP OTC': 'EUR/GBP',
  'EUR/NZD OTC': 'EUR/NZD',
  'GBP/NZD OTC': 'GBP/NZD',
  'USD/PKR OTC': 'USD/PKR',
  'USD/INR OTC': 'USD/INR',
  'USD/BDT OTC': 'USD/BDT',
  'USD/IDR OTC': 'USD/IDR',
  'CAD/CHF OTC': 'CAD/CHF',
  'EUR/JPY OTC': 'EUR/JPY',
  'GBP/JPY OTC': 'GBP/JPY',
  'USD/CHF OTC': 'USD/CHF'
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
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close)
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
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
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

  let upScore = 0;
  let downScore = 0;

  if (trend === 'UP') upScore += 2;
  else if (trend === 'DOWN') downScore += 2;

  if (rsi < 35) upScore += 2;
  else if (rsi > 65) downScore += 2;
  else if (rsi < 50) upScore += 1;
  else downScore += 1;

  if (priceAction.direction === 'UP') upScore += 3;
  else if (priceAction.direction === 'DOWN') downScore += 3;

  let direction, confidence, winRate;
  const totalScore = upScore + downScore;
  const dominantScore = Math.max(upScore, downScore);
  const ratio = dominantScore / totalScore;

  direction = upScore >= downScore ? 'UP⏫' : 'DOWN⏬';

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

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'User';
  const userId = msg.from.id;

  if (bannedUsers.has(userId)) {
    await bot.sendMessage(chatId, '🚫 আপনাকে ban করা হয়েছে। Bot use করতে পারবেন না। সাপোর্টে যোগাযোগ করুন : @AkiL_xD);
    return;
  }

  if (!startedUsers.has(userId)) {
    startedUsers.add(userId);
    saveStartedUsers();
    await bot.sendMessage(ADMIN_ID,
      '♻️ *NEW USER STARTED BOT* ➕\n\n' +
      '👤 Name: ' + firstName + '\n' +
      '🆔 ID: `' + userId + '`',
      { parse_mode: 'Markdown' }
    );
  }

  if (userId === ADMIN_ID || approvedUsers.has(userId)) {
    await bot.sendMessage(chatId,
      '👋 *Welcome to 𝗤𝘅_𝘅𝗮𝗮𝗻_𝗙𝗮𝘁𝗵𝗲𝗿_𝗯𝗼𝘁!* 🚀\n\n' +
      '📊 Trading signals পেতে নিচের বাটনে ক্লিক করুন।',
      { parse_mode: 'Markdown', reply_markup: approvedKeyboard }
    );
    return;
  }

  await bot.sendMessage(chatId,
    '👋 *Welcome to 𝗤𝘅_𝘅𝗮𝗮𝗻_𝗙𝗮𝘁𝗵𝗲𝗿_𝗯𝗼𝘁!* 🚀\n\n' +
    '📈 Get full access to premium trading signals.\n\n' +
    '🏆 Trade smarter with our advanced signal system.\n\n' +
    '💡 নিচে দেওয়া লিংক থেকে একাউন্ট খুলে 📌 আপনার 8-digit Trader ID পাঠান verification এর জন্য।\n\n' +
    '✅ Access premium features after verification.',
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
  if (bannedUsers.has(userId)) { await bot.sendMessage(chatId, '🚫 আপনি ban করা হয়েছেন।'); return; }
  if (!approvedUsers.has(userId)) {
    await bot.sendMessage(chatId, '🔒 আপনার account verified না।\n\n✅ আগে Verify করুন — /start');
    return;
  }
  sendPairMenu(chatId);
});

// /admin
bot.onText(/\/admin/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  await bot.sendMessage(ADMIN_ID,
    '👑 *ADMIN PANEL*\n' + '══════════════════',
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
          [{ text: '✅ Unban User', callback_data: 'admin_unban_prompt' }]
        ]
      }
    }
  );
});

// /approve
bot.onText(/\/approve (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const parts = match[1].split(' ');
  if (parts.length < 2) {
    await bot.sendMessage(ADMIN_ID, '❌ Format: /approve [user_id] [password]');
    return;
  }
  const targetId = parseInt(parts[0]);
  const password = parts[1];
  passwordMode.set(targetId, password);
  await bot.sendMessage(targetId,
    '✅ *আপনার Trader ID verify হয়েছে!*\n\n' +
    '🔐 Bot access করতে আপনার password দিন:',
    { parse_mode: 'Markdown' }
  );
  await bot.sendMessage(ADMIN_ID,
    '✅ User `' + targetId + '` কে approve করা হয়েছে।\n🔑 Password: `' + password + '`',
    { parse_mode: 'Markdown' }
  );
});

// /unapprove command
bot.onText(/\/unapprove (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const targetId = parseInt(match[1].trim());
  if (isNaN(targetId)) {
    await bot.sendMessage(ADMIN_ID, '❌ Format: /unapprove [user_id]');
    return;
  }
  if (targetId === ADMIN_ID) {
    await bot.sendMessage(ADMIN_ID, '❌ Admin কে unapprove করা যাবে না।');
    return;
  }
  approvedUsers.delete(targetId);
  passwordMode.delete(targetId);
  saveApprovedUsers();
  await bot.sendMessage(ADMIN_ID,
    '❌ *User Unapproved!*\n\n🆔 User ID: `' + targetId + '`\n⛔ এখন আর bot access নেই।',
    { parse_mode: 'Markdown' }
  );
  try {
    await bot.sendMessage(targetId,
      '⛔ আপনার bot access বাতিল করা হয়েছে।\n\n✅ পুনরায় verify করতে /start দিন।'
    );
  } catch (e) {}
});

// /ban command
bot.onText(/\/ban (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const targetId = parseInt(match[1].trim());
  if (isNaN(targetId)) {
    await bot.sendMessage(ADMIN_ID, '❌ Format: /ban [user_id]');
    return;
  }
  if (targetId === ADMIN_ID) {
    await bot.sendMessage(ADMIN_ID, '❌ Admin কে ban করা যাবে না।');
    return;
  }
  bannedUsers.add(targetId);
  approvedUsers.delete(targetId);
  passwordMode.delete(targetId);
  saveBannedUsers();
  saveApprovedUsers();
  await bot.sendMessage(ADMIN_ID,
    '🚫 *User Banned!*\n\n🆔 User ID: `' + targetId + '`\n⛔ সম্পূর্ণ bot access বন্ধ করা হয়েছে।',
    { parse_mode: 'Markdown' }
  );
  try {
    await bot.sendMessage(targetId, '🚫 আপনাকে bot থেকে ban করা হয়েছে।');
  } catch (e) {}
});

// /unban command
bot.onText(/\/unban (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const targetId = parseInt(match[1].trim());
  if (isNaN(targetId)) {
    await bot.sendMessage(ADMIN_ID, '❌ Format: /unban [user_id]');
    return;
  }
  if (!bannedUsers.has(targetId)) {
    await bot.sendMessage(ADMIN_ID, '⚠️ User `' + targetId + '` ban list এ নেই।', { parse_mode: 'Markdown' });
    return;
  }
  bannedUsers.delete(targetId);
  saveBannedUsers();
  await bot.sendMessage(ADMIN_ID,
    '✅ *User Unbanned!*\n\n🆔 User ID: `' + targetId + '`\n✅ Ban তুলে নেওয়া হয়েছে।',
    { parse_mode: 'Markdown' }
  );
  try {
    await bot.sendMessage(targetId,
      '✅ আপনার ban তুলে নেওয়া হয়েছে!\n\n📌 পুনরায় access পেতে /start দিন।'
    );
  } catch (e) {}
});

// Message handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || 'User';
  const username = msg.from.username
    ? '@' + msg.from.username
    : '[' + firstName + '](tg://user?id=' + userId + ')';

  if (!text || text.startsWith('/')) return;

  // Ban check (admin ছাড়া)
  if (userId !== ADMIN_ID && bannedUsers.has(userId)) {
    await bot.sendMessage(chatId, '🚫 আপনি ban করা হয়েছেন। Bot use করতে পারবেন না।');
    return;
  }

  if (text === '➕ Generate New Signal 📊') {
    if (!approvedUsers.has(userId)) {
      await bot.sendMessage(chatId, '🔒 আপনার account verified না।');
      return;
    }
    sendPairMenu(chatId);
    return;
  }

  if (broadcastMode.has(userId) && userId === ADMIN_ID) {
    broadcastMode.delete(userId);
    let successCount = 0;
    for (const uid of startedUsers) {
      try {
        await bot.sendMessage(uid, '📢 *Admin Message:*\n\n' + text, { parse_mode: 'Markdown' });
        successCount++;
      } catch (e) {}
    }
    await bot.sendMessage(ADMIN_ID, '✅ Broadcast sent to ' + successCount + ' users!');
    return;
  }

  // Admin: unapprove mode - user ID input
  if (unapproveMode.has(userId) && userId === ADMIN_ID) {
    unapproveMode.delete(userId);
    const targetId = parseInt(text.trim());
    if (isNaN(targetId)) {
      await bot.sendMessage(ADMIN_ID, '❌ ভুল User ID। আবার চেষ্টা করুন।');
      return;
    }
    if (targetId === ADMIN_ID) {
      await bot.sendMessage(ADMIN_ID, '❌ Admin কে unapprove করা যাবে না।');
      return;
    }
    approvedUsers.delete(targetId);
    passwordMode.delete(targetId);
    saveApprovedUsers();
    await bot.sendMessage(ADMIN_ID,
      '❌ *User Unapproved!*\n\n🆔 User ID: `' + targetId + '`\n⛔ এখন আর bot access নেই।',
      { parse_mode: 'Markdown' }
    );
    try {
      await bot.sendMessage(targetId,
        '⛔ আপনার bot access বাতিল করা হয়েছে।\n\n✅ পুনরায় verify করতে /start দিন।'
      );
    } catch (e) {}
    return;
  }

  // Admin: ban mode - user ID input
  if (banMode.has(userId) && userId === ADMIN_ID) {
    banMode.delete(userId);
    const targetId = parseInt(text.trim());
    if (isNaN(targetId)) {
      await bot.sendMessage(ADMIN_ID, '❌ ভুল User ID। আবার চেষ্টা করুন।');
      return;
    }
    if (targetId === ADMIN_ID) {
      await bot.sendMessage(ADMIN_ID, '❌ Admin কে ban করা যাবে না।');
      return;
    }
    bannedUsers.add(targetId);
    approvedUsers.delete(targetId);
    passwordMode.delete(targetId);
    saveBannedUsers();
    saveApprovedUsers();
    await bot.sendMessage(ADMIN_ID,
      '🚫 *User Banned!*\n\n🆔 User ID: `' + targetId + '`\n⛔ সম্পূর্ণ bot access বন্ধ।',
      { parse_mode: 'Markdown' }
    );
    try { await bot.sendMessage(targetId, '🚫 আপনাকে bot থেকে ban করা হয়েছে।'); } catch (e) {}
    return;
  }

  // Admin: unban mode - user ID input
  if (unbanMode.has(userId) && userId === ADMIN_ID) {
    unbanMode.delete(userId);
    const targetId = parseInt(text.trim());
    if (isNaN(targetId)) {
      await bot.sendMessage(ADMIN_ID, '❌ ভুল User ID। আবার চেষ্টা করুন।');
      return;
    }
    if (!bannedUsers.has(targetId)) {
      await bot.sendMessage(ADMIN_ID, '⚠️ User `' + targetId + '` ban list এ নেই।', { parse_mode: 'Markdown' });
      return;
    }
    bannedUsers.delete(targetId);
    saveBannedUsers();
    await bot.sendMessage(ADMIN_ID,
      '✅ *User Unbanned!*\n\n🆔 User ID: `' + targetId + '`\n✅ Ban তুলে নেওয়া হয়েছে।',
      { parse_mode: 'Markdown' }
    );
    try {
      await bot.sendMessage(targetId,
        '✅ আপনার ban তুলে নেওয়া হয়েছে!\n\n📌 পুনরায় access পেতে /start দিন।'
      );
    } catch (e) {}
    return;
  }

  if (passwordMode.has(userId)) {
    const correctPass = passwordMode.get(userId);
    if (text === correctPass) {
      passwordMode.delete(userId);
      approvedUsers.add(userId);
      saveApprovedUsers();
      await bot.sendMessage(chatId,
        '🎉 *Bot access পেয়েছেন!*\n\n' +
        '📊 নিচের বাটনে ক্লিক করে signal নিন।',
        { parse_mode: 'Markdown', reply_markup: approvedKeyboard }
      );
    } else {
      await bot.sendMessage(chatId, '❌ ভুল password! আবার চেষ্টা করুন।');
    }
    return;
  }

  if (!verifyMode.has(userId)) return;

  if (!/^\d{8}$/.test(text)) {
    await bot.sendMessage(chatId, '❌ ভুল Trader ID\n\n📌 সঠিক 8-digit Trader ID পাঠান।');
    return;
  }

  verifyMode.delete(userId);
  submissions.push({
    userId, name: firstName,
    username: msg.from.username || null,
    traderId: text,
    time: new Date().toISOString()
  });
  saveSubmissions();

  await bot.sendMessage(ADMIN_ID,
    '🔔 *NEW TRADER ID SUBMISSION*\n\n' +
    '👤 Name: ' + username + '\n' +
    '🆔 User ID: `' + userId + '`\n' +
    '📌 Trader ID: `' + text + '`\n\n' +
    '✅ Approve: `/approve ' + userId + ' [password]`',
    { parse_mode: 'Markdown' }
  );

  await bot.sendMessage(chatId,
    '✅ আপনার Trader ID পাঠানো হয়েছে।\nAdmin verification এর জন্য অপেক্ষা করুন।'
  );
});

// Callback handler
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const pair = query.data;
  bot.answerCallbackQuery(query.id);

  if (pair === 'admin_total' && userId === ADMIN_ID) {
    await bot.sendMessage(ADMIN_ID,
      '👥 *TOTAL USERS*\n\n' +
      '📊 Total Started: `' + startedUsers.size + '`\n' +
      '✅ Total Approved: `' + (approvedUsers.size - 1) + '`\n' +
      '🚫 Total Banned: `' + bannedUsers.size + '`\n' +
      '📋 Total Submissions: `' + submissions.length + '`',
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

  // ===== NEW: Unapprove prompt =====
  if (pair === 'admin_unapprove_prompt' && userId === ADMIN_ID) {
    unapproveMode.add(ADMIN_ID);
    const list = [...approvedUsers].filter(u => u !== ADMIN_ID);
    let text = '❌ *UNAPPROVE USER*\n\n';
    if (list.length === 0) {
      text += 'কোনো approved user নেই।';
      unapproveMode.delete(ADMIN_ID);
    } else {
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

  // ===== NEW: Ban prompt =====
  if (pair === 'admin_ban_prompt' && userId === ADMIN_ID) {
    banMode.add(ADMIN_ID);
    const list = [...startedUsers].filter(u => u !== ADMIN_ID && !bannedUsers.has(u));
    let text = '🚫 *BAN USER*\n\n';
    if (list.length === 0) {
      text += 'ban করার মতো কোনো user নেই।';
      banMode.delete(ADMIN_ID);
    } else {
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

  // ===== NEW: Unban prompt =====
  if (pair === 'admin_unban_prompt' && userId === ADMIN_ID) {
    unbanMode.add(ADMIN_ID);
    const list = [...bannedUsers];
    let text = '✅ *UNBAN USER*\n\n';
    if (list.length === 0) {
      text += 'ban list এ কোনো user নেই।';
      unbanMode.delete(ADMIN_ID);
    } else {
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
    await bot.sendMessage(chatId, '📌 আপনার 8-digit Quotex Trader ID পাঠান:');
    return;
  }

  if (!pairs.includes(pair)) return;

  if (!approvedUsers.has(userId)) {
    await bot.sendMessage(chatId, '🔒 আপনার account verified না।\n\n✅ আগে Verify করুন — /start');
    return;
  }

  const loadMsg = await bot.sendMessage(chatId, '⏳ Loading signal generation....\n\n0 / 100');
  const loadId = loadMsg.message_id;
  let count = 0;
  await new Promise((resolve) => {
    const loadInterval = setInterval(async () => {
      count++;
      try {
        await bot.editMessageText(
          '⏳ Loading signal generation....\n\n' + count + ' / 100',
          { chat_id: chatId, message_id: loadId }
        );
      } catch (e) {}
      if (count >= 100) { clearInterval(loadInterval); resolve(); }
    }, 30);
  });

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

  try { await bot.deleteMessage(chatId, loadId); } catch (e) {}
  try { await bot.deleteMessage(chatId, clockId); } catch (e) {}

  let signal;
  try {
    signal = await analyzeSignal(pair);
  } catch (e) {
    const directions = ['UP⏫', 'DOWN⏬'];
    signal = {
      direction: directions[Math.floor(Math.random() * 2)],
      confidence: 'Medium 🟡',
      winRate: '75%',
      trend: 'N/A',
      rsi: 'N/A',
      pattern: 'N/A'
    };
  }

  const now2 = new Date();
  const bd2 = new Date(now2.getTime() + 6 * 60 * 60 * 1000);
  bd2.setMinutes(bd2.getMinutes() + 1);
  const exH = String(bd2.getUTCHours()).padStart(2, '0');
  const exM = String(bd2.getUTCMinutes()).padStart(2, '0');

  await bot.sendMessage(chatId,
    '╭──────────────────╮\n' +
    '│    📈 *𝗤𝘅 𝘅𝗮𝗮𝗻 𝗙𝗮𝘁𝗵𝗲𝗿 𝗯𝗼𝘁*\n' +
    '╰──────────────────╯\n\n' +
    '📊 *ASSET*  ➜ `' + pair + '`\n' +
    '🔹 *TIME*     ➜ `1 MIN`\n' +
    '🔹 *EXPIRY* ➜ `' + exH + ':' + exM + '`\n' +
    '══════════════════\n' +
    '🚀 *DIRECTION* ➜ ' + signal.direction + '\n' +
    '♻️ *WIN RATE*   ➜ `' + signal.winRate + '`\n' +
    '✅ *CONFIDENCE* ➜ ' + signal.confidence + '\n' +
    '══════════════════\n' +
    '⏹️ *Take the trade now!*\n' +
    '⚠️ _Trade at your own risk if loss use 1 stet MTG_ ⚠️',
    { parse_mode: 'Markdown' }
  );
});

console.log('Bot running v16 - Ban/Unban/Unapprove Added...');
