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
        await bot.sendMessage(chatId,
          'ðŸ“Š à¦†à¦œà¦•à§‡à¦° AI Screenshot analysis à¦²à¦¿à¦®à¦¿à¦Ÿ à¦¶à§‡à¦·!\n\nâž• *Generate New Signal ðŸ“Š* à¦¬à¦¾à¦Ÿà¦¨ à¦¦à¦¿à¦¯à¦¼à§‡ signal à¦¨à¦¿à¦¨à¥¤',
          { parse_mode: 'Markdown' }
        );
        return;
      }
    }

    // à¦†à¦—à§‡à¦° signal message delete
    if (lastSignalMsgId.has(userId)) {
      try { await bot.deleteMessage(chatId, lastSignalMsgId.get(userId)); } catch (e) {}
      lastSignalMsgId.delete(userId);
    }

    const { entry, expiry } = getEntryExpiry();
    const waitSeconds = getSecondsUntilNext50();

    const loadMsg = await bot.sendMessage(chatId,
      'ðŸ§  *AI Deep Analysis à¦¶à§à¦°à§ à¦¹à¦šà§à¦›à§‡...*\n\n' +
      'â° Signal à¦¦à§‡à¦“à¦¯à¦¼à¦¾ à¦¹à¦¬à§‡: *' + waitSeconds + ' seconds* à¦ªà¦°à§‡\n\n' +
      'ðŸ” Candlestick â€¢ Trend â€¢ Price Action\n' +
      'ðŸ“ˆ S/R â€¢ Momentum â€¢ SMC â€¢ Volume\n' +
      'ðŸ’¡ ADX â€¢ Supertrend â€¢ Ichimoku â€¢ VWAP',
      { parse_mode: 'Markdown' }
    );

    let remaining = waitSeconds;
    const countdownInterval = setInterval(async () => {
      remaining--;
      const { h, m, s } = getBDTime();
      try {
        await bot.editMessageText(
          'ðŸ§  *AI Deep Chart Analysis*\n\n' +
          'â° BD Time: *' + h + ':' + m + ':' + s + '*\n' +
          'â³ Signal à¦†à¦¸à¦›à§‡: *' + remaining + ' seconds* à¦ªà¦°à§‡\n\n' +
          'ðŸ” Candlestick â€¢ Heikin Ashi â€¢ SMC â€¢ Wyckoff\n' +
          'ðŸ“Š RSI â€¢ MACD â€¢ Stochastic â€¢ ADX â€¢ CCI\n' +
          'ðŸ“ˆ Ichimoku â€¢ Supertrend â€¢ VWAP â€¢ Volume Profile\n' +
          'ðŸ’¡ Fibonacci â€¢ Pivot Points â€¢ Session Levels',
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
        await bot.sendMessage(chatId,
          'âŒ *à¦à¦Ÿà¦¾ trading chart à¦¨à¦¾!*\n\nðŸ“¸ à¦¶à§à¦§à§à¦®à¦¾à¦¤à§à¦° *Quotex chart screenshot* à¦ªà¦¾à¦ à¦¾à¦¨à¥¤',
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
          await bot.sendMessage(chatId,
            'âš ï¸ à¦à¦Ÿà¦¾ à¦†à¦ªà¦¨à¦¾à¦° *à¦¶à§‡à¦· Free Trial screenshot!*\n\nVerify à¦•à¦°à§à¦¨ unlimited access à¦ªà§‡à¦¤à§‡à¥¤',
            { parse_mode: 'Markdown' }
          );
        }
      }

      const remainingCount = userId === ADMIN_ID
        ? 'âˆž'
        : isApproved(userId)
          ? String(5 - getUserCount(userId))
          : String(getTrialScreenshotLeft(userId));

      const limitLabel = isApproved(userId) ? 'à¦†à¦œà¦•à§‡à¦° à¦¬à¦¾à¦•à¦¿' : 'Trial à¦¬à¦¾à¦•à¦¿';

      const dirEmoji = signal.direction === 'UP' ? 'â«' : 'â¬';
      let confEmoji = 'ðŸŸ¡';
      const confLower = (signal.confidence || '').toLowerCase();
      if (confLower.includes('very')) confEmoji = 'ðŸ”¥';
      else if (confLower.includes('high')) confEmoji = 'ðŸŸ¢';

      try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

      const sentMsg = await bot.sendMessage(chatId,
        'â•­â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•®\n' +
        'â”‚  ðŸ§  *AI Deep Chart Analysis*\n' +
        'â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯\n\n' +
        'ðŸš€ *DIRECTION* âžœ ' + signal.direction + ' ' + dirEmoji + '\n' +
        'ðŸ“Š *ENTRY*        âžœ `' + entry + '`\n' +
        'â± *EXPIRY*      âžœ `' + expiry + '`\n' +
        'â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n' +
        'â™»ï¸ *WIN RATE*    âžœ `' + signal.winRate + '`\n' +
        'âœ… *CONFIDENCE* âžœ ' + signal.confidence + ' ' + confEmoji + '\n' +
        'ðŸ”€ *TREND*        âžœ `' + signal.trend + '`\n' +
        'â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n' +
        'ðŸ’¡ _' + signal.reason + '_\n' +
        'â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n' +
        'ðŸ“¸ ' + limitLabel + ': *' + remainingCount + '*\n' +
        'âš ï¸ _Trade at your own risk if loss use 1 stet MTG_ âš ï¸',
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
        'âŒ Analysis failed!\n\nâž• *Generate New Signal ðŸ“Š* à¦¬à¦¾à¦Ÿà¦¨ à¦¦à¦¿à¦¯à¦¼à§‡ signal à¦¨à¦¿à¦¨à¥¤',
        { parse_mode: 'Markdown' }
      );
    }
  });
};
