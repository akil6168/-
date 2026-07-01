// screenshot.js - Deep AI Chart Analysis
const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DAILY_LIMIT = 5;

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

// BD Time
function getBDTime() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const h = String(bd.getUTCHours()).padStart(2, '0');
  const m = String(bd.getUTCMinutes()).padStart(2, '0');
  const s = String(bd.getUTCSeconds()).padStart(2, '0');
  return { h, m, s, bd };
}

// পরের মিনিটের :50 second কত সেকেন্ড বাকি
function getSecondsUntilNext50() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const currentSeconds = bd.getUTCSeconds();

  if (currentSeconds < 50) {
    return 50 - currentSeconds;
  } else {
    // পরের মিনিটের :50
    return (60 - currentSeconds) + 50;
  }
}

// Entry ও Expiry time calculate
function getEntryExpiry() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const currentSeconds = bd.getUTCSeconds();

  let entryMinute, expiryMinute;
  const currentMinute = bd.getUTCMinutes();
  const currentHour = bd.getUTCHours();

  if (currentSeconds < 50) {
    // এই মিনিটের :50 এ signal → পরের মিনিটে entry
    entryMinute = currentMinute + 1;
  } else {
    // পরের মিনিটের :50 এ signal → তার পরের মিনিটে entry
    entryMinute = currentMinute + 2;
  }

  expiryMinute = entryMinute + 1;

  const entryH = String(currentHour + Math.floor(entryMinute / 60)).padStart(2, '0');
  const entryM = String(entryMinute % 60).padStart(2, '0');
  const expiryH = String(currentHour + Math.floor(expiryMinute / 60)).padStart(2, '0');
  const expiryM = String(expiryMinute % 60).padStart(2, '0');

  return {
    entry: entryH + ':' + entryM,
    expiry: expiryH + ':' + expiryM
  };
}

// Gemini Deep Analysis
async function analyzeChartWithGemini(imageBase64, mimeType) {
  return new Promise((resolve, reject) => {
    const prompt = `You are a professional forex and binary options trader with 20 years of experience. Analyze this trading chart screenshot with EXTREME detail and precision.

Perform ALL of the following analyses:

1. CANDLESTICK PATTERNS:
   - Identify: Doji, Hammer, Shooting Star, Engulfing (Bullish/Bearish), Pin Bar, Morning/Evening Star, Harami, Tweezer, Marubozu, Spinning Top, Three White Soldiers, Three Black Crows
   - Note the last 3-5 candles behavior

2. TREND ANALYSIS:
   - Overall trend direction (Uptrend/Downtrend/Sideways)
   - EMA crossover signals if visible
   - Higher Highs/Higher Lows or Lower Highs/Lower Lows pattern
   - Trend strength (Strong/Moderate/Weak)

3. PRICE ACTION:
   - Key price levels being tested
   - Break of structure (BOS)
   - Change of character (CHOCH)
   - Fair Value Gaps if visible
   - Order blocks if visible

4. SUPPORT & RESISTANCE:
   - Identify key support levels
   - Identify key resistance levels
   - Is price at a key level right now?
   - Previous support turned resistance or vice versa

5. MARKET MOMENTUM:
   - Is momentum increasing or decreasing?
   - Momentum divergence if visible
   - Speed of price movement

6. CANDLE BODY/WICK ANALYSIS:
   - Body size vs wick ratio of last candles
   - Long upper/lower wicks indicating rejection
   - Full body candles indicating strong momentum

7. VOLUME REACTION (if visible):
   - High/Low volume on moves
   - Volume confirmation of trend

8. MARKET STRUCTURE:
   - Consolidation zones
   - Breakout or breakdown levels
   - Range boundaries

9. REVERSAL SIGNALS:
   - Exhaustion signs
   - Climax candles
   - Failed breakouts

10. OVERALL CONFLUENCE:
    - How many factors align for UP?
    - How many factors align for DOWN?
    - Which direction has stronger confluence?

Based on ALL above analysis, give your BEST trading signal.

Reply ONLY in this EXACT format (no extra text):
DIRECTION: UP or DOWN
WIN_RATE: 75% or 80% or 85%
CONFIDENCE: Medium or High or Very High
PATTERN: (main pattern detected)
TREND: (trend direction and strength)
KEY_LEVEL: (key price level being tested)
MOMENTUM: (momentum description)
REASON: (2-3 line detailed explanation)
CONFLUENCE: (number of factors supporting the signal out of 10)`;

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
        temperature: 0.1,
        topK: 1,
        topP: 0.8,
        maxOutputTokens: 500
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
  const result = {};
  const lines = text.split('\n');
  lines.forEach(line => {
    const lower = line.toLowerCase();
    if (lower.includes('direction:')) result.direction = line.split(':').slice(1).join(':').trim().toUpperCase().includes('UP') ? 'UP' : 'DOWN';
    if (lower.includes('win_rate:') || lower.includes('win rate:')) result.winRate = line.split(':').slice(1).join(':').trim();
    if (lower.includes('confidence:')) result.confidence = line.split(':').slice(1).join(':').trim();
    if (lower.includes('pattern:')) result.pattern = line.split(':').slice(1).join(':').trim();
    if (lower.includes('trend:')) result.trend = line.split(':').slice(1).join(':').trim();
    if (lower.includes('key_level:') || lower.includes('key level:')) result.keyLevel = line.split(':').slice(1).join(':').trim();
    if (lower.includes('momentum:')) result.momentum = line.split(':').slice(1).join(':').trim();
    if (lower.includes('reason:')) result.reason = line.split(':').slice(1).join(':').trim();
    if (lower.includes('confluence:')) result.confluence = line.split(':').slice(1).join(':').trim();
  });

  // Fallback: raw text থেকে direction বের করো
  if (!result.direction) {
    if (text.toUpperCase().includes('BULLISH') || text.toUpperCase().includes('UP')) {
      result.direction = 'UP';
    } else if (text.toUpperCase().includes('BEARISH') || text.toUpperCase().includes('DOWN')) {
      result.direction = 'DOWN';
    }
  }

  // Raw text save করো reason হিসেবে
  if (!result.reason || result.reason === '') {
    result.reason = text.replace(/\n/g, ' ').substring(0, 200);
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
    if (count >= DAILY_LIMIT) {
      await bot.sendMessage(chatId,
        '📊 আজকের AI analysis শেষ!\n\n' +
        '➕ *Generate New Signal 📊* বাটন দিয়ে signal নিন।',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Entry/Expiry calculate করো আগেই
    const { entry, expiry } = getEntryExpiry();
    const waitSeconds = getSecondsUntilNext50();

    // Loading message
    const loadMsg = await bot.sendMessage(chatId,
      '🧠 *AI Deep Analysis শুরু হচ্ছে...*\n\n' +
      '⏰ Signal দেওয়া হবে: *' + waitSeconds + ' seconds* পরে\n\n' +
      '📊 Analyzing: Candlestick + Trend + Price Action\n' +
      'Support/Resistance + Momentum + Volume...',
      { parse_mode: 'Markdown' }
    );

    // Real-time countdown
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
          '🕯️ Volume • Body/Wick Ratio',
          { chat_id: chatId, message_id: loadMsg.message_id, parse_mode: 'Markdown' }
        );
      } catch (e) {}

      if (remaining <= 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);

    try {
      // Image download
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

      // Gemini analysis (background এ চলবে)
      const geminiPromise = analyzeChartWithGemini(imageBase64, 'image/jpeg');

      // :50 second পর্যন্ত অপেক্ষা
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));

      // Countdown বন্ধ করো
      clearInterval(countdownInterval);

      // Gemini result নাও
      const geminiResponse = await geminiPromise;
      const signal = parseGeminiResponse(geminiResponse);

      // Count বাড়াও
      incrementUserCount(userId);
      const remaining2 = DAILY_LIMIT - getUserCount(userId);

      // Direction emoji
      const dirEmoji = signal.direction === 'UP' ? '⏫' : '⏬';

      // Confidence emoji
      let confEmoji = '🟡';
      if (signal.confidence === 'High') confEmoji = '🟢';
      if (signal.confidence === 'Very High') confEmoji = '🔥';

      // Delete loading message
      try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

      // Signal পাঠাও
      await bot.sendMessage(chatId,
        '╭──────────────────╮\n' +
        '│  🧠 *AI Deep Chart Analysis*\n' +
        '╰──────────────────╯\n\n' +
        '🚀 *DIRECTION* ➜ ' + (signal.direction || 'N/A') + ' ' + dirEmoji + '\n' +
        '📊 *ENTRY*        ➜ `' + entry + '`\n' +
        '⏱ *EXPIRY*      ➜ `' + expiry + '`\n' +
        '══════════════════\n' +
        '♻️ *WIN RATE*    ➜ `' + (signal.winRate || '75%') + '`\n' +
        '✅ *CONFIDENCE* ➜ ' + (signal.confidence || 'Medium') + ' ' + confEmoji + '\n' +
        '📈 *PATTERN*     ➜ `' + (signal.pattern || 'N/A') + '`\n' +
        '🔀 *TREND*        ➜ `' + (signal.trend || 'N/A') + '`\n' +
        '⚡ *MOMENTUM*  ➜ `' + (signal.momentum || 'N/A') + '`\n' +
        '🎯 *KEY LEVEL*  ➜ `' + (signal.keyLevel || 'N/A') + '`\n' +
        '🔗 *CONFLUENCE* ➜ `' + (signal.confluence || 'N/A') + '`\n' +
        '══════════════════\n' +
        '💡 _' + (signal.reason || 'AI analysis based signal') + '_\n' +
        '══════════════════\n' +
        '📊 আজকের বাকি analysis: *' + remaining2 + '/' + DAILY_LIMIT + '*\n' +
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
