// screenshot.js - Maximum Deep Analysis
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

function getEntryExpiry() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const s = bd.getUTCSeconds();
  const h = bd.getUTCHours();
  const m = bd.getUTCMinutes();

  const entryMinute = s < 50 ? m + 1 : m + 2;
  const expiryMinute = entryMinute + 1;

  const entryH = String(h + Math.floor(entryMinute / 60)).padStart(2, '0');
  const entryM = String(entryMinute % 60).padStart(2, '0');
  const expiryH = String(h + Math.floor(expiryMinute / 60)).padStart(2, '0');
  const expiryM = String(expiryMinute % 60).padStart(2, '0');

  return {
    entry: entryH + ':' + entryM,
    expiry: expiryH + ':' + expiryM
  };
}

async function analyzeChartWithGemini(imageBase64) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: imageBase64
            }
          },
          {
            text: `You are a world-class professional binary options and forex trader with 20+ years of experience. Analyze this OTC trading chart screenshot using EVERY possible technical analysis method available.

Perform ALL of the following analyses without exception:

CANDLESTICK ANALYSIS:
- Identify all patterns in last 10 candles: Doji, Hammer, Inverted Hammer, Shooting Star, Hanging Man, Spinning Top, Marubozu, Bullish/Bearish Engulfing, Piercing Line, Dark Cloud Cover, Morning Star, Evening Star, Three White Soldiers, Three Black Crows, Harami, Harami Cross, Tweezer Top/Bottom, Belt Hold, Counterattack, Rising/Falling Three Methods
- Body size analysis (large body = strong momentum, small body = indecision)
- Wick/shadow analysis (long wick = rejection, no wick = strong momentum)
- Color sequence of last 5 candles

TREND ANALYSIS:
- Primary trend direction (Uptrend/Downtrend/Sideways)
- Trend strength (Strong/Moderate/Weak)
- Higher Highs Higher Lows (Uptrend confirmation)
- Lower Highs Lower Lows (Downtrend confirmation)
- Trend exhaustion signs
- EMA/MA crossover if visible
- Trend acceleration or deceleration

PRICE ACTION ANALYSIS:
- Break of Structure (BOS)
- Change of Character (CHOCH)
- Order Blocks (OB)
- Fair Value Gaps (FVG)
- Imbalance zones
- Liquidity sweeps
- Stop hunt patterns
- Smart Money Concepts (SMC)
- Wyckoff patterns (Accumulation/Distribution/Markup/Markdown)

SUPPORT & RESISTANCE:
- Major support levels
- Major resistance levels
- Dynamic support/resistance (moving averages if visible)
- Previous highs and lows as S/R
- Round number levels
- Is price at a key zone right now?
- S/R flip (previous support become resistance or vice versa)

MOMENTUM ANALYSIS:
- Is momentum increasing or decreasing?
- Momentum divergence signals
- Price velocity (speed of movement)
- Exhaustion candles
- Climax buying/selling signs
- Volume-price relationship if visible

MARKET STRUCTURE:
- Consolidation zones (ranges)
- Breakout or breakdown from range
- Retest of broken levels
- Flag, Pennant, Triangle patterns if visible
- Double Top/Bottom patterns
- Head and Shoulders patterns
- Cup and Handle if visible

REVERSAL SIGNALS:
- Overextension from mean
- Divergence patterns
- Failed breakout signals
- Pin bar reversals at key levels
- Inside bar breakouts
- Key level rejection candles

VOLUME ANALYSIS (if visible):
- High volume on breakouts (confirms move)
- Low volume on retracements (healthy pullback)
- Volume climax (reversal signal)
- Volume divergence

FIBONACCI ANALYSIS (if levels visible):
- Price at key Fibonacci retracement (0.382, 0.5, 0.618)
- Fibonacci extension targets

MULTI-TIMEFRAME CONFLUENCE:
- What does the overall chart structure suggest?
- Are multiple factors aligning for same direction?

After analyzing ALL factors above, determine:
1. How many factors point UP?
2. How many factors point DOWN?
3. Which direction has overwhelming confluence?

Give your FINAL signal based on maximum confluence.

Reply ONLY in this exact format, no asterisks, no extra text:
DIRECTION: UP or DOWN
WIN_RATE: 75% or 80% or 85%
CONFIDENCE: Medium or High or Very High
TREND: (trend description in 4 words)
REASON: (2 sentence detailed explanation of why)`
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
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
          console.log('GEMINI RAW:\n' + text);
          resolve(text);
        } catch (e) {
          console.log('PARSE ERROR:', e.message);
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
    trend: 'N/A',
    reason: 'AI analysis based signal'
  };

  const lines = text.split('\n');
  for (const line of lines) {
    const clean = line.replace(/\*/g, '').replace(/#/g, '').trim();
    const lower = clean.toLowerCase();

    if (lower.startsWith('direction:')) {
      const val = clean.substring(clean.indexOf(':') + 1).trim().toUpperCase();
      result.direction = val.includes('UP') ? 'UP' : val.includes('DOWN') ? 'DOWN' : null;
    }
    else if (lower.startsWith('win_rate:') || lower.startsWith('win rate:')) {
      result.winRate = clean.substring(clean.indexOf(':') + 1).trim();
    }
    else if (lower.startsWith('confidence:')) {
      result.confidence = clean.substring(clean.indexOf(':') + 1).trim();
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
    if (upper.includes('BULLISH') || upper.includes('BUY') || upper.includes('UPWARD')) {
      result.direction = 'UP';
    } else if (upper.includes('BEARISH') || upper.includes('SELL') || upper.includes('DOWNWARD')) {
      result.direction = 'DOWN';
    } else {
      result.direction = 'UP';
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

    const { entry, expiry } = getEntryExpiry();
    const waitSeconds = getSecondsUntilNext50();

    const loadMsg = await bot.sendMessage(chatId,
      '🧠 *AI Deep Analysis শুরু হচ্ছে...*\n\n' +
      '⏰ Signal দেওয়া হবে: *' + waitSeconds + ' seconds* পরে\n\n' +
      '🔍 Candlestick • Trend • Price Action\n' +
      '📈 Support/Resistance • Momentum • SMC',
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
          '🔍 Analyzing with ALL methods...\n' +
          '📊 Candlestick • Trend • SMC • Wyckoff\n' +
          '📈 S/R • Momentum • Price Action • Fibonacci',
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

      // Gemini background এ চলবে
      const geminiPromise = analyzeChartWithGemini(imageBase64);

      // :50 পর্যন্ত অপেক্ষা
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      clearInterval(countdownInterval);

      const geminiResponse = await geminiPromise;
      const signal = parseGeminiResponse(geminiResponse);

      incrementUserCount(userId);
      const remainingCount = userId === ADMIN_ID ? '∞' : String(DAILY_LIMIT - getUserCount(userId));

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
        '📊 *ENTRY*        ➜ `' + entry + '`\n' +
        '⏱ *EXPIRY*      ➜ `' + expiry + '`\n' +
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
      console.log('ERROR:', e.message);
      try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (err) {}
      await bot.sendMessage(chatId,
        '❌ Analysis failed!\n\n➕ *Generate New Signal 📊* বাটন দিয়ে signal নিন।',
        { parse_mode: 'Markdown' }
      );
    }
  });
};
