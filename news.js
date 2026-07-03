// news.js - Forex News Alert
const https = require('https');

const CHANNEL_ID = '-1002427080688';
const FCS_API_KEY = process.env.FCS_API_KEY || 'yPv9YcoqIIHFWTJM8kB6o61ul';

let newsAlertActive = false;

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

async function getForexNews() {
  try {
    const url = `https://fcsapi.com/api-v3/forex/economy_cal?period=today&access_key=${FCS_API_KEY}`;
    const data = await fetchJSON(url);
    if (!data.response || !Array.isArray(data.response)) return [];
    return data.response;
  } catch (e) {
    console.log('News fetch error: ' + e.message);
    return [];
  }
}

function getBDTime() {
  const now = new Date();
  return new Date(now.getTime() + 6 * 60 * 60 * 1000);
}

function getImpactEmoji(impact) {
  if (!impact) return 'LOW 🟢';
  const i = impact.toLowerCase();
  if (i === 'high') return 'HIGH 🔴';
  if (i === 'medium') return 'MEDIUM 🟡';
  return 'LOW 🟢';
}

module.exports = function(bot) {
  console.log('News alert system started!');

  const alertedNews = new Set();

  async function checkNews() {
    try {
      const newsList = await getForexNews();
      if (!newsList || newsList.length === 0) return;

      const now = getBDTime();

      for (const news of newsList) {
        // শুধু high impact news
        if (!news.impact || news.impact.toLowerCase() !== 'high') continue;

        const newsId = news.id || (news.title + news.date);
        if (alertedNews.has(newsId)) continue;

        // News এর time
        let newsTime;
        try {
          newsTime = new Date(news.date);
          if (isNaN(newsTime.getTime())) continue;
        } catch (e) { continue; }

        const bdNewsTime = new Date(newsTime.getTime() + 6 * 60 * 60 * 1000);
        const diffMs = bdNewsTime - now;
        const diffMin = diffMs / (60 * 1000);

        // ২৫-৩৫ মিনিট আগে alert পাঠাবে
        if (diffMin >= 25 && diffMin <= 35) {
          alertedNews.add(newsId);
          newsAlertActive = true;

          const h = String(bdNewsTime.getUTCHours()).padStart(2, '0');
          const m = String(bdNewsTime.getUTCMinutes()).padStart(2, '0');

          await bot.sendMessage(CHANNEL_ID,
            '⚠️ *HIGH IMPACT NEWS ALERT*\n' +
            '━━━━━━━━━━━━━━━━━━\n\n' +
            '🗞 *' + (news.country || 'USD') + '* — ' + (news.title || 'News') + '\n' +
            '⏰ *Time:* `' + h + ':' + m + ' (BD Time)`\n' +
            '📊 *Impact:* ' + getImpactEmoji(news.impact) + '\n\n' +
            (news.forecast ? '📈 *Forecast:* `' + news.forecast + '`\n' : '') +
            (news.previous ? '📉 *Previous:* `' + news.previous + '`\n' : '') +
            '\n⛔ *এই সময়ে trade করবেন না!*\n' +
            '💥 Market volatile থাকবে।\n' +
            '━━━━━━━━━━━━━━━━━━',
            { parse_mode: 'Markdown' }
          );

          console.log('News alert sent: ' + (news.title || 'Unknown'));

          // News শেষ হওয়ার ৩০ মিনিট পরে signal আবার চালু
          const waitMs = diffMs + (30 * 60 * 1000);
          setTimeout(async () => {
            newsAlertActive = false;
            try {
              await bot.sendMessage(CHANNEL_ID,
                '✅ *News শেষ হয়েছে!*\n\n' +
                '📊 𝗤𝘅 𝗔𝗜 𝗣𝗿𝗲𝗱𝗶𝗰𝘁𝗼𝗿 𝗩𝗜𝗣 𝗯𝗼𝘁 আবার signal দিচ্ছে।',
                { parse_mode: 'Markdown' }
              );
            } catch (e) {}
            console.log('Signal resumed after news.');
          }, waitMs);
        }
      }
    } catch (e) {
      console.log('News check error: ' + e.message);
    }
  }

  // প্রতি ৫ মিনিটে news check
  setTimeout(() => {
    checkNews();
    setInterval(checkNews, 5 * 60 * 1000);
  }, 10000);

  return {
    isNewsActive: () => newsAlertActive
  };
};
