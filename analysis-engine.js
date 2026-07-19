const twelveData = require('./twelvedata');

function calcEMA(candles, period) {
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
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

function calcMACD(candles) {
  const ema12 = calcEMA(candles, 12);
  const ema26 = calcEMA(candles, 26);
  const macdLine = ema12 - ema26;
  const macdSeries = [];
  for (let i = 26; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    macdSeries.push(calcEMA(slice, 12) - calcEMA(slice, 26));
  }
  const signalLine = macdSeries.length >= 9
    ? calcEMA(macdSeries.slice(-9).map(v => ({ close: v })), 9)
    : macdLine;
  return { macdLine, signalLine, histogram: macdLine - signalLine };
}

function calcBollinger(candles, period = 20) {
  const slice = candles.slice(-period);
  const mean = slice.reduce((s, c) => s + c.close, 0) / slice.length;
  const variance = slice.reduce((s, c) => s + Math.pow(c.close - mean, 2), 0) / slice.length;
  const stdDev = Math.sqrt(variance);
  const lastClose = candles[candles.length - 1].close;
  return {
    upper: mean + 2 * stdDev,
    lower: mean - 2 * stdDev,
    mean,
    position: (lastClose - mean) / (stdDev || 1),
  };
}

function analyzePriceAction(candles) {
  const len = candles.length;
  const c = candles[len - 1];
  const p = candles[len - 2];
  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.close, c.open);
  const lowerWick = Math.min(c.close, c.open) - c.low;
  const isBullish = c.close > c.open;
  const isBearish = c.close < c.open;

  if (isBullish && p.close < p.open && c.close > p.open && c.open < p.close)
    return { pattern: 'Bullish Engulfing', direction: 'UP' };
  if (isBearish && p.close > p.open && c.open > p.close && c.close < p.open)
    return { pattern: 'Bearish Engulfing', direction: 'DOWN' };
  if (lowerWick > body * 2 && upperWick < body * 0.5)
    return { pattern: 'Bullish Pin Bar', direction: 'UP' };
  if (upperWick > body * 2 && lowerWick < body * 0.5)
    return { pattern: 'Bearish Pin Bar', direction: 'DOWN' };
  if (body < (c.high - c.low) * 0.1)
    return { pattern: 'Doji', direction: 'NEUTRAL' };
  return { pattern: 'No clear pattern', direction: 'NEUTRAL' };
}

function calcADX(candles, period = 14) {
  if (candles.length < period + 1) return 0;
  let trSum = 0, plusDMSum = 0, minusDMSum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const cur = candles[i], prev = candles[i - 1];
    const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    const plusDM = (upMove > downMove && upMove > 0) ? upMove : 0;
    const minusDM = (downMove > upMove && downMove > 0) ? downMove : 0;
    trSum += tr; plusDMSum += plusDM; minusDMSum += minusDM;
  }
  if (trSum === 0) return 0;
  const plusDI = (plusDMSum / trSum) * 100;
  const minusDI = (minusDMSum / trSum) * 100;
  const diDiff = Math.abs(plusDI - minusDI);
  const diSum = plusDI + minusDI;
  return diSum === 0 ? 0 : (diDiff / diSum) * 100;
}

function scoreTimeframe(candles) {
  const rsi = calcRSI(candles);
  const ema5 = calcEMA(candles, 5);
  const ema20 = calcEMA(candles, 20);
  const macd = calcMACD(candles);
  const bb = calcBollinger(candles);
  const pa = analyzePriceAction(candles);
  const adx = calcADX(candles);
  const lastClose = candles[candles.length - 1].close;

  let upScore = 0, downScore = 0;

  if (ema5 > ema20 && lastClose > ema5) upScore += 2;
  else if (ema5 < ema20 && lastClose < ema5) downScore += 2;

  if (rsi < 35) upScore += 2;
  else if (rsi > 65) downScore += 2;
  else if (rsi < 50) upScore += 1;
  else downScore += 1;

  if (macd.histogram > 0) upScore += 2;
  else if (macd.histogram < 0) downScore += 2;

  if (bb.position < -1.5) upScore += 1;
  else if (bb.position > 1.5) downScore += 1;

  if (pa.direction === 'UP') upScore += 3;
  else if (pa.direction === 'DOWN') downScore += 3;

  const totalScore = upScore + downScore;
  const direction = upScore >= downScore ? 'UP' : 'DOWN';
  const dominantScore = Math.max(upScore, downScore);
  const agreement = totalScore > 0 ? dominantScore / totalScore : 0.5;

  return { direction, agreement, adx, rsi, macdHistogram: macd.histogram, pattern: pa.pattern, trend: ema5 > ema20 ? 'UP' : 'DOWN' };
}

// ফাইন-টিউন করা থ্রেশহোল্ড — আগের চেয়ে একটু শিথিল, যাতে ভালো (কিন্তু পারফেক্ট না) সেটআপেও সিগন্যাল আসে
const MIN_AGREEMENT = 0.62;
const MIN_ADX = 14;
const STRONG_SINGLE_TF_AGREEMENT = 0.75; // এক টাইমফ্রেমে যথেষ্ট শক্তিশালী হলে mismatch সত্ত্বেও বিবেচনা করা হবে

async function analyze(symbol) {
  const [m1, m5] = await Promise.all([
    twelveData.getTimeSeries(symbol, '1min', 40),
    twelveData.getTimeSeries(symbol, '5min', 40),
  ]);

  const toCandles = (data) => data.values.map(v => ({
    open: parseFloat(v.open), high: parseFloat(v.high),
    low: parseFloat(v.low), close: parseFloat(v.close),
    datetime: v.datetime,
  })).reverse();

  const candles1m = toCandles(m1);
  const candles5m = toCandles(m5);

  const score1m = scoreTimeframe(candles1m);
  const score5m = scoreTimeframe(candles5m);

  let finalDirection = null;

  if (score1m.direction === score5m.direction) {
    finalDirection = score1m.direction;
  } else if (score1m.agreement >= STRONG_SINGLE_TF_AGREEMENT) {
    // 1m নিজেই যথেষ্ট শক্তিশালী — 5m-এর সাথে না মিললেও এগিয়ে যাওয়া যাবে
    finalDirection = score1m.direction;
  } else if (score5m.agreement >= STRONG_SINGLE_TF_AGREEMENT) {
    finalDirection = score5m.direction;
  } else {
    return { signal: false, reason: 'TIMEFRAME_MISMATCH', detail: { m1: score1m, m5: score5m } };
  }

  if (score1m.adx < MIN_ADX) {
    return { signal: false, reason: 'SIDEWAYS_MARKET', detail: { adx: score1m.adx } };
  }

  const relevantAgreement = finalDirection === score1m.direction ? score1m.agreement : score5m.agreement;

  if (relevantAgreement < MIN_AGREEMENT) {
    return { signal: false, reason: 'LOW_AGREEMENT', detail: { agreement: relevantAgreement } };
  }

  const confidencePct = Math.round(relevantAgreement * 100);

  return {
    signal: true,
    direction: finalDirection === 'UP' ? 'UP⏫' : 'DOWN⏬',
    confidencePct,
    symbol,
    detail: {
      m1Agreement: (score1m.agreement * 100).toFixed(1),
      m5Agreement: (score5m.agreement * 100).toFixed(1),
      adx: score1m.adx.toFixed(1),
      rsi: score1m.rsi.toFixed(1),
      pattern: score1m.pattern,
    },
  };
}

module.exports = { analyze, scoreTimeframe, calcRSI, calcEMA, calcMACD, calcBollinger, calcADX, analyzePriceAction };
