// channel.js - Qx AI Predictor VIP
const https = require('https');

const CHANNEL_ID = '-1002427080688';
const ADMIN_ID = 5724602667;

// ✅ ১০টা API key rotation
const API_KEYS = [
  process.env.TWELVE_DATA_KEY_1,
  process.env.TWELVE_DATA_KEY_2,
  process.env.TWELVE_DATA_KEY_3,
  process.env.TWELVE_DATA_KEY_4,
  process.env.TWELVE_DATA_KEY_5,
  process.env.TWELVE_DATA_KEY_6,
  process.env.TWELVE_DATA_KEY_7,
  process.env.TWELVE_DATA_KEY_8,
  process.env.TWELVE_DATA_KEY_9,
  process.env.TWELVE_DATA_KEY_10
].filter(Boolean);

let apiKeyIndex = 0;
function getNextApiKey() {
  const key = API_KEYS[apiKeyIndex % API_KEYS.length];
  apiKeyIndex++;
  return key;
}

const CHECK_INTERVAL = 60 * 1000;
const MIN_GAP = 5 * 60 * 1000;
const MAX_GAP = 15 * 60 * 1000;
const CONFIRM_LIMIT = 5;
const STALE_MINUTES = 5;

// ✅ ৮টা pair — ৪+৪ rotation
const pairGroups = [
  [
    { live: 'EUR/USD', otc: 'EUR/USD OTC', flag: '🇪🇺🇺🇸' },
    { live: 'GBP/USD', otc: 'GBP/USD OTC', flag: '🇬🇧🇺🇸' },
    { live: 'USD/JPY', otc: 'USD/JPY OTC', flag: '🇺🇸🇯🇵' },
    { live: 'AUD/USD', otc: 'AUD/USD OTC', flag: '🇦🇺🇺🇸' }
  ],
  [
    { live: 'USD/CAD', otc: 'USD/CAD OTC', flag: '🇺🇸🇨🇦' },
    { live: 'USD/CHF', otc: 'USD/CHF OTC', flag: '🇺🇸🇨🇭' },
    { live: 'EUR/JPY', otc: 'EUR/JPY OTC', flag: '🇪🇺🇯🇵' },
    { live: 'GBP/JPY', otc: 'GBP/JPY OTC', flag: '🇬🇧🇯🇵' }
  ]
];

let pairGroupIndex = 0;
let lastSentTime = 0;
let lastMarketStatus = null;
let liveCount = 0;
let noLiveCount = 0;
let lastSignalKey = '';

function getBDTime() {
  const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return {
    h: String(bd.getUTCHours()).padStart(2, '0'),
    m: String(bd.getUTCMinutes()).padStart(2, '0'),
    day: bd.getUTCDay(),
    hour: bd.getUTCHours(),
    minute: bd.getUTCMinutes(),
    bd
  };
}

function getEntryExpiry() {
  const bd = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const h = bd.getUTCHours();
  const m = bd.getUTCMinutes();
  const eM = m + 1, xM = m + 2;
  return {
    entry: `${String((h + Math.floor(eM / 60)) % 24).padStart(2, '0')}:${String(eM % 60).padStart(2, '0')}`,
    expiry: `${String((h + Math.floor(xM / 60)) % 24).padStart(2, '0')}:${String(xM % 60).padStart(2, '0')}`
  };
}

// ✅ Market Hours — Quotex অনুযায়ী
function isLiveMarketOpen() {
  const { day, hour } = getBDTime();
  if (day === 6) return false;
  if (day === 0) return false;
  if (day === 1 && hour < 11) return false;
  if (day === 5 && hour >= 23) return false;
  if (hour >= 23) return false;
  if (hour < 11) return false;
  return true;
}

function isRolloverTime() {
  const { hour, minute } = getBDTime();
  if (hour === 23 && minute >= 58) return true;
  if (hour === 0 && minute <= 2) return true;
  return false;
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

async function getCandles(symbol) {
  const apiKey = getNextApiKey();
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1min&outputsize=30&apikey=${apiKey}`;
  const data = await fetchJSON(url);
  if (!data.values || !data.values.length) throw new Error('No data');

  const lastCandleTime = new Date(data.values[0].datetime + ' UTC');
  const diffMinutes = (new Date() - lastCandleTime) / (60 * 1000);
  if (diffMinutes > STALE_MINUTES) {
    throw new Error('Stale data: ' + Math.round(diffMinutes) + ' min old');
  }

  return data.values.map(v => ({
    open: +v.open, high: +v.high, low: +v.low,
    close: +v.close, volume: +v.volume || 0
  })).reverse();
}

function buildHigherTF(candles1m, period) {
  const result = [];
  for (let i = 0; i + period <= candles1m.length; i += period) {
    const sl = candles1m.slice(i, i + period);
    result.push({
      open: sl[0].open,
      high: Math.max(...sl.map(c => c.high)),
      low: Math.min(...sl.map(c => c.low)),
      close: sl[sl.length - 1].close,
      volume: sl.reduce((a, b) => a + b.volume, 0)
    });
  }
  return result;
}

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

function calcSR(candles) {
  const highs = candles.slice(-20).map(c => c.high);
  const lows = candles.slice(-20).map(c => c.low);
  const cur = candles[candles.length - 1].close;
  return {
    distRes: ((Math.max(...highs) - cur) / cur) * 100,
    distSup: ((cur - Math.min(...lows)) / cur) * 100
  };
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
  if (p2.close < p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && bull && c.close > (p2.open + p2.close) / 2)
    return { pattern: 'Morning Star', dir: 'UP', str: 4 };
  if (p2.close > p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && bear && c.close < (p2.open + p2.close) / 2)
    return { pattern: 'Evening Star', dir: 'DOWN', str: 4 };
  if (bull && p.close > p.open && p2.close > p2.open && body > range * 0.6)
    return { pattern: 'Three White Soldiers', dir: 'UP', str: 4 };
  if (bear && p.close < p.open && p2.close < p2.open && body > range * 0.6)
    return { pattern: 'Three Black Crows', dir: 'DOWN', str: 4 };
  if (body < range * 0.1)
    return { pattern: 'Doji', dir: 'NEUTRAL', str: 1 };
  if (bull && upWick < body * 0.05 && dnWick < body * 0.05)
    return { pattern: 'Bullish Marubozu', dir: 'UP', str: 3 };
  if (bear && upWick < body * 0.05 && dnWick < body * 0.05)
    return { pattern: 'Bearish Marubozu', dir: 'DOWN', str: 3 };
  if (c.high > p.high && c.low > p.low && p.high > p2.high)
    return { pattern: 'Higher High Uptrend', dir: 'UP', str: 2 };
  if (c.high < p.high && c.low < p.low && p.low < p2.low)
    return { pattern: 'Lower Low Downtrend', dir: 'DOWN', str: 2 };
  return { pattern: 'No Pattern', dir: 'NEUTRAL', str: 0 };
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
  return { dir: up > dn ? 'UP' : 'DOWN', up, dn };
}

function calcVolume(candles) {
  const rec = candles.slice(-5);
  const old = candles.slice(-15, -5);
  const avgRec = rec.reduce((a, b) => a + b.volume, 0) / rec.length;
  const avgOld = old.reduce((a, b) => a + b.volume, 0) / Math.max(old.length, 1);
  if (avgOld === 0) return { dir: 'NEUTRAL', str: 0 };
  const ratio = avgRec / avgOld;
  const isBull = candles[candles.length - 1].close > candles[candles.length - 1].open;
  if (ratio > 1.5 && isBull) return { dir: 'UP', str: 2 };
  if (ratio > 1.5 && !isBull) return { dir: 'DOWN', str: 2 };
  return { dir: 'NEUTRAL', str: 0 };
}

function analyzeTimeframe(candles) {
  const rsi = calcRSI(candles);
  const rsi7 = calcRSI(candles, 7);
  const stoch = calcStochRSI(candles);
  const macd = calcMACD(candles);
  const bb = calcBB(candles);
  const atr = calcATR(candles);
  const sr = calcSR(candles);
  const cp = calcCandlePattern(candles);
  const trend = calcTrend(candles);
  const vol = calcVolume(candles);
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

  if (sr.distSup < 0.1) { up += 3; signals.push('At Support'); }
  if (sr.distRes < 0.1) { dn += 3; signals.push('At Resistance'); }

  if (vol.dir === 'UP') { up += vol.str; signals.push('Volume Bullish'); }
  else if (vol.dir === 'DOWN') { dn += vol.str; signals.push('Volume Bearish'); }

  const total = up + dn;
  const dominant = Math.max(up, dn);
  const ratio = total > 0 ? dominant / total : 0;
  const direction = up >= dn ? 'UP' : 'DOWN';
  const volatility = (atr / last) * 100;
  const isStrongTrend = (trend.up >= 6 || trend.dn >= 6);

  return { direction, ratio, up, dn, signals, volatility, total, isStrongTrend, trendDir: trend.dir };
}

async function smartAnalyze(pair, forceOTC = false) {
  let candles1m;
  let isLive = false;

  if (!forceOTC) {
    try {
      candles1m = await getCandles(pair.live);
      isLive = true;
      console.log(pair.live + ' | ✅ Live');
    } catch (e) {
      console.log(pair.live + ' | ❌ ' + e.message);
    }
  }

  if (!candles1m) {
    try {
      candles1m = await getCandles(pair.live);
      isLive = false;
      console.log(pair.otc + ' | 📊 OTC');
    } catch (e) {
      console.log(pair.otc + ' | Failed — skip');
      return null;
    }
  }

  const candles5m = buildHigherTF(candles1m, 5);
  if (candles5m.length < 3) return null;

  const tf1m = analyzeTimeframe(candles1m);
  const tf5m = analyzeTimeframe(candles5m);

  if (!tf1m.isStrongTrend) {
    console.log((isLive ? pair.live : pair.otc) + ' | Weak trend — skip');
    return null;
  }

  // ✅ Multi-TF relax
  if (tf1m.direction !== tf5m.direction && tf5m.ratio > 0.55) {
    console.log((isLive ? pair.live : pair.otc) + ' | Mixed TF — skip');
    return null;
  }

  if (tf1m.volatility < 0.01) {
    console.log((isLive ? pair.live : pair.otc) + ' | Low volatility — skip');
    return null;
  }

  const avgRatio = tf1m.direction === tf5m.direction
    ? (tf1m.ratio + tf5m.ratio) / 2
    : tf1m.ratio;

  const aiScore = Math.round(avgRatio * 100);

  let confidence;
  if (avgRatio >= 0.82) confidence = 'Very High 🔥';
  else if (avgRatio >= 0.75) confidence = 'High 🟢';
  else {
    console.log((isLive ? pair.live : pair.otc) + ' | Medium — skip');
    return null;
  }

  const trendDesc = tf1m.direction === 'UP' ? 'Strong Uptrend 📈' : 'Strong Downtrend 📉';

  return {
    pair: isLive ? pair.live : pair.otc,
    flag: pair.flag,
    direction: tf1m.direction,
    confidence,
    aiScore,
    trend: trendDesc,
    signals: tf1m.signals.slice(0, 3),
    avgRatio,
    tf1m: Math.round(tf1m.ratio * 100),
    tf5m: Math.round(tf5m.ratio * 100),
    total: tf1m.total,
    isLive,
    failed: false
  };
}

function buildSignalMessage(best, entry, expiry) {
  const dirLabel = best.direction === 'UP' ? '🟢 BUY' : '🔴 SELL';
  const dirEmoji = best.direction === 'UP' ? '⏫' : '⏬';
  const marketMode = best.isLive ? '🟢 LIVE' : '🔴 OTC';
  const analysisLines = best.signals.map(s => `• ${s}`).join('\n');

  return (
    `╔══════════════════════╗\n` +
    `     🚀 𝗤𝘅 𝗔𝗜 𝗣𝗥𝗘𝗗𝗜𝗖𝗧𝗢𝗥 𝗩𝗜𝗣\n` +
    `╚══════════════════════╝\n\n` +
    `💹 𝗔𝗦𝗦𝗘𝗧        ➜ ${best.pair} ${best.flag}\n` +
    `📈 𝗗𝗜𝗥𝗘𝗖𝗧𝗜𝗢𝗡    ➜ ${dirLabel} ${dirEmoji}\n` +
    `🕒 𝗘𝗡𝗧𝗥𝗬        ➜ ${entry} (BD Time)\n` +
    `⏳ 𝗘𝗫𝗣𝗜𝗥𝗬      ➜ ${expiry} (1 Minute)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 𝗔𝗜 𝗦𝗖𝗢𝗥𝗘     ➜ ${best.aiScore}%\n` +
    `🔥 𝗖𝗢𝗡𝗙𝗜𝗗𝗘𝗡𝗖𝗘  ➜ ${best.confidence}\n` +
    `📊 𝗧𝗥𝗘𝗡𝗗        ➜ ${best.trend}\n` +
    `🌐 𝗠𝗔𝗥𝗞𝗘𝗧      ➜ ${marketMode}\n` +
    `⚡ 𝗦𝗧𝗔𝗧𝗨𝗦      ➜ ✅ Confirmed Signal\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 𝗔𝗡𝗔𝗟𝗬𝗦𝗜𝗦\n` +
    `${analysisLines}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛡️ 𝗥𝗜𝗦𝗞 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧\n` +
    `• Maximum 1 Step MTG\n` +
    `• Never Overtrade\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤖 Powered by 𝗤𝘅 𝗔𝗜 𝗣𝗿𝗲𝗱𝗶𝗰𝘁𝗼𝗿\n` +
    `⚠️ This signal is AI-generated.\n` +
    `Always trade at your own risk.`
  );
}

module.exports = function(bot, newsModule) {
  console.log('✅ Qx AI Predictor VIP — API Rotation + Pair Rotation started!');

  async function run() {
    if (newsModule && newsModule.isNewsActive()) {
      console.log('📰 News active — skip');
      return;
    }

    if (isRolloverTime()) {
      console.log('⏸ Rollover — skip');
      return;
    }

    const now = Date.now();
    const elapsed = now - lastSentTime;
    if (lastSentTime > 0 && elapsed < MIN_GAP) return;

    const { h, m } = getBDTime();
    const liveOpen = isLiveMarketOpen();

    // ✅ ৪+৪ Pair Rotation
    const currentPairs = pairGroups[pairGroupIndex % 2];
    pairGroupIndex++;

    console.log(`🔍 Scan BD: ${h}:${m} | Market: ${liveOpen ? '🟢 LIVE' : '🔴 OTC'} | Group: ${pairGroupIndex % 2 === 0 ? '1' : '2'}`);

    const results = [];
    let anyLive = false;

    for (const pair of currentPairs) {
      try {
        const res = await smartAnalyze(pair, !liveOpen);
        if (res) {
          results.push(res);
          if (res.isLive) anyLive = true;
        }
        await new Promise(r => setTimeout(r, 1200));
      } catch (e) {
        console.log('Error: ' + pair.live + ' — ' + e.message);
      }
    }

    // ✅ Market Open/Close — শুধু Admin
    if (anyLive) { liveCount++; noLiveCount = 0; }
    else { noLiveCount++; liveCount = 0; }

    const { h: ah, m: am } = getBDTime();

    if (liveCount >= CONFIRM_LIMIT && lastMarketStatus !== true) {
      lastMarketStatus = true;
      liveCount = 0;
      try {
        await bot.sendMessage(ADMIN_ID,
          `🟢 *Quotex Market OPEN*\n\n` +
          `📊 পরপর ${CONFIRM_LIMIT} বার Live Data পাওয়া গেছে\n` +
          `⏰ BD Time: \`${ah}:${am}\`\n\n` +
          `✅ Live Signal চালু হয়েছে।`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
    }

    if (noLiveCount >= CONFIRM_LIMIT && lastMarketStatus !== false) {
      lastMarketStatus = false;
      noLiveCount = 0;
      try {
        await bot.sendMessage(ADMIN_ID,
          `🔴 *Quotex Market CLOSED*\n\n` +
          `😴 পরপর ${CONFIRM_LIMIT} বার Live Data পাওয়া যায়নি\n` +
          `⏰ BD Time: \`${ah}:${am}\`\n\n` +
          `📊 OTC Signal চলছে।`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
    }

    if (!results.length) {
      console.log('❌ No signal found.');
      return;
    }

    results.sort((a, b) => b.avgRatio - a.avgRatio || b.total - a.total);
    const best = results[0];

    const signalKey = `${best.pair}_${best.direction}`;
    if (signalKey === lastSignalKey && elapsed < MAX_GAP) {
      console.log(`🔁 Duplicate — skip`);
      return;
    }

    const { entry, expiry } = getEntryExpiry();
    const msg = buildSignalMessage(best, entry, expiry);

    try {
      await bot.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
      lastSentTime = Date.now();
      lastSignalKey = signalKey;
      console.log(`✅ Signal: ${best.pair} | ${best.aiScore}% | ${best.confidence} | ${best.isLive ? 'LIVE 🟢' : 'OTC 🔴'}`);
    } catch (e) {
      console.log('Send error: ' + e.message);
    }
  }

  setTimeout(() => {
    run();
    setInterval(run, CHECK_INTERVAL);
  }, 30000);
};
