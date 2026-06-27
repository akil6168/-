// v8
const TelegramBot = require('node-telegram-bot-api');
const TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

const ADMIN_ID = 5724602667;
const startedUsers = new Set();
const verifyMode = new Set();
const passwordMode = new Map();
const approvedUsers = new Set();

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
    '📌 Send your 8-digit Trader ID for verification.\n\n' +
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

// Admin: /approve [user_id] [password]
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

  // Password check
  if (passwordMode.has(userId)) {
    const correctPass = passwordMode.get(userId);
    if (text === correctPass) {
      passwordMode.delete(userId);
      approvedUsers.add(userId);
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

  // Verify mode
  if (!verifyMode.has(userId)) return;

  if (!/^\d{8}$/.test(text)) {
    await bot.sendMessage(chatId, '❌ ভুল Trader ID\n\n📌 সঠিক 8-digit Trader ID পাঠান।');
    return;
  }

  verifyMode.delete(userId);

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

  if (pair === '/verify') {
    verifyMode.add(userId);
    await bot.sendMessage(chatId, '📌 আপনার 8-digit Trader ID পাঠান:');
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
      if (count >= 100) {
        clearInterval(loadInterval);
        resolve();
      }
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

      if (bd.getUTCSeconds() === 58) {
        clearInterval(clockInterval);
        resolve();
      }
    }, 1000);
  });

  // Step 3: Delete loading & clock
  try { await bot.deleteMessage(chatId, loadId); } catch (e) {}
  try { await bot.deleteMessage(chatId, clockId); } catch (e) {}

  // Step 4: Premium Signal
  const directions = ['UP⏫', 'DOWN⏬'];
  const randomDir = directions[Math.floor(Math.random() * 2)];

  const winRates = ['75%', '78%', '80%', '82%', '85%'];
  const confidences = ['Medium 🟡', 'High 🟢', 'Very High 🔥'];
  const patterns = ['Doji Reversal', 'Bullish Engulfing', 'Bearish Engulfing', 'Hammer', 'Shooting Star', 'Morning Star', 'Evening Star'];

  const isUp = randomDir === 'UP⏫';
  const trend = isUp ? 'Uptrend 📈' : 'Downtrend 📉';
  const trendEmoji = isUp ? '📈' : '📉';

  const winRate = winRates[Math.floor(Math.random() * winRates.length)];
  const confidence = confidences[Math.floor(Math.random() * confidences.length)];
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];

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
    '♻️ *PATTERN*    ➜ `' + pattern + '`\n' +
    trendEmoji + ' *TREND*        ➜ ' + trend + '\n' +
    '══════════════════\n' +
    '✅ *WIN RATE* » `' + winRate + '`\n' +
    '✅ *CONFIDENCE* » ' + confidence + '\n' +
    '══════════════════\n' +
    '⏹️ *Take the trade now!*\n' +
    '⚠️ _Trade at your own risk_',
    { parse_mode: 'Markdown' }
  );
});

console.log('Bot running...');
