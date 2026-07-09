// twelvedata.js - Shared TwelveData API client with key rotation
// Loads all TWELVE_DATA_KEY / TWELVE_DATA_KEY_1 ... _9 env vars and
// round-robins between them so a single key never eats the whole
// rate limit (8 req/min, 800 req/day per free-tier key).

const https = require('https');

const KEYS = [
  process.env.TWELVE_DATA_KEY_11,
  process.env.TWELVE_DATA_KEY_12,
  process.env.TWELVE_DATA_KEY_13,
  process.env.TWELVE_DATA_KEY_14,
  process.env.TWELVE_DATA_KEY_15,
].filter(Boolean);

if (KEYS.length === 0) {
  console.warn('⚠️ কোনো TWELVE_DATA_KEY* env var পাওয়া যায়নি! API calls fail হবে।');
} else {
  console.log(`✅ TwelveData key rotation চালু — মোট ${KEYS.length}টা key লোড হয়েছে।`);
}

// per-key cooldown tracking (timestamp until which a key should be skipped)
const cooldownUntil = new Map();
let cursor = 0;

function nextKey() {
  const now = Date.now();
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[cursor % KEYS.length];
    cursor++;
    const cd = cooldownUntil.get(key) || 0;
    if (cd <= now) return key;
  }
  // সব key cooldown এ থাকলে, প্রথমটাই দাও (retry করাই ভালো, কিছু না করার চেয়ে)
  return KEYS[cursor % KEYS.length];
}

function markRateLimited(key, seconds = 65) {
  cooldownUntil.set(key, Date.now() + seconds * 1000);
}

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

// পুরো KEYS list এ round-robin ভাবে চেষ্টা করবো, rate-limit পেলে পরের key তে যাবো
async function callWithRotation(buildUrl, maxAttempts) {
  if (KEYS.length === 0) throw new Error('No TwelveData API key configured');
  const attempts = maxAttempts || KEYS.length;
  let lastErr;

  for (let i = 0; i < attempts; i++) {
    const key = nextKey();
    const url = buildUrl(key);
    try {
      const data = await fetchJSON(url);

      if (data && data.status === 'error') {
        const msg = (data.message || '').toLowerCase();
        const isRateLimit = data.code === 429 || msg.includes('limit') || msg.includes('run out of api credits');
        if (isRateLimit) {
          markRateLimited(key);
          lastErr = new Error('Rate limited: ' + data.message);
          continue; // পরের key দিয়ে retry
        }
        // অন্য error (invalid symbol ইত্যাদি) — retry করে লাভ নেই
        throw new Error(data.message || 'TwelveData error');
      }

      return data;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw lastErr || new Error('All TwelveData keys exhausted');
}

async function getTimeSeries(symbol, interval = '1min', outputsize = 30) {
  return callWithRotation(key =>
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${key}`
  );
}

async function getPrice(symbol) {
  return callWithRotation(key =>
    `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${key}`
  );
}

module.exports = { getTimeSeries, getPrice, keyCount: KEYS.length };
