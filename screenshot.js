// screenshot.js - Deep AI Chart Analysis v2
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
  return { h, m, s, bd };
}

function getSecondsUntilNext50() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const currentSeconds = bd.getUTCSeconds();
  if (currentSeconds < 50) {
    return 50 - currentSeconds;
  } else {
    return (60 - currentSeconds) + 50;
  }
}

function getCurrentBDMinuteHour() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return {
    hour: bd.getUTCHours(),
    minute: bd.getUTCMinutes(),
    second: bd.getUTCSeconds()
  };
}

async function analyzeChartWithGemini(imageBase64, mimeType, currentHour, currentMinute, currentSecond) {
  return new Promise((resolve, reject) => {

    // Signal কোন মিনিটে দেওয়া উচিত সেটা Gemini decide করবে
    const nextMinute = currentSecond < 50 ? currentMinute + 1 : currentMinute + 2;
    const nextMinute2 = nextMinute + 1;
    const nextMinute3 = nextMinute + 2;
    const nextMinute5 = nextMinute + 4;

    const formatTime = (h, m) => {
      const nm = m % 60;
      const nh = h + Math.floor(m / 60);
      return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
    };

    const t1 = formatTime(currentHour, nextMinute);
    const t2 = formatTime(currentHour, nextMinute2);
    const t3 = formatTime(currentHour, nextMinute3);
    const t5 = formatTime(currentHour, nextMinute5);

    const prompt = `You are a professional binary options trader with 20 years of experience analyzing OTC charts.

Current BD Time: ${String(currentHour).padStart(2,'0')}:${String(currentMinute).padStart(2,'0')}:${String(currentSecond).padStart(2,'0')}

Analyze this trading chart screenshot with full depth:

1. CANDLESTICK PATTERNS - Last 5 candles behavior, identify: Doji, Hammer, Engulfing, Pin Bar, Marubozu, Star patterns
2. TREND - Overall direction, strength, EMA crossover if visible, Higher Highs/Lows pattern
3. PRICE ACTION - Key levels being tested, Break of structure, rejection candles
4. SUPPORT/RESISTANCE - Key levels, is price at a critical zone?
5. MOMENTUM - Is it increasing or decreasing? Signs of exhaustion?
6. CANDLE BODY/WICK - Body vs wick ratio, rejection wicks, full body momentum candles
7. REVERSAL SIGNALS - Exhaustion, failed breakouts, climax candles

IMPORTANT DECISION:
- Available entry times: ${t1}, ${t2}, ${t3}, or ${t5}
- Choose the BEST entry time where you are MOST CONFIDENT
- If ${t1} candle signal is unclear or risky, choose ${t2}, ${t3}, or ${t5}
- Only give signal when confluence is strong

You MUST reply with ALL 7 lines below, nothing else:
DIRECTION: UP or DOWN
WIN_RATE: 75% or 80% or 85%
CONFIDENCE: Medium or High or Very High
ENTRY: ${t1}
EXPIRY: ${t2}
TREND: write trend here
REASON: write one line reason here`;
    const body = JSON.stringify({
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64
            }
          },
          { text: prompt }
        ]
      }],
      generationConfig: {
  temperature: 0.2,
  maxOutputTokens: 1024
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
          console.log('GEMINI RAW:', text);
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

function parseGeminiResponse(text) {
  const result = {};
  const lines = text.split('\n');
  lines.forEach(line => {
    const trimmed = line.replace(/\*/g, '').replace(/#/g, '').trim();
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('direction:')) {
      const val = trimmed.split(':').slice(1).join(':').trim().toUpperCase();
      result.direction = val.includes('UP') ? 'UP' : val.includes('DOWN') ? 'DOWN' : null;
    }
    if (lower.startsWith('win_rate:') || lower.startsWith('win rate:')) {
      result.winRate = trimmed.split(':').slice(1).join(':').trim();
    }
    if (lower.startsWith('confidence:')) {
      result.confidence = trimmed.split(':').slice(1).join(':').trim();
    }
    if (lower.startsWith('entry:')) {
      result.entry = trimmed.split(':').slice(1).join(':').trim();
    }
    if (lower.startsWith('expiry:')) {
      result.expiry = trimmed.split(':').slice(1).join(':').trim();
    }
    if (lower.startsWith('trend:')) {
      result.trend = trimmed.split(':').slice(1).join(':').trim();
    }
    if (lower.startsWith('reason:')) {
      result.reason = trimmed.split(':').slice(1).join(':').trim();
    }
  });

  // Fallback direction
  if (!result.direction) {
    const upper = text.toUpperCase();
    if (upper.includes('BULLISH') || upper.includes('BUY') || upper.includes(' UP')) {
      result.direction = 'UP';
    } else if (upper.includes('BEARISH') || upper.includes('SELL') || upper.includes(' DOWN')) {
      result.direction = 'DOWN';
    } else {
      result.direction = 'N/A';
    }
  }

  // Fallback reason
  if (!result.reason) {
    result.reason = text.replace(/\n/g, ' ').replace(/\*/g, '').substring(0, 150).trim();
  }

  return result;
}

module.exports = function(bot, db, approvedUsers, bannedUsers) {

  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (bannedUsers.has(userId)) return;

    if (!approvedUsers.has(userId)) {
      await bot.sendMessage(chatId, '🔒 আপনার account verified না।\n\n✅ আগে Verify করুন — /start');
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
    const { hour, minute, second } = getCurrentBDMinuteHour();

    const loadMsg = await bot.sendMessage(chatId,
      '🧠 *AI Deep Analysis শুরু হচ্ছে...*\n\n' +
      '⏰ Signal দেওয়া হবে: *' + waitSeconds + ' seconds* পরে\n\n' +
      '📊 Analyzing: Candlestick + Trend + Price Action\n' +
      'Support/Resistance + Momentum + Volume...',
      { parse_mode: 'Markdown' }
    );

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
          '📈 Support/Resistance • Momentum\n' +
          '🕯️ Body/Wick Ratio • Reversal Signals',
          { chat_id: chatId, message_id: loadMsg.message_id, parse_mode: 'Markdown' }
        );
      } catch (e) {}
      if (remaining <= 0) clearInterval(countdownInterval);
    }, 1000);

    try {
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

      // Gemini analysis background এ চলবে
      const geminiPromise = analyzeChartWithGemini(imageBase64, 'image/jpeg', hour, minute, second);

      // :50 second পর্যন্ত অপেক্ষা
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));

      clearInterval(countdownInterval);

      const geminiResponse = await geminiPromise;
      const signal = parseGeminiResponse(geminiResponse);

      incrementUserCount(userId);
      const remaining2 = DAILY_LIMIT - getUserCount(userId);

      const dirEmoji = signal.direction === 'UP' ? '⏫' : signal.direction === 'DOWN' ? '⏬' : '';

      let confEmoji = '🟡';
      if (signal.confidence && signal.confidence.toLowerCase().includes('high') && !signal.confidence.toLowerCase().includes('very')) confEmoji = '🟢';
      if (signal.confidence && signal.confidence.toLowerCase().includes('very')) confEmoji = '🔥';

      try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

      await bot.sendMessage(chatId,
        '╭──────────────────╮\n' +
        '│  🧠 *AI Deep Chart Analysis*\n' +
        '╰──────────────────╯\n\n' +
        '🚀 *DIRECTION* ➜ ' + (signal.direction || 'N/A') + ' ' + dirEmoji + '\n' +
        '📊 *ENTRY*        ➜ `' + (signal.entry || 'N/A') + '`\n' +
        '⏱ *EXPIRY*      ➜ `' + (signal.expiry || 'N/A') + '`\n' +
        '══════════════════\n' +
        '♻️ *WIN RATE*    ➜ `' + (signal.winRate || '75%') + '`\n' +
        '✅ *CONFIDENCE* ➜ ' + (signal.confidence || 'Medium') + ' ' + confEmoji + '\n' +
        '🔀 *TREND*        ➜ `' + (signal.trend || 'N/A') + '`\n' +
        '══════════════════\n' +
        '💡 _' + (signal.reason || 'AI analysis based signal') + '_\n' +
        '══════════════════\n' +
        '📊 Remaining analysis today: *' + remaining2 + '/' + DAILY_LIMIT + '*\n' +
        '⚠️ _Trade at your own risk_ ⚠️',
        { parse_mode: 'Markdown' }
      );

    } catch (e) {
      clearInterval(countdownInterval);
      try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (err) {}
      await bot.sendMessage(chatId,
        '❌ Analysis failed!\n\n➕ *Generate New Signal 📊* বাটন দিয়ে signal নিন।',
        { parse_mode: 'Markdown' }
      );
    }
  });
};
