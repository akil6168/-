// session.js - Qx AI Predictor VIP Session
const https = require('https');

const CHANNEL_ID = '-1002268650240';
const ADMIN_ID = 5724602667;
const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY_1 || process.env.TWELVE_DATA_KEY;

// ✅ Sticker file_ids
const STICKERS = {
  SESSION_START: 'CAACAguAAxkBAAIH2WpNWwR2hfnDb4wtRGSHKstSu-gBAALnIgACWHFpVlTeidVCL8I3PAQ',
  SESSION_CLOSE: 'CAACAguAAxkBAAIH2mpNWwTdCNKbp9yznZrC4nDygijlAAIJIAACc3VpVkNdndLynxI-PAQ',
  CALL: 'CAACAguAAxkBAAIH22pNWwUGR5DrKqvvriS8f6ZEXmYiAALJIgAC5k9pVqeGo-FqhqZxPAQ',
  PUT: 'CAACAguAAxkBAAIH3GpNWwXLhbVDn1_7F7U1ZKLdgBo8AALqHgACyMJoVqWoJ2kKKy94PAQ',
  MTG_UP: 'CAACAguAAxkBAAIH3mpNWwfENL7KDzi_QAYdm7tFnslUAAIzMQACMjBpVr5zJRxZHFjYPAQ',
  MTG_DOWN: 'CAACAguAAxkBAAIH32pNWwcNG3PcaLF1s7TQLyO58fgPAAKTJwACxONpVk9q_2A9wcpPPAQ',
  NEXT_ONE: 'CAACAguAAxkBAAIH4GpNWwh_U7GGnyqm4Dt9h6jcLwSCAALOIAACKY5oVv-5TOUJuFB8PAQ',
  ARE_YOU_READY: 'CAACAguAAxkBAAIH3WpNWwYDWsPalq2tcALGnRAuBvRQAALJIAACHXdoVqVbV76nUyGLPAQ',
  SURESHOT: 'CAACAguAAxkBAAIH1GpNWwR2hfnDb4wtRGSHKstSu-gBAALnIgACWHFpVlTeidVCL8I3PAQ'
};

// ✅ Session pairs — শুধু Live market
const SESSION_PAIRS = [
  { symbol: 'EUR/USD', flag: '🇪🇺🇺🇸' },
  { symbol: 'GBP/USD', flag: '🇬🇧🇺🇸' },
  { symbol: 'USD/JPY', flag: '🇺🇸🇯🇵' },
  { symbol: 'AUD/USD', flag: '🇦🇺🇺🇸' },
  { symbol: 'EUR/GBP', flag: '🇪🇺🇬🇧' },
  { symbol: 'USD/CHF', flag: '🇺🇸🇨🇭' },
  { symbol: 'EUR/JPY', flag: '🇪🇺🇯🇵' },
  { symbol: 'GBP/JPY', flag: '🇬🇧🇯🇵' }
];

function getBDTime() {
  const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return {
    h: bd.getUTCHours(),
    m: bd.getUTCMinutes(),
    s: bd.getUTCSeconds(),
    hStr: String(bd.getUTCHours()).padStart(2, '0'),
    mStr: String(bd.getUTCMinutes()).padStart(2, '0')
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ✅ Current price নেবো
async function getCurrentPrice(symbol) {
  const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${TWELVE_DATA_KEY}`;
  const data = await fetchJSON(url);
  return parseFloat(data.price);
}

// ✅ Chart image URL বানাবো
function getChartUrl(symbol) {
  return `https://api.twelvedata.com/time_series/chart?symbol=${symbol}&interval=1min&outputsize=30&chart_type=candlestick&apikey=${TWELVE_DATA_KEY}`;
}

// ✅ Candle data নেবো
async function getCandles(symbol) {
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1min&outputsize=30&apikey=${TWELVE_DATA_KEY}`;
  const data = await fetchJSON(url);
  if (!data.values || !data.values.length) throw new Error('No data');

  const lastCandleTime = new Date(data.values[0].datetime + ' UTC');
  const diffMinutes = (new Date() - lastCandleTime) / (60 * 1000);
  if (diffMinutes > 5) throw new Error('Stale data');

  return data.values.map(v => ({
    open: +v.open, high: +v.high, low: +v.low,
    close: +v.close, volume: +v.volume || 0
  })).reverse();
}

// ✅ Analysis functions
function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    d > 0 ? gain += d : loss += Math.abs(d);
  }
  return 100 - (100 / (1 + gain / (loss || 1)));
}

function calcEMA(candles, period) {
  if (candles.length < 2) return candles[0].close;
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) ema = candles[i].close * k + ema * (1 - k);
  return ema;
}

function calcMACD(candles) { return calcEMA(candles, 12) - calcEMA(candles, 26); }

function calcStochRSI(candles, period = 14) {
  const rsiArr = [];
  for (let i = period; i < candles.length; i++)
    rsiArr.push(calcRSI(candles.slice(0, i + 1), period));
  if (rsiArr.length < period) return 50;
  const rec = rsiArr.slice(-period);
  const mn = Math.min(...rec), mx = Math.max(...rec);
  if (mx === mn) return 50;
  return ((rsiArr[rsiArr.length - 1] - mn) / (mx - mn)) * 100;
}

function calcBB(candles, period = 20) {
  const p = Math.min(period, candles.length);
  const closes = candles.slice(-p).map(c => c.close);
  const sma = closes.reduce((a, b) => a + b, 0) / p;
  const std = Math.sqrt(closes.reduce((s, c) => s + Math.pow(c - sma, 2), 0) / p);
  return { upper: sma + 2 * std, lower: sma - 2 * std };
}

function calcATR(candles, period = 14) {
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcTrend(candles) {
  const ema5 = calcEMA(candles, 5);
  const ema10 = calcEMA(candles, 10);
  const ema20 = calcEMA(candles, 20);
  const ema50 = calcEMA(candles, 50);
  const last = candles[candles.length - 1].close;
  let up = 0, dn = 0;
  if (ema5 > ema20) up += 2; else dn += 2;
  if (ema10 > ema50) up += 2; else dn += 2;
  if (last > ema5) up += 1; else dn += 1;
  if (last > ema20) up += 1; else dn += 1;
  if (ema5 > ema10 && ema10 > ema20) up += 2;
  else if (ema5 < ema10 && ema10 < ema20) dn += 2;
  return { dir: up > dn ? 'UP' : 'DOWN', up, dn, isStrong: up >= 6 || dn >= 6 };
}

function calcCandlePattern(candles) {
  const len = candles.length;
  if (len < 3) return { pattern: 'No Pattern', dir: 'NEUTRAL', str: 0 };
  const c = candles[len - 1], p = candles[len - 2], p2 = candles[len - 3];
  const body = Math.abs(c.close - c.open);
  const upWick = c.high - Math.max(c.close, c.open);
  const dnWick = Math.min(c.close, c.open) - c.low;
  const range = c.high - c.low;
  const bull = c.close > c.open, bear = c.close < c.open;

  if (bull && p.close < p.open && c.close > p.open && c.open < p.close)
    return { pattern: 'Bullish Engulfing', dir: 'UP', str: 3 };
  if (bear && p.close > p.open && c.open > p.close && c.close < p.open)
    return { pattern: 'Bearish Engulfing', dir: 'DOWN', str: 3 };
  if (dnWick > body * 2.5 && upWick < body * 0.5)
    return { pattern: 'Bullish Pin Bar', dir: 'UP', str: 3 };
  if (upWick > body * 2.5 && dnWick < body * 0.5)
    return { pattern: 'Bearish Pin Bar', dir: 'DOWN', str: 3 };
  if (p2.close < p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && bull)
    return { pattern: 'Morning Star', dir: 'UP', str: 4 };
  if (p2.close > p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && bear)
    return { pattern: 'Evening Star', dir: 'DOWN', str: 4 };
  if (bull && p.close > p.open && p2.close > p2.open && body > range * 0.6)
    return { pattern: 'Three White Soldiers', dir: 'UP', str: 4 };
  if (bear && p.close < p.open && p2.close < p2.open && body > range * 0.6)
    return { pattern: 'Three Black Crows', dir: 'DOWN', str: 4 };
  if (body < range * 0.1) return { pattern: 'Doji', dir: 'NEUTRAL', str: 1 };
  if (bull && upWick < body * 0.05 && dnWick < body * 0.05)
    return { pattern: 'Bullish Marubozu', dir: 'UP', str: 3 };
  if (bear && upWick < body * 0.05 && dnWick < body * 0.05)
    return { pattern: 'Bearish Marubozu', dir: 'DOWN', str: 3 };
  return { pattern: 'No Pattern', dir: 'NEUTRAL', str: 0 };
}

async function analyzeForSession(symbol) {
  const candles = await getCandles(symbol);
  const rsi = calcRSI(candles);
  const rsi7 = calcRSI(candles, 7);
  const stoch = calcStochRSI(candles);
  const macd = calcMACD(candles);
  const bb = calcBB(candles);
  const atr = calcATR(candles);
  const trend = calcTrend(candles);
  const cp = calcCandlePattern(candles);
  const last = candles[candles.length - 1].close;

  let up = 0, dn = 0;
  const signals = [];

  if (rsi < 30) { up += 3; signals.push('RSI Oversold'); }
  else if (rsi > 70) { dn += 3; signals.push('RSI Overbought'); }
  else if (rsi < 45) up += 1;
  else if (rsi > 55) dn += 1;

  if (rsi7 < 25) { up += 2; signals.push('Fast RSI Oversold'); }
  else if (rsi7 > 75) { dn += 2; signals.push('Fast RSI Overbought'); }

  if (stoch < 20) { up += 2; signals.push('StochRSI Oversold'); }
  else if (stoch > 80) { dn += 2; signals.push('StochRSI Overbought'); }

  if (macd > 0) { up += 2; signals.push('MACD Bullish'); }
  else { dn += 2; signals.push('MACD Bearish'); }

  if (last <= bb.lower) { up += 3; signals.push('Price at Lower BB'); }
  else if (last >= bb.upper) { dn += 3; signals.push('Price at Upper BB'); }

  up += trend.up; dn += trend.dn;
  if (trend.dir === 'UP') signals.push('EMA Bullish');
  else signals.push('EMA Bearish');

  if (cp.dir === 'UP') { up += cp.str; signals.push(cp.pattern); }
  else if (cp.dir === 'DOWN') { dn += cp.str; signals.push(cp.pattern); }

  const total = up + dn;
  const dominant = Math.max(up, dn);
  const ratio = total > 0 ? dominant / total : 0;
  const direction = up >= dn ? 'UP' : 'DOWN';
  const volatility = (atr / last) * 100;

  // Session এ শুধু Very High confidence
  if (ratio < 0.82) return null;
  if (!trend.isStrong) return null;
  if (volatility < 0.01) return null;

  return {
    symbol,
    direction,
    ratio,
    aiScore: Math.round(ratio * 100),
    trend: trend.dir === 'UP' ? 'Strong Uptrend 📈' : 'Strong Downtrend 📉',
    signals: signals.slice(0, 3),
    currentPrice: last,
    isSureShot: ratio >= 0.90
  };
}

// ✅ Session signals collect করবো
async function collectSessionSignals(count = 5) {
  const results = [];

  for (const pair of SESSION_PAIRS) {
    if (results.length >= count) break;
    try {
      const result = await analyzeForSession(pair.symbol);
      if (result) {
        result.flag = pair.flag;
        results.push(result);
        console.log(`✅ Session signal: ${pair.symbol} ${result.direction} ${result.aiScore}%`);
      }
      await sleep(1500);
    } catch (e) {
      console.log(`❌ ${pair.symbol}: ${e.message}`);
    }
  }

  return results;
}

// ✅ একটা signal পাঠানোর পুরো flow
async function sendOneSignal(bot, signal, signalNum, totalSignals) {
  const bd = getBDTime();
  const entryM = bd.m + 1;
  const expiryM = bd.m + 2;
  const entryH = bd.h + Math.floor(entryM / 60);
  const entryTime = `${String(entryH % 24).padStart(2, '0')}:${String(entryM % 60).padStart(2, '0')}`;
  const expiryTime = `${String(entryH % 24).padStart(2, '0')}:${String(expiryM % 60).padStart(2, '0')}`;

  // Step 1: Pair announce করবো
  await bot.sendMessage(CHANNEL_ID,
    `🔔 *Signal ${signalNum}/${totalSignals} আসছে!*\n\n` +
    `💹 *ASSET* ➜ ${signal.symbol} ${signal.flag}\n` +
    `⏰ *ENTRY* ➜ \`${entryTime}\` (BD Time)\n` +
    `⏳ *EXPIRY* ➜ \`${expiryTime}\` (1 Minute)\n\n` +
    `📊 *Current Price:* \`${signal.currentPrice.toFixed(5)}\`\n` +
    `📈 *Trend:* ${signal.trend}\n` +
    `🎯 *AI Score:* \`${signal.aiScore}%\`\n\n` +
    `⚡ Direction আসছে ১০ সেকেন্ডে...`,
    { parse_mode: 'Markdown' }
  );

  // Step 2: ১০ সেকেন্ড অপেক্ষা
  await sleep(10000);

  // Step 3: SureShot হলে sticker পাঠাবো
  if (signal.isSureShot) {
    await bot.sendSticker(CHANNEL_ID, STICKERS.SURESHOT);
    await sleep(1000);
  }

  // Step 4: CALL/PUT sticker পাঠাবো
  const directionSticker = signal.direction === 'UP' ? STICKERS.CALL : STICKERS.PUT;
  await bot.sendSticker(CHANNEL_ID, directionSticker);

  // Step 5: Signal message পাঠাবো
  const dirLabel = signal.direction === 'UP' ? '🟢 CALL ⏫' : '🔴 PUT ⏬';
  await bot.sendMessage(CHANNEL_ID,
    `╔══════════════════════╗\n` +
    `     🚀 𝗤𝘅 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝗜𝗣\n` +
    `╚══════════════════════╝\n\n` +
    `💹 𝗔𝗦𝗦𝗘𝗧      ➜ ${signal.symbol} ${signal.flag}\n` +
    `📈 𝗗𝗜𝗥𝗘𝗖𝗧𝗜𝗢𝗡  ➜ ${dirLabel}\n` +
    `💰 𝗣𝗥𝗜𝗖𝗘      ➜ \`${signal.currentPrice.toFixed(5)}\`\n` +
    `🕒 𝗘𝗡𝗧𝗥𝗬      ➜ ${entryTime} (BD Time)\n` +
    `⏳ 𝗘𝗫𝗣𝗜𝗥𝗬    ➜ ${expiryTime} (1 Minute)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 𝗔𝗜 𝗦𝗖𝗢𝗥𝗘   ➜ ${signal.aiScore}%\n` +
    `🔥 𝗖𝗢𝗡𝗙𝗜𝗗𝗘𝗡𝗖𝗘 ➜ Very High 🔥\n` +
    `📊 𝗧𝗥𝗘𝗡𝗗      ➜ ${signal.trend}\n` +
    `⚡ 𝗦𝗧𝗔𝗧𝗨𝗦    ➜ ✅ Confirmed Signal\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 𝗔𝗡𝗔𝗟𝗬𝗦𝗜𝗦\n` +
    signal.signals.map(s => `• ${s}`).join('\n') + '\n' +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛡️ 𝗥𝗜𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧\n` +
    `• Maximum 1 Step MTG\n` +
    `• Never Overtrade\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤖 Powered by 𝗤𝘅 𝗔𝗜 𝗣𝗿𝗲𝗱𝗶𝗰𝘁𝗼𝗿\n` +
    `⚠️ Trade at your own risk.`,
    { parse_mode: 'Markdown' }
  );

  // Step 6: Entry price save করবো
  const entryPrice = signal.currentPrice;

  // Step 7: ১ মিনিট ৫ সেকেন্ড অপেক্ষা (expiry পর্যন্ত)
  await sleep(65000);

  // Step 8: Exit price নেবো
  let exitPrice;
  try {
    exitPrice = await getCurrentPrice(signal.symbol);
  } catch (e) {
    console.log('Exit price error: ' + e.message);
    return;
  }

  // Step 9: WIN/LOSS বের করবো
  const isWin = signal.direction === 'UP'
    ? exitPrice > entryPrice
    : exitPrice < entryPrice;

  console.log(`${signal.symbol} | Entry: ${entryPrice} | Exit: ${exitPrice} | ${isWin ? 'WIN ✅' : 'LOSS ❌'}`);

  if (isWin) {
    // WIN → SURESHOT sticker
    await bot.sendSticker(CHANNEL_ID, STICKERS.SURESHOT);
    await sleep(500);
    await bot.sendMessage(CHANNEL_ID,
      `✅ *RESULT: WIN* 🎉\n\n` +
      `💹 *${signal.symbol}* ${signal.flag}\n` +
      `📈 *Direction:* ${signal.direction === 'UP' ? '🟢 CALL' : '🔴 PUT'}\n` +
      `💰 *Entry:* \`${entryPrice.toFixed(5)}\`\n` +
      `💰 *Exit:* \`${exitPrice.toFixed(5)}\`\n\n` +
      `🏆 *Congratulations! Trade জিতেছেন!*`,
      { parse_mode: 'Markdown' }
    );
  } else {
    // LOSS → MTG sticker
    const mtgSticker = signal.direction === 'UP' ? STICKERS.MTG_UP : STICKERS.MTG_DOWN;
    await bot.sendSticker(CHANNEL_ID, mtgSticker);
    await sleep(500);
    await bot.sendMessage(CHANNEL_ID,
      `❌ *RESULT: LOSS*\n\n` +
      `💹 *${signal.symbol}* ${signal.flag}\n` +
      `📈 *Direction:* ${signal.direction === 'UP' ? '🟢 CALL' : '🔴 PUT'}\n` +
      `💰 *Entry:* \`${entryPrice.toFixed(5)}\`\n` +
      `💰 *Exit:* \`${exitPrice.toFixed(5)}\`\n\n` +
      `⚠️ *MTG নিন — Maximum 1 Step!*\n` +
      `💪 পরের signal এ recover করুন!`,
      { parse_mode: 'Markdown' }
    );
  }
}

// ✅ Full Session চালাবো
async function runSession(bot, sessionName) {
  const { hStr, mStr } = getBDTime();
  console.log(`🏁 ${sessionName} Session শুরু হচ্ছে — BD: ${hStr}:${mStr}`);

  // Session Start sticker
  await bot.sendSticker(CHANNEL_ID, STICKERS.SESSION_START);
  await sleep(1000);

  // Session Start message
  await bot.sendMessage(CHANNEL_ID,
    `🏁 *${sessionName} Session শুরু হয়েছে!*\n\n` +
    `⏰ BD Time: \`${hStr}:${mStr}\`\n` +
    `📊 Signal scanning শুরু হচ্ছে...\n\n` +
    `⚡ সর্বোচ্চ ৫টা signal আসবে আজকের session এ!`,
    { parse_mode: 'Markdown' }
  );

  await sleep(2000);

  // ARE YOU READY sticker
  await bot.sendSticker(CHANNEL_ID, STICKERS.ARE_YOU_READY);

  await sleep(3000);

  // Signals collect করবো
  const signals = await collectSessionSignals(5);

  if (signals.length === 0) {
    await bot.sendMessage(CHANNEL_ID,
      `😔 *এই সময়ে কোনো strong signal পাওয়া যায়নি।*\n\n` +
      `📊 Market condition ভালো না — পরের session এ ভালো signal আসবে।\n\n` +
      `⚠️ Market এ force করে trade করবেন না!`,
      { parse_mode: 'Markdown' }
    );

    // Session Close
    await bot.sendSticker(CHANNEL_ID, STICKERS.SESSION_CLOSE);
    return;
  }

  await bot.sendMessage(CHANNEL_ID,
    `🎯 *${signals.length}টা High Accuracy Signal পাওয়া গেছে!*\n\n` +
    `⚡ একটার পর একটা আসবে...\n` +
    `🛡️ সবসময় Risk Manage করুন!`,
    { parse_mode: 'Markdown' }
  );

  await sleep(3000);

  // একটার পর একটা signal পাঠাবো
  for (let i = 0; i < signals.length; i++) {
    await sendOneSignal(bot, signals[i], i + 1, signals.length);

    // শেষ signal না হলে NEXT ONE sticker
    if (i < signals.length - 1) {
      await sleep(2000);
      await bot.sendSticker(CHANNEL_ID, STICKERS.NEXT_ONE);
      await sleep(3000);
    }
  }

  // Session Close
  await sleep(2000);
  await bot.sendSticker(CHANNEL_ID, STICKERS.SESSION_CLOSE);
  await sleep(500);

  await bot.sendMessage(CHANNEL_ID,
    `🏁 *${sessionName} Session শেষ হয়েছে!*\n\n` +
    `📊 *আজকের Summary:*\n` +
    `• Total Signals: ${signals.length}\n\n` +
    `🙏 সবাইকে ধন্যবাদ!\n` +
    `💪 পরের session এ আবার দেখা হবে।\n\n` +
    `⚠️ Always trade at your own risk.`,
    { parse_mode: 'Markdown' }
  );

  console.log(`✅ ${sessionName} Session শেষ`);
}

module.exports = function(bot) {
  console.log('✅ Session scheduler started!');

  setInterval(async () => {
    const { h, m, s } = getBDTime();

    // ✅ Morning Session — সকাল ৯:৩০ Reminder
    if (h === 9 && m === 30 && s < 10) {
      await bot.sendMessage(CHANNEL_ID,
        `⏰ *Morning Session শুরু হবে ৩০ মিনিট পরে!*\n\n` +
        `🕙 সকাল ১০:০০ টায় শুরু হবে\n` +
        `📊 সবাই রেডি থাকুন! ✅\n\n` +
        `💹 আজকের Best Signals নিয়ে আসছি!`,
        { parse_mode: 'Markdown' }
      );
    }

    // ✅ Morning Session — সকাল ১০:০০ Start
    if (h === 10 && m === 0 && s < 10) {
      await runSession(bot, '🌅 Morning');
    }

    // ✅ Evening Session — রাত ৮:৩০ Reminder
    if (h === 20 && m === 30 && s < 10) {
      await bot.sendMessage(CHANNEL_ID,
        `🌙 *Evening Session শুরু হবে ৩০ মিনিট পরে!*\n\n` +
        `🕙 রাত ৯:০০ টায় শুরু হবে\n` +
        `📊 সবাই রেডি থাকুন! ✅\n\n` +
        `💹 Evening এর Best Signals নিয়ে আসছি!`,
        { parse_mode: 'Markdown' }
      );
    }

    // ✅ Evening Session — রাত ৯:০০ Start
    if (h === 21 && m === 0 && s < 10) {
      await runSession(bot, '🌙 Evening');
    }

  }, 5000);
};
