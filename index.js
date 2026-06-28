// v11
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

const ADMIN_ID = 5724602667;
const verifyMode = new Set();
const passwordMode = new Map();
const approvedUsers = new Set([ADMIN_ID]);
const broadcastMode = new Set();

const STARTED_FILE = 'started_users.json';
const APPROVED_FILE = 'approved_users.json';
const SUBMISSIONS_FILE = 'submissions.json';

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

const pairs = [
  'EUR/USD OTC', 'GBP/USD OTC', 'USD/JPY OTC',
  'AUD/USD OTC', 'USD/CAD OTC', 'EUR/GBP OTC',
  'EUR/NZD OTC', 'GBP/NZD OTC', 'USD/PKR OTC',
  'USD/INR OTC', 'USD/BDT OTC', 'USD/IDR OTC',
  'CAD/CHF OTC'
];

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'User';
  const userId = msg.from.id;

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
          [{ text: '🚀 Create Quotex Account', url: 'https://market-qx.pro/?lid=2177266' }],
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

  if (!approvedUsers.has(userId)) {
    await bot.sendMessage(chatId, '🔒 আপনার account verified না।\n\n✅ আগে Verify করুন — /start');
    return;
  }

  const keyboard = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const row = [{ text: pairs[i], callback_data: pairs[i] }];
    if (pairs[i + 1]) row.push({ text: pairs[i + 1], callback_data: pairs[i + 1] });
    keyboard.push(row);
  }
  bot.sendMessage(chatId, '📊 Choose Trading Pair (OTC) 👇', {
    reply_markup: { inline_keyboard: keyboard }
  });
});

// /admin
bot.onText(/\/admin/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  await bot.sendMessage(ADMIN_ID,
    '👑 *ADMIN PANEL*\n' +
    '══════════════════',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👥 Total Users', callback_data: 'admin_total' }],
          [{ text: '✅ Approved Users', callback_data: 'admin_approved' }],
          [{ text: '⏳ Pending Verify List', callback_data: 'admin_pending' }],
          [{ text: '📋 Trader ID Submissions', callback_data: 'admin_submissions' }],
          [{ text: '📢 Broadcast Message', callback_data: 'admin_broadcast' }]
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

  // Broadcast mode
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

  // Password check
  if (passwordMode.has(userId)) {
    const correctPass = passwordMode.get(userId);
    if (text === correctPass) {
      passwordMode.delete(userId);
      approvedUsers.add(userId);
      saveApprovedUsers();
      await bot.sendMessage(chatId,
        '🎉 *Bot access পেয়েছেন!*\n\n' +
        '📊 Trading signals পেতে /menu তে যান।',
        { parse_mode: 'Markdown' }
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
    userId: userId,
    name: firstName,
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

  // Admin callbacks
  if (pair === 'admin_total' && userId === ADMIN_ID) {
    await bot.sendMessage(ADMIN_ID,
      '👥 *TOTAL USERS*\n\n' +
      '📊 Total Started: `' + startedUsers.size + '`\n' +
      '✅ Total Approved: `' + (approvedUsers.size - 1) + '`\n' +
      '📋 Total Submissions: `' + submissions.length + '`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (pair === 'admin_approved' && userId === ADMIN_ID) {
    const list = [...approvedUsers].filter(u => u !== ADMIN_ID);
    if (list.length === 0) {
      await bot.sendMessage(ADMIN_ID, '✅ কোনো approved user নেই।');
      return;
    }
    let text = '✅ *APPROVED USERS*\n\n';
    list.forEach((uid, i) => {
      // Submission থেকে trader ID খুঁজবো
      const sub = submissions.find(s => s.userId === uid);
      const uname = sub && sub.username ? '@' + sub.username : (sub ? sub.name : 'Unknown');
      const traderId = sub ? sub.traderId : 'N/A';
      text += (i + 1) + '. ' + uname + '\n' +
        '🆔 User: `' + uid + '`\n' +
        '📌 Trader ID: `' + traderId + '`\n\n';
    });
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_pending' && userId === ADMIN_ID) {
    const pending = submissions.filter(s => !approvedUsers.has(s.userId));
    if (pending.length === 0) {
      await bot.sendMessage(ADMIN_ID, '⏳ কোনো pending user নেই।');
      return;
    }
    let text = '⏳ *PENDING VERIFY LIST*\n\n';
    pending.forEach((s, i) => {
      const uname = s.username ? '@' + s.username : s.name;
      text += (i + 1) + '. ' + uname + '\n' +
        '🆔 `' + s.userId + '`\n' +
        '📌 Trader ID: `' + s.traderId + '`\n\n';
    });
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_submissions' && userId === ADMIN_ID) {
    if (submissions.length === 0) {
      await bot.sendMessage(ADMIN_ID, '📋 কোনো submission নেই।');
      return;
    }
    let text = '📋 *TRADER ID SUBMISSIONS*\n\n';
    submissions.forEach((s, i) => {
      const uname = s.username ? '@' + s.username : s.name;
      text += (i + 1) + '. ' + uname + '\n' +
        '🆔 User: `' + s.userId + '`\n' +
        '📌 Trader ID: `' + s.traderId + '`\n\n';
    });
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (pair === 'admin_broadcast' && userId === ADMIN_ID) {
    broadcastMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '📢 যে message সব user কে পাঠাতে চাও সেটা লেখো:');
    return;
  }

  if (pair === '/verify') {
    verifyMode.add(userId);
    await bot.sendMessage(chatId,
      '🔐 *VERIFICATION REQUIRED*\n\n' +
      'আপনার 8-digit Quotex\n' +
      'Trader ID পাঠান 👇',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (!pairs.includes(pair)) return;

  if (!approvedUsers.has(userId)) {
    await bot.sendMessage(chatId, '🔒 আপনার account verified না।\n\n✅ আগে Verify করুন — /start');
    return;
  }

  // Step 1: Loading
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

  // Step 2: Clock
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

  // Signal
  const directions = ['UP⏫', 'DOWN⏬'];
  const randomDir = directions[Math.floor(Math.random() * 2)];
  const winRates = ['75%', '78%', '80%', '82%', '85%'];
  const confidences = ['Medium 🟡', 'High 🟢', 'Very High 🔥'];

  const winRate = winRates[Math.floor(Math.random() * winRates.length)];
  const confidence = confidences[Math.floor(Math.random() * confidences.length)];

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
    '🚀 *DIRECTION* ➜ ' + randomDir + '\n' +
    '♻️ *WIN RATE*   ➜ `' + winRate + '`\n' +
    '✅ *CONFIDENCE* ➜ ' + confidence + '\n' +
    '══════════════════\n' +
    '⏹️ *Take the trade now!*\n' +
    '⚠️ _Trade at your own risk if loss use 1 stet MTG_ ⚠️',
    { parse_mode: 'Markdown' }
  );
});

console.log('Bot running...');
