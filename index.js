// v4
const TelegramBot = require('node-telegram-bot-api');
const TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

const pairs = [
  'EUR/USD OTC', 'GBP/USD OTC', 'USD/JPY OTC',
  'AUD/USD OTC', 'USD/CAD OTC', 'EUR/GBP OTC',
  'EUR/NZD OTC', 'GBP/NZD OTC', 'USD/PKR OTC',
  'USD/INR OTC', 'USD/BDT OTC', 'USD/IDR OTC',
  'CAD/CHF OTC'
];

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

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const pair = query.data;
  bot.answerCallbackQuery(query.id);

  // Step 1: Loading 1→100
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

  // Step 3: Delete loading & clock, then send signal
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
