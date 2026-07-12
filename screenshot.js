// screenshot.js - Maximum Deep Analysis + Chart Check
const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
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
            text: `STEP 1 - CHART VERIFICATION:
First look at this image carefully. Is this a trading candlestick/price chart (forex or binary options chart with candles, price levels, time axis)?

If this is NOT a trading chart (example: photo, chat screenshot, text image, person, animal, food, or any non-chart image):
Reply with exactly: NOT_A_CHART

If this IS a trading candlestick chart, proceed to STEP 2.

STEP 2 - DEEP ANALYSIS:
You are a world-class professional binary options and forex trader with 20+ years of experience. Analyze this OTC trading chart using EVERY possible technical analysis method available.

CANDLESTICK PATTERN ANALYSIS:
- Identify all patterns in last 10 candles: Doji, Hammer, Inverted Hammer, Shooting Star, Hanging Man, Spinning Top, Marubozu, Bullish Engulfing, Bearish Engulfing, Piercing Line, Dark Cloud Cover, Morning Star, Evening Star, Three White Soldiers, Three Black Crows, Harami, Harami Cross, Tweezer Top/Bottom, Belt Hold, Counterattack, Rising/Falling Three Methods
- Heikin Ashi candle pattern analysis (smoothed trend)
- Body size analysis (large body = strong momentum, small body = indecision)
- Wick/shadow analysis (long wick = rejection, no wick = strong momentum)
- Color sequence of last 5 candles

TREND ANALYSIS:
- Primary trend direction (Uptrend/Downtrend/Sideways)
- Trend strength (Strong/Moderate/Weak)
- Higher Highs Higher Lows (Uptrend confirmation)
- Lower Highs Lower Lows (Downtrend confirmation)
- Trend exhaustion signs
- EMA crossover analysis (EMA 5, 10, 20, 50, 200)
- SMA crossover analysis
- Hull Moving Average (HMA) trend
- ADX (Average Directional Index) trend strength measurement
- Supertrend indicator signal (UP/DOWN)
- Parabolic SAR position (above/below price)
- Ichimoku Cloud analysis (Tenkan, Kijun, Senkou Span A/B, Chikou)

MOMENTUM & OSCILLATOR ANALYSIS:
- RSI (14) overbought/oversold levels
- Stochastic RSI fast overbought/oversold
- Stochastic Oscillator (14,3,3) %K and %D crossover
- MACD histogram, signal line crossover
- CCI (Commodity Channel Index) extreme levels
- Williams %R overbought/oversold
- Momentum Indicator rate of price change
- Awesome Oscillator zero line crossover
- Squeeze Momentum Indicator low volatility breakout detection

VOLATILITY ANALYSIS:
- Bollinger Bands squeeze, expansion, price at bands
- ATR (Average True Range) volatility level
- Keltner Channels price position relative to channels
- Donchian Channels breakout signals

VOLUME ANALYSIS:
- VWAP (Volume Weighted Average Price) price above/below VWAP
- Volume Profile high volume nodes and low volume nodes
- OBV (On Balance Volume) trend confirmation
- MFI (Money Flow Index) volume weighted RSI

KEY LEVELS ANALYSIS:
- Pivot Points (Daily/Weekly) PP, R1, R2, S1, S2
- Fibonacci Retracement levels (0.236, 0.382, 0.5, 0.618, 0.786)
- Fibonacci Extension levels (1.272, 1.618, 2.0)
- Session High/Low (Asian, London, New York sessions)
- Previous Day High/Low as key reference levels
- Major Support and Resistance levels
- Dynamic Support/Resistance (moving averages as S/R)
- S/R Flip signals
- Round number psychological levels

PRICE ACTION & SMART MONEY ANALYSIS:
- Break of Structure (BOS)
- Change of Character (CHOCH)
- Order Blocks (OB) bullish and bearish
- Fair Value Gaps (FVG) imbalance zones
- Liquidity sweeps and stop hunts
- Smart Money Concepts (SMC)
- Wyckoff patterns (Accumulation/Distribution/Markup/Markdown)
- Market Profile price acceptance/rejection zones

MARKET STRUCTURE ANALYSIS:
- Consolidation zones (ranges)
- Breakout or breakdown from range
- Retest of broken levels
- Flag, Pennant, Triangle patterns
- Double Top/Bottom patterns
- Head and Shoulders patterns
- Regular and Hidden Divergence (RSI, MACD)

CONFLUENCE SCORING:
After analyzing ALL factors:
1. Count ALL factors pointing UP
2. Count ALL factors pointing DOWN
3. Calculate confluence percentage
4. Give signal only for direction with overwhelming confluence (70%+ factors agreeing)

Determine WIN_RATE based on confluence:
- 70-75% confluence = WIN_RATE: 75%
- 76-85% confluence = WIN_RATE: 80%
- 86-100% confluence = WIN_RATE: 85%

Determine CONFIDENCE based on confluence:
- 70-75% = Medium
- 76-85% = High
- 86-100% = Very High

Reply ONLY in this exact format, no asterisks, no extra text:
DIRECTION: UP or DOWN
WIN_RATE: 75% or 80% or 85%
CONFIDENCE: Medium or High or Very High
TREND: (trend description in 4 words)
REASON: (2 sentence detailed explanation)`
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
  if (text.trim().toUpperCase().includes('NOT_A_CHART')) {
    return { notAChart: true };
  }

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

module.exports = function(bot, db, approvedUsers, bannedUsers, isApproved, getTrialScreenshotLeft, incrementTrialScreenshot, sendVerifyPrompt, FREE_TRIAL_SCREENSHOT, signalInlineKeyboard, lastSignalMsgId) {

  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (bannedUsers.has(userId)) return;

    if (!isApproved(userId)) {
      if (getTrialScreenshotLeft(userId) <= 0) {
        sendVerifyPrompt(chatId);
        return;
      }
    }

    if (isApproved(userId) && userId !== ADMIN_ID) {
      const count = getUserCount(userId);
      if (count >= 5) {
        // ✅ পরিবর্তিত — Today's AI Screenshot Limit Reached
        await bot.sendMessage(chatId,
          '⚠️ 𝗧𝗼𝗱𝗮𝘆\'𝘀 𝗔𝗜 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁 𝗟𝗶𝗺𝗶𝘁 𝗥𝗲𝗮𝗰𝗵𝗲𝗱!\n\n' +
          '➕ 𝗚𝗲𝗻𝗲𝗿𝗮𝘁𝗲 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹 📊 বাটন ব্যবহার করে নতুন Signal নিন।',
          { parse_mode: 'Markdown' }
        );
        return;
      }
    }

    // আগের signal message delete
    if (lastSignalMsgId.has(userId)) {
      try { await bot.deleteMessage(chatId, lastSignalMsgId.get(userId)); } catch (e) {}
      lastSignalMsgId.delete(userId);
    }

    const { entry, expiry } = getEntryExpiry();
    const waitSeconds = getSecondsUntilNext50();

    // ✅ পরিবর্তিত — প্রাথমিক লোডিং মেসেজ
    const loadMsg = await bot.sendMessage(chatId,
      '🧠 𝗔𝗜 𝗗𝗘𝗘𝗣 𝗠𝗔𝗥𝗞𝗘𝗧 𝗔𝗡𝗔𝗟𝗬𝗦𝗜𝗦\n\n' +
      '⏳ 𝗣𝗿𝗲𝗽𝗮𝗿𝗶𝗻𝗴 𝗔𝗜 𝗦𝗶𝗴𝗻𝗮𝗹...\n' +
      '⏰ 𝗘𝘀𝘁𝗶𝗺𝗮𝘁𝗲𝗱 𝗧𝗶𝗺𝗲: ' + waitSeconds + 's\n\n' +
      '📊 𝗔𝗻𝗮𝗹𝘆𝘇𝗶𝗻𝗴 𝗣𝗿𝗶𝗰𝗲 𝗔𝗰𝘁𝗶𝗼𝗻...\n' +
      '📈 𝗖𝗵𝗲𝗰𝗸𝗶𝗻𝗴 𝗧𝗿𝗲𝗻𝗱 & 𝗠𝗼𝗺𝗲𝗻𝘁𝘂𝗺...\n' +
      '🎯 𝗙𝗶𝗻𝗱𝗶𝗻𝗴 𝗛𝗶𝗴𝗵-𝗣𝗿𝗼𝗯𝗮𝗯𝗶𝗹𝗶𝘁𝘆 𝗦𝗲𝘁𝘂𝗽...',
      { parse_mode: 'Markdown' }
    );

    let remaining = waitSeconds;
    const countdownInterval = setInterval(async () => {
      remaining--;
      const { h, m, s } = getBDTime();
      // ✅ পরিবর্তিত — countdown মেসেজ
      try {
        await bot.editMessageText(
          '🧠 𝗔𝗜 𝗗𝗘𝗘𝗣 𝗠𝗔𝗥𝗞𝗘𝗧 𝗔𝗡𝗔𝗟𝗬𝗦𝗜𝗦\n\n' +
          '⏰ 𝗕𝗗 𝗧𝗶𝗺𝗲: ' + h + ':' + m + ':' + s + '\n' +
          '⏳ 𝗦𝗶𝗴𝗻𝗮𝗹 𝗜𝗻: ' + remaining + 's\n\n' +
          '📊 𝗔𝗻𝗮𝗹𝘆𝘇𝗶𝗻𝗴 𝗣𝗿𝗶𝗰𝗲 𝗔𝗰𝘁𝗶𝗼𝗻...\n' +
          '📈 𝗖𝗵𝗲𝗰𝗸𝗶𝗻𝗴 𝗧𝗿𝗲𝗻𝗱 & 𝗠𝗼𝗺𝗲𝗻𝘁𝘂𝗺...\n' +
          '🎯 𝗙𝗶𝗻𝗱𝗶𝗻𝗴 𝗛𝗶𝗴𝗵-𝗣𝗿𝗼𝗯𝗮𝗯𝗶𝗹𝗶𝘁𝘆 𝗦𝗲𝘁𝘂𝗽...',
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
      const geminiPromise = analyzeChartWithGemini(imageBase64);

      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      clearInterval(countdownInterval);

      const geminiResponse = await geminiPromise;
      const signal = parseGeminiResponse(geminiResponse);

      if (signal.notAChart) {
        try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
        // ✅ পরিবর্তিত — Invalid Chart
        await bot.sendMessage(chatId,
          '⚠️ 𝗜𝗻𝘃𝗮𝗹𝗶𝗱 𝗖𝗵𝗮𝗿𝘁!\n\n' +
          '📸 𝗣𝗹𝗲𝗮𝘀𝗲 𝘂𝗽𝗹𝗼𝗮𝗱 𝗮 𝗰𝗹𝗲𝗮𝗿 𝗤𝘂𝗼𝘁𝗲𝘅 𝗖𝗵𝗮𝗿𝘁 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      if (isApproved(userId)) {
        incrementUserCount(userId);
      } else {
        await incrementTrialScreenshot(userId);
        const left = getTrialScreenshotLeft(userId);
        if (left === 0) {
          // ✅ পরিবর্তিত — Last Free Trial Screenshot
          await bot.sendMessage(chatId,
            '⚠️ 𝗟𝗮𝘀𝘁 𝗙𝗿𝗲𝗲 𝗧𝗿𝗶𝗮𝗹 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁!\n\n' +
            '🔓 𝗩𝗲𝗿𝗶𝗳𝘆 𝘆𝗼𝘂𝗿 𝗮𝗰𝗰𝗼𝘂𝗻𝘁 𝘁𝗼 𝘂𝗻𝗹𝗼𝗰𝗸 𝗨𝗻𝗹𝗶𝗺𝗶𝘁𝗲𝗱 𝗔𝗰𝗰𝗲𝘀𝘀.',
            { parse_mode: 'Markdown' }
          );
        }
      }

      const remainingCount = userId === ADMIN_ID
        ? '∞'
        : isApproved(userId)
          ? String(5 - getUserCount(userId))
          : String(getTrialScreenshotLeft(userId));

      const dirLabel = signal.direction === 'UP' ? '🟢 BUY' : '🔴 SELL';
      const dirEmoji = signal.direction === 'UP' ? '⏫' : '⏬';
      let confEmoji = '🟡';
      const confLower = (signal.confidence || '').toLowerCase();
      if (confLower.includes('very')) confEmoji = '🔥';
      else if (confLower.includes('high')) confEmoji = '🟢';

      try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

      // ✅ পরিবর্তিত — চূড়ান্ত সিগন্যাল রেজাল্ট মেসেজ
      const sentMsg = await bot.sendMessage(chatId,
        '╔════════════════════╗\n' +
        '🧠 𝗔𝗜 𝗖𝗛𝗔𝗥𝗧 𝗔𝗡𝗔𝗟𝗬𝗦𝗜𝗦\n' +
        '╚════════════════════╝\n\n' +
        '📈 𝗗𝗜𝗥𝗘𝗖𝗧𝗜𝗢𝗡 ➜ ' + dirLabel + ' ' + dirEmoji + '\n' +
        '🕒 𝗘𝗡𝗧𝗥𝗬     ➜ ' + entry + '\n' +
        '⏳ 𝗘𝗫𝗣𝗜𝗥𝗬    ➜ ' + expiry + '\n\n' +
        '━━━━━━━━━━━━━━━━\n\n' +
        '🎯 𝗖𝗢𝗡𝗙𝗜𝗗𝗘𝗡𝗖𝗘 ➜ ' + signal.confidence + ' ' + confEmoji + ' (' + signal.winRate + ')\n' +
        '📊 𝗧𝗥𝗘𝗡𝗗 ➜ ' + signal.trend + '\n\n' +
        '💡 𝗔𝗜 𝗩𝗜𝗘𝗪\n' +
        signal.reason + '\n\n' +
        '━━━━━━━━━━━━━━━━\n\n' +
        '📸 𝗦𝗰𝗿𝗲𝗲𝗻𝘀𝗵𝗼𝘁𝘀 𝗟𝗲𝗳𝘁: *' + remainingCount + '/5*\n\n' +
        '⚠️ 𝗠𝗮𝘅 𝟭 𝗦𝘁𝗲𝗽 𝗠𝗧𝗚',
        {
          parse_mode: 'Markdown',
          reply_markup: signalInlineKeyboard
        }
      );

      // screenshot signal message id save
      lastSignalMsgId.set(userId, sentMsg.message_id);

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
