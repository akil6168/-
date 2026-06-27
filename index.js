// v2
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

// Menu দেখাবে
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

// Button ক্লিক করলে
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const pair = query.data;

  // Step 1: Loading 1→100
  const loadMsg = await bot.sendMessage(chatId, '⏳ Loading signal generation....\n\n0 / 100');
  const msgId = loadMsg.message_id;

  let count = 0;
  const loadInterval = setInterval(async () => {
    count++;
    try {
      await bot.editMessageText(
        '⏳ Loading signal generation....\n\n' + count + ' / 100',
        { chat_id: chatId, message_id: msgId }
      );
    } catch (e) {}

    if (count >= 100) {
      clearInterval(loadInterval);

      // Step 2: Real-time UTC+6 clock
      const clockMsg = await bot.sendMessage(chatId, '🕐 Signal generating...');
      const clockId = clockMsg.message_id;

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

        // :58 সেকেন্ডে signal পাঠাবে
        if (bd.getUTCSeconds() === 58) {
          clearInterval(clockInterval);
          const directions = ['UP⏫', 'DOWN⏬'];
          const randomDir = directions[Math.floor(Math.random() * 2)];

          await bot.sendMessage(chatId,
            '😎 FOR ONLY QUOTEX 😀\n\n' +
            '📊 ASSET : ' + pair + ' 📈\n\n' +
            '🕯 TIME : 1 MIN 🕯\n\n' +
            '🚀 DIRECTION: ' + randomDir + '\n\n' +
            '✅ Take the trade now!'
          );
        }
      }, 1000);
    }
  }, 30);

  bot.answerCallbackQuery(query.id);
});

console.log('Bot running...');
