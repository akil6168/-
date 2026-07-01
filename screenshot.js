// screenshot.js - Final Fixed Version
const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DAILY_LIMIT = 5;
const ADMIN_ID = 5724602667;

const userScreenshotCount = new Map();

function getBDDateKey() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return bd.toISOString().split('T')[0];
}

function getUserCount(userId) {
  const key = userId + '_' + getBDDateKey();
  return userScreenshotCount.get(key) || 0;
}

function incrementUserCount(userId) {
  const key = userId + '_' + getBDDateKey();
  const current = userScreenshotCount.get(key) || 0;
  userScreenshotCount.set(key, current + 1);
}

function getBDTime() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const h = String(bd.getUTCHours()).padStart(2, '0');
  const m = String(bd.getUTCMinutes()).padStart(2, '0');
  const s = String(bd.getUTCSeconds()).padStart(2, '0');
  return { h, m, s };
}

function getSecondsUntilNext50() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const s = bd.getUTCSeconds();
  return s < 50 ? 50 - s : (60 - s) + 50;
}

function getCurrentBDTime() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return {
    hour: bd.getUTCHours(),
    minute: bd.getUTCMinutes(),
    second: bd.getUTCSeconds()
  };
}

function formatTime(h, m) {
  const nm = m % 60;
  const nh = h + Math.floor(m / 60);
  return String(nh % 24).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
}

async function analyzeChartWithGemini(imageBase64, hour, minute, second) {
  const nextMinute = second < 50 ? minute + 1 : minute + 2;
  const t1 = formatTime(hour, nextMinute);
  const t2 = formatTime(hour, nextMinute + 1);
  const t3 = formatTime(hour, nextMinute + 2);
  const t5 = formatTime(hour, nextMinute + 4);

  const prompt = `You are a professional binary options trader. Analyze this OTC chart screenshot carefully.

Current BD Time: ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:${String(second).padStart(2,'0')}

Analyze these factors:
1. Last 5 candlestick patterns (Doji, Hammer, Engulfing, Pin Bar)
2. Overall trend direction and strength
3. Price action and key levels
4. Support and resistance zones
5. Momentum and reversal signals
6. Candle body vs wick ratio

Available entry times: ${t1}, ${t2}, ${t3}, ${t5}
Choose the BEST entry where signal is STRONGEST.

IMPORTANT: You MUST write exactly these 7 lines and nothing else:
DIRECTION: UP or DOWN
WIN_RATE: 75% or 80% or 85%
CONFIDENCE: Medium or High or Very High
ENTRY: chosen time
EXPIRY: one minute after entry
TREND: describe trend in 3 words
REASON: one sentence explanation`;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 512
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json.candidates[0].content.parts[0].text;
          console.log('GEMINI RAW:\n' + text);
          resolve(text);
        } catch (e) {
          console.log('GEMINI PARSE ERROR:', e.message);
          console.log('RAW DATA:', data);
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parseGeminiResponse(text) {
  const result = {
    direction: null,
    winRate: '75%',
    confidence: 'Medium',
    entry: null,
    expiry: null,
    trend: 'N/A',
    reason: 'AI analysis based signal'
  };

  const lines = text.split('\n');
  for (const line of lines) {
    const clean = line.replace(/\*/g, '').replace(/#/g, '').trim();
    const lower = clean.toLowerCase();

    if (lower.startsWith('direction:')) {
      const val = clean.substring(clean.indexOf(':') + 1).trim().toUpperCase();
      if (val.includes('UP')) result.direction = 'UP';
      else if (val.includes('DOWN')) result.direction = 'DOWN';
    }
    else if (lower.startsWith('win_rate:') || lower.startsWith('win rate:')) {
      result.winRate = clean.substring(clean.indexOf(':') + 1).trim();
    }
    else if (lower.startsWith('confidence:')) {
      result.confidence = clean.substring(clean.indexOf(':') + 1).trim();
    }
    else if (lower.startsWith('entry:')) {
      result.entry = clean.substring(clean.indexOf(':') + 1).trim();
    }
    else if (lower.startsWith('expiry:')) {
      result.expiry = clean.substring(clean.indexOf(':') + 1).trim();
    }
    else if (lower.startsWith('trend:')) {
      result.trend = clean.substring(clean.indexOf(':') + 1).trim();
    }
    else if (lower.startsWith('reason:')) {
      result.reason = clean.substring(clean.indexOf(':') + 1).trim();
    }
  }

  // Direction fallback
  if (!result.direction) {
    const upper = text.toUpperCase();
    if (upper.includes('BULLISH') || upper.includes(' UP ') || upper.includes('BUY')) {
      result.direction = 'UP';
    } else if (upper.includes('BEARISH') || upper.includes(' DOWN ') || upper.includes('SELL')) {
      result.direction = 'DOWN';
    } else {
      result.direction = 'UP'; // default
    }
  }

  return result;
}

module.exports = function(bot, db, approvedUsers, bannedUsers) {

  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (bannedUsers.has(userId)) return;

    if (!approvedUsers.has(userId)) {
      await bot.sendMessage(chatId,
        '🔒 আপনার account verified না।\n\n✅ আগে Verify করুন — /start'
      );
      return;
    }

    const count = getUserCount(userId);
    if (count >= DAILY_LIMIT && userId !== ADMIN_ID) {
      await bot.sendMessage(chatId,
        '📊 আজকের AI Screenshot analysis লিমিট শেষ!\n\n' +
        '➕ *Generate New Signal 📊* বাটন দিয়ে signal নিন।',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const waitSeconds = getSecondsUntilNext50();
    const { hour, minute, second } = getCurrentBDTime();

    // Loading message
    const loadMsg = await bot.sendMessage(chatId,
      '🧠 *AI Deep Analysis শুরু হচ্ছে...*\n\n' +
      '⏰ Signal দেওয়া হবে: *' + waitSeconds + ' seconds* পরে\n\n' +
      '🔍 Candlestick • Trend • Price Action\n' +
      '📈 Support/Resistance • Momentum',
      { parse_mode: 'Markdown' }
    );

    // Countdown
    let remaining = waitSeconds;
    const countdownInterval = setInterval(async () => {
      remaining--;
      const { h, m, s } = getBDTime();
      try {
        await bot.editMessageText(
          '🧠 *AI Deep Chart Analysis*\n\n' +
          '⏰ BD Time: *' + h + ':' + m + ':' + s + '*\n' +
          '⏳ Signal আসছে: *' + remaining + ' seconds* পরে\n\n' +
          '🔍 Analyzing deeply...\n' +
          '📊 Candlestick • Trend • Price Action\n' +
          '📈 Support/Resistance • Momentum',
          { chat_id: chatId, message_id: loadMsg.message_id, parse_mode: 'Markdown' }
        );
      } catch (e) {}
      if (remaining <= 0) clearInterval(countdownInterval);
    }, 1000);

    try {
      // Download image
      const photos = msg.photo;
      const photo = photos[photos.length - 1];
      const file = await bot.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

      const imageData = await new Promise((resolve, reject) => {
        https.get(fileUrl, (res) => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        });
      });

      const imageBase64 = imageData.toString('base64');

      // Gemini background এ চলবে
      const geminiPromise = analyzeChartWithGemini(imageBase64, hour, minute, second);

      // :50 পর্যন্ত অপেক্ষা
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      clearInterval(countdownInterval);

      // Result নাও
      const geminiResponse = await geminiPromise;
      const signal = parseGeminiResponse(geminiResponse);

      incrementUserCount(userId);
      const remainingCount = DAILY_LIMIT - getUserCount(userId);

      const dirEmoji = signal.direction === 'UP' ? '⏫' : '⏬';
      let confEmoji = '🟡';
      const confLower = (signal.confidence || '').toLowerCase();
      if (confLower.includes('very')) confEmoji = '🔥';
      else if (confLower.includes('high')) confEmoji = '🟢';

      try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

      await bot.sendMessage(chatId,
        '╭──────────────────╮\n' +
        '│  🧠 *AI Deep Chart Analysis*\n' +
        '╰──────────────────╯\n\n' +
        '🚀 *DIRECTION* ➜ ' + signal.direction + ' ' + dirEmoji + '\n' +
        '📊 *ENTRY*        ➜ `' + (signal.entry || 'N/A') + '`\n' +
        '⏱ *EXPIRY*      ➜ `' + (signal.expiry || 'N/A') + '`\n' +
        '══════════════════\n' +
        '♻️ *WIN RATE*    ➜ `' + signal.winRate + '`\n' +
        '✅ *CONFIDENCE* ➜ ' + signal.confidence + ' ' + confEmoji + '\n' +
        '🔀 *TREND*        ➜ `' + signal.trend + '`\n' +
        '══════════════════\n' +
        '💡 _' + signal.reason + '_\n' +
        '══════════════════\n' +
        '📊 Remaining analysis today: *' + remainingCount + '/' + DAILY_LIMIT + '*\n' +
        '⚠️ _Trade at your own risk_ ⚠️',
        { parse_mode: 'Markdown' }
      );

    } catch (e) {
      clearInterval(countdownInterval);
      console.log('SCREENSHOT ERROR:', e.message);
      try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (err) {}
      await bot.sendMessage(chatId,
        '❌ Analysis failed!\n\n➕ *Generate New Signal 📊* বাটন দিয়ে signal নিন।',
        { parse_mode: 'Markdown' }
      );
    }
  });
};
