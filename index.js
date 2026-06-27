// v6
const TelegramBot = require('node-telegram-bot-api');
const TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

const ADMIN_ID = 5724602667;
const startedUsers = new Set();
const verifyUsers = new Set();

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
bot.onText(/\/menu/, (msg) => {
  const chatId = msg.chat.id;
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

// Message handler - Trader ID verification
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || 'User';

  if (!text || text.startsWith('/')) return;

  // Verify mode এ আছে কিনা
  if (!verifyUsers.has(userId)) return;

  // 8 digit check
  if (!/^\d{8}$/.test(text)) {
    await bot.sendMessage(chatId, '❌ ভুল Trader ID\n\n📌 সঠিক 8-digit Trader ID পাঠান।');
    return;
  }

  verifyUsers.delete(userId);

  await bot.sendMessage(ADMIN_ID,
    '🔔 *NEW TRADER ID SUBMISSION*\n\n' +
    '👤 Name: ' + firstName + '\n' +
    '🆔 User ID: `' + userId + '`\n' +
    '📌 Trader ID: `' + text + '`',
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

  // Verify button
  if (pair === '/verify') {
    verifyUsers.add(userId);
    await bot.sendMessage(chatId, '📌 আপনার 8-digit Trader ID পাঠান:');
    return;
  }

  if (!pairs.includes(pair)) return;

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

  // Step 3: Delete + Signal
  try { await bot.deleteMessage(chatId, loadId); } catch (e) {}
  try { await bot.deleteMessage(chatId, clockId); } catch (e) {}

  const directions = ['UP⏫', 'DOWN⏬'];
  const randomDir = directions[Math.floor(Math.random() * 2)];
  await bot.sendMessage(chatId,
    '😎 FOR ONLY QUOTEX 😀\n\n' +
    '📊 ASSET : ' + pair + ' 📈\n\n' +
    '🕯 TIME : 1 MIN 🕯\n\n' +
    '🚀 DIRECTION: ' + randomDir + '\n\n' +
    '✅ Take the trade now!'
  );
});

console.log('Bot running...');
