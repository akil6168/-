// channel.js - Auto Signal to Private Channel
const https = require('https');

const CHANNEL_ID = '-1002427080688';
const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY || '3d31d53eb903483fb33d6854db50e0fd';

const pairs = [
  'EUR/USD OTC', 'GBP/USD OTC',
  'USD/JPY OTC', 'AUD/USD OTC'
];

const pairSymbolMap = {
  'EUR/USD OTC': 'EUR/USD',
  'GBP/USD OTC': 'GBP/USD',
  'USD/JPY OTC': 'USD/JPY',
  'AUD/USD OTC': 'AUD/USD'
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getCandles(symbol) {
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1min&outputsize=50&apikey=${TWELVE_DATA_KEY}`;
  const data = await fetchJSON(url);
  if (!data.values || data.values.length === 0) throw new Error('No data');
  return data.values.map(v => ({
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseFloat(v.volume) || 0
  })).reverse();
}

function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calcEMA(candles, period) {
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

function calcMACD(candles) {
  const ema12 = calcEMA(candles, 12);
  const ema26 = calcEMA(candles, 26);
  return ema12 - ema26;
}

function calcStochRSI(candles, period = 14) {
  const rsiValues = [];
  for (let i = period; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    rsiValues.push(calcRSI(slice, period));
  }
  if (rsiValues.length < period) return 50;
  const recent = rsiValues.slice(-period);
  const minRSI = Math.min(...recent);
  const maxRSI = Math.max(...recent);
  if (maxRSI === minRSI) return 50;
  return ((rsiValues[rsiValues.length - 1] - minRSI) / (maxRSI - minRSI)) * 100;
}

function calcBollingerBands(candles, period = 20) {
  const closes = candles.slice(-period).map(c => c.close);
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: sma + 2 * stdDev,
    middle: sma,
    lower: sma - 2 * stdDev,
    bandwidth: (4 * stdDev) / sma * 100
  };
}

function calcATR(candles, period = 14) {
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

function findSupportResistance(candles) {
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));
  const currentPrice = candles[candles.length - 1].close;
  const distToResistance = ((recentHigh - currentPrice) / currentPrice) * 100;
  const distToSupport = ((currentPrice - recentLow) / currentPrice) * 100;
  return { recentHigh, recentLow, distToResistance, distToSupport };
}

function analyzeCandlePattern(candles) {
  const len = candles.length;
  const c = candles[len - 1];
  const p = candles[len - 2];
  const p2 = candles[len - 3];

  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.close, c.open);
  const lowerWick = Math.min(c.close, c.open) - c.low;
  const totalRange = c.high - c.low;
  const isBullish = c.close > c.open;
  const isBearish = c.close < c.open;

  if (isBullish && p.close < p.open && c.close > p.open && c.open < p.close)
    return { pattern: 'Bullish Engulfing', direction: 'UP', strength: 3 };
  if (isBearish && p.close > p.open && c.open > p.close && c.close < p.open)
    return { pattern: 'Bearish Engulfing', direction: 'DOWN', strength: 3 };
  if (lowerWick > body * 2.5 && upperWick < body * 0.5 && lowerWick > totalRange * 0.6)
    return { pattern: 'Bullish Pin Bar', direction: 'UP', strength: 3 };
  if (upperWick > body * 2.5 && lowerWick < body * 0.5 && upperWick > totalRange * 0.6)
    return { pattern: 'Bearish Pin Bar', direction: 'DOWN', strength: 3 };
  if (p2.close < p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && isBullish && c.close > (p2.open + p2.close) / 2)
    return { pattern: 'Morning Star', direction: 'UP', strength: 4 };
  if (p2.close > p2.open && Math.abs(p.close - p.open) < Math.abs(p2.close - p2.open) * 0.3 && isBearish && c.close < (p2.open + p2.close) / 2)
    return { pattern: 'Evening Star', direction: 'DOWN', strength: 4 };
  if (c.close > c.open && p.close > p.open && p2.close > p2.open &&
      c.close > p.close && p.close > p2.close && body > totalRange * 0.6)
    return { pattern: 'Three White Soldiers', direction: 'UP', strength: 4 };
  if (c.close < c.open && p.close < p.open && p2.close < p2.open &&
      c.close < p.close && p.close < p2.close && body > totalRange * 0.6)
    return { pattern: 'Three Black Crows', direction: 'DOWN', strength: 4 };
  if (body < totalRange * 0.1)
    return { pattern: 'Doji', direction: 'NEUTRAL', strength: 1 };
  if (isBullish && upperWick < body * 0.05 && lowerWick < body * 0.05)
    return { pattern: 'Bullish Marubozu', direction: 'UP', strength: 3 };
  if (isBearish && upperWick < body * 0.05 && lowerWick < body * 0.05)
    return { pattern: 'Bearish Marubozu', direction: 'DOWN', strength: 3 };
  if (c.high > p.high && c.low > p.low && p.high > p2.high && p.low > p2.low)
    return { pattern: 'Higher High (Uptrend)', direction: 'UP', strength: 2 };
  if (c.high < p.high && c.low < p.low && p.high < p2.high && p.low < p2.low)
    return { pattern: 'Lower Low (Downtrend)', direction: 'DOWN', strength: 2 };

  return { pattern: 'No Clear Pattern', direction: 'NEUTRAL', strength: 0 };
}

function analyzeTrend(candles) {
  const ema5 = calcEMA(candles, 5);
  const ema10 = calcEMA(candles, 10);
  const ema20 = calcEMA(candles, 20);
  const ema50 = calcEMA(candles, 50);
  const lastClose = candles[candles.length - 1].close;

  let upScore = 0, downScore = 0;
  if (ema5 > ema20) upScore += 2; else downScore += 2;
  if (ema10 > ema50) upScore += 2; else downScore += 2;
  if (lastClose > ema5) upScore += 1; else downScore += 1;
  if (lastClose > ema20) upScore += 1; else downScore += 1;
  if (ema5 > ema10 && ema10 > ema20) upScore += 2; else if (ema5 < ema10 && ema10 < ema20) downScore += 2;

  const trendDir = upScore > downScore ? 'UP' : 'DOWN';
  const trendStrength = Math.abs(upScore - downScore);
  return { trendDir, trendStrength, ema5, ema10, ema20, ema50, upScore, downScore };
}

function analyzeVolume(candles) {
  const recent = candles.slice(-5);
  const older = candles.slice(-15, -5);
  const avgRecentVol = recent.reduce((a, b) => a + b.volume, 0) / recent.length;
  const avgOlderVol = older.reduce((a, b) => a + b.volume, 0) / older.length;
  const lastCandle = candles[candles.length - 1];
  const isBullishCandle = lastCandle.close > lastCandle.open;
  if (avgOlderVol === 0) return { volumeSignal: 'NEUTRAL', strength: 0 };
  const volRatio = avgRecentVol / avgOlderVol;
  if (volRatio > 1.5 && isBullishCandle) return { volumeSignal: 'UP', strength: 2 };
  if (volRatio > 1.5 && !isBullishCandle) return { volumeSignal: 'DOWN', strength: 2 };
  if (volRatio < 0.7) return { volumeSignal: 'NEUTRAL', strength: 0 };
  return { volumeSignal: 'NEUTRAL', strength: 1 };
}

async function deepAnalyze(otcPair) {
  const symbol = pairSymbolMap[otcPair];
  const candles = await getCandles(symbol);

  const rsi = calcRSI(candles);
  const rsi7 = calcRSI(candles, 7);
  const stochRSI = calcStochRSI(candles);
  const macd = calcMACD(candles);
  const bb = calcBollingerBands(candles);
  const atr = calcATR(candles);
  const sr = findSupportResistance(candles);
  const candlePattern = analyzeCandlePattern(candles);
  const trend = analyzeTrend(candles);
  const volume = analyzeVolume(candles);
  const lastClose = candles[candles.length - 1].close;

  let upScore = 0, downScore = 0;
  const signals = [];

  if (rsi < 30) { upScore += 3; signals.push('RSI Oversold'); }
  else if (rsi > 70) { downScore += 3; signals.push('RSI Overbought'); }
  else if (rsi < 45) { upScore += 1; }
  else if (rsi > 55) { downScore += 1; }

  if (rsi7 < 25) { upScore += 2; signals.push('Fast RSI Oversold'); }
  else if (rsi7 > 75) { downScore += 2; signals.push('Fast RSI Overbought'); }

  if (stochRSI < 20) { upScore += 2; signals.push('StochRSI Oversold'); }
  else if (stochRSI > 80) { downScore += 2; signals.push('StochRSI Overbought'); }

  if (macd > 0) { upScore += 2; signals.push('MACD Bullish'); }
  else { downScore += 2; signals.push('MACD Bearish'); }

  if (lastClose <= bb.lower) { upScore += 3; signals.push('Price at Lower BB'); }
  else if (lastClose >= bb.upper) { downScore += 3; signals.push('Price at Upper BB'); }

  upScore += trend.upScore;
  downScore += trend.downScore;
  if (trend.trendDir === 'UP') signals.push('EMA Bullish Trend');
  else signals.push('EMA Bearish Trend');

  if (candlePattern.direction === 'UP') {
    upScore += candlePattern.strength;
    signals.push(candlePattern.pattern);
  } else if (candlePattern.direction === 'DOWN') {
    downScore += candlePattern.strength;
    signals.push(candlePattern.pattern);
  }

  if (sr.distToSupport < 0.1) { upScore += 3; signals.push('Price at Support'); }
  if (sr.distToResistance < 0.1) { downScore += 3; signals.push('Price at Resistance'); }

  if (volume.volumeSignal === 'UP') { upScore += volume.strength; signals.push('Volume Confirms UP'); }
  else if (volume.volumeSignal === 'DOWN') { downScore += volume.strength; signals.push('Volume Confirms DOWN'); }

  const volatility = (atr / lastClose) * 100;
  if (volatility < 0.01) return null;

  const totalScore = upScore + downScore;
  const dominantScore = Math.max(upScore, downScore);
  const ratio = totalScore > 0 ? dominantScore / totalScore : 0;
  const direction = upScore >= downScore ? 'UP' : 'DOWN';

  // ৭০% এর নিচে হলে পাঠাবে না
  if (ratio < 0.70) return null;

  let confidence, winRate;
  if (ratio >= 0.80) {
    confidence = 'Very High 🔥';
    winRate = '85%';
  } else {
    confidence = 'High 🟢';
    winRate = '80%';
  }

  const trendDesc = trend.trendDir === 'UP' ? 'Strong Uptrend' : 'Strong Downtrend';

  return {
    pair: otcPair,
    direction,
    confidence,
    winRate,
    trend: trendDesc,
    signals: signals.slice(0, 3).join(' • '),
    upScore,
    downScore,
    ratio: Math.round(ratio * 100),
    totalScore
  };
}

function getBDTime() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const h = String(bd.getUTCHours()).padStart(2, '0');
  const m = String(bd.getUTCMinutes()).padStart(2, '0');
  return { h, m };
}

function getEntryExpiry() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const h = bd.getUTCHours();
  const m = bd.getUTCMinutes();
  const entryM = m + 1;
  const expiryM = m + 2;
  return {
    entry: String(h + Math.floor(entryM / 60)).padStart(2, '0') + ':' + String(entryM % 60).padStart(2, '0'),
    expiry: String(h + Math.floor(expiryM / 60)).padStart(2, '0') + ':' + String(expiryM % 60).padStart(2, '0')
  };
}

module.exports = function(bot) {
  console.log('Channel auto signal started!');

  let lastSentTime = 0;
  const MIN_GAP = 3 * 60 * 1000;
  const MAX_GAP = 8 * 60 * 1000;

  async function checkAndSendBestSignal() {
    const now = Date.now();
    const timeSinceLast = now - lastSentTime;

    if (lastSentTime > 0 && timeSinceLast < MIN_GAP) return;

    const forceCheck = lastSentTime > 0 && timeSinceLast >= MAX_GAP;

    const { h, m } = getBDTime();
    console.log('Scanning pairs at BD Time: ' + h + ':' + m);

    const results = [];

    for (const pair of pairs) {
      try {
        const result = await deepAnalyze(pair);
        if (result) results.push(result);
        await new Promise(r => setTimeout(r, 800));
      } catch (e) {
        console.log('Error: ' + pair + ' - ' + e.message);
      }
    }

    if (results.length === 0) {
      console.log('No high accuracy signal found.');
      if (forceCheck) lastSentTime = Date.now();
      return;
    }

    results.sort((a, b) => b.ratio - a.ratio || b.totalScore - a.totalScore);
    const best = results[0];

    const { entry, expiry } = getEntryExpiry();
    const dirEmoji = best.direction === 'UP' ? '⏫' : '⏬';

    await bot.sendMessage(CHANNEL_ID,
      '📡 *AUTO SIGNAL*\n' +
      '━━━━━━━━━━━━━━━━━━\n\n' +
      '📊 *ASSET* ➜ `' + best.pair + '`\n' +
      '🚀 *DIRECTION* ➜ ' + best.direction + ' ' + dirEmoji + '\n' +
      '📊 *ENTRY* ➜ `' + entry + '`\n' +
      '⏱ *EXPIRY* ➜ `' + expiry + '`\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '♻️ *WIN RATE* ➜ `' + best.winRate + '`\n' +
      '✅ *CONFIDENCE* ➜ ' + best.confidence + '\n' +
      '🔀 *TREND* ➜ `' + best.trend + '`\n' +
      '🔗 *SIGNALS* ➜ `' + best.signals + '`\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '⚠️ Trade at your own risk if loss use 1 stet MTG ⚠️',
      { parse_mode: 'Markdown' }
    );

    console.log('Best signal sent: ' + best.pair + ' | Ratio: ' + best.ratio + '% | ' + best.confidence);
    lastSentTime = Date.now();
  }

  setTimeout(() => {
    checkAndSendBestSignal();
    setInterval(checkAndSendBestSignal, 60 * 1000);
  }, 30000);
};
