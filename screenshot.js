// screenshot.js - Gemini Chart Analysis
const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DAILY_LIMIT = 5;

// User daily usage track
const userScreenshotCount = new Map();

// Bangladesh midnight reset
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

// Gemini API call
async function analyzeChartWithGemini(imageBase64, mimeType) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64
            }
          },
          {
            text: `You are an expert forex/binary options trader. Analyze this trading chart screenshot carefully.

Look at:
- Candlestick patterns (bullish/bearish engulfing, pin bars, doji, hammer)
- Price trend (uptrend, downtrend, sideways)
- Support and resistance levels
- Any visible indicators (RSI, MA, MACD if shown)
- Overall market momentum

Based on your analysis, give a trading signal.

Reply ONLY in this exact format:
DIRECTION: UP or DOWN
WIN_RATE: 75% or 80% or 85%
CONFIDENCE: Medium or High or Very High
PATTERN: (one pattern you detected)
REASON: (one line explanation)`
          }
        ]
      }]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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
          resolve(text);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Parse Gemini response
function parseGeminiResponse(text) {
  const lines = text.split('\n');
  const result = {};
  lines.forEach(line => {
    if (line.startsWith('DIRECTION:')) result.direction = line.split(':')[1].trim();
    if (line.startsWith('WIN_RATE:')) result.winRate = line.split(':')[1].trim();
    if (line.startsWith('CONFIDENCE:')) result.confidence = line.split(':')[1].trim();
    if (line.startsWith('PATTERN:')) result.pattern = line.split(':')[1].trim();
    if (line.startsWith('REASON:')) result.reason = line.split(':')[1].trim();
  });
  return result;
}

module.exports = function(bot, db, approvedUsers, bannedUsers) {

  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Ban check
    if (bannedUsers.has(userId)) return;

    // Approved check
    if (!approvedUsers.has(userId)) {
      await bot.sendMessage(chatId, '🔒 আপনার account verified না।\n\n✅ আগে Verify করুন — /start');
      return;
    }

    // Daily limit check
    const count = getUserCount(userId);
    if (count >= DAILY_LIMIT) {
      await bot.sendMessage(chatId,
        '📊 আজকের chart analysis শেষ!\n\n' +
        '➕ *Generate New Signal 📊* বাটন দিয়ে signal নিন।',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Processing message
    const loadMsg = await bot.sendMessage(chatId,
      '🧠 *AI Chart Analysis চলছে...*\n\n⏳ অপেক্ষা করুন...',
      { parse_mode: 'Markdown' }
    );

    try {
      // Get photo file
      const photos = msg.photo;
      const photo = photos[photos.length - 1]; // সবচেয়ে বড় size
      const file = await bot.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

      // Download image
      const imageData = await new Promise((resolve, reject) => {
        https.get(fileUrl, (res) => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        });
      });

      const imageBase64 = imageData.toString('base64');
      const mimeType = 'image/jpeg';

      // Gemini analysis
      const geminiResponse = await analyzeChartWithGemini(imageBase64, mimeType);
      const signal = parseGeminiResponse(geminiResponse);

      // Increment count
      incrementUserCount(userId);
      const remaining = DAILY_LIMIT - getUserCount(userId);

      // Direction emoji
      const dirEmoji = signal.direction === 'UP' ? '⏫' : '⏬';

      // Confidence emoji
      let confEmoji = '🟡';
      if (signal.confidence === 'High') confEmoji = '🟢';
      if (signal.confidence === 'Very High') confEmoji = '🔥';

      // Delete loading message
      try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

      // Send result
      await bot.sendMessage(chatId,
        '╭──────────────────╮\n' +
        '│  🧠 *AI Chart Analysis*\n' +
        '╰──────────────────╯\n\n' +
        '🚀 *DIRECTION* ➜ ' + signal.direction + ' ' + dirEmoji + '\n' +
        '♻️ *WIN RATE*   ➜ `' + (signal.winRate || '75%') + '`\n' +
        '✅ *CONFIDENCE* ➜ ' + (signal.confidence || 'Medium') + ' ' + confEmoji + '\n' +
        '📊 *PATTERN*    ➜ `' + (signal.pattern || 'N/A') + '`\n' +
        '══════════════════\n' +
        '💡 _' + (signal.reason || 'AI analysis based signal') + '_\n' +
        '══════════════════\n' +
        '⚠️ _Trade at your own risk_ ⚠️',
        { parse_mode: 'Markdown' }
      );

    } catch (e) {
      try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (err) {}
      await bot.sendMessage(chatId,
        '❌ Analysis failed!\n\n➕ *Generate New Signal 📊* বাটন দিয়ে signal নিন।',
        { parse_mode: 'Markdown' }
      );
    }
  });

};
