// news.js - Forex News Alert
const https = require('https');

const CHANNEL_ID = '-1002427080688';
const FCS_API_KEY = process.env.FCS_API_KEY || 'yPv9YcoqIIHFWTJM8kB6o61ul';

let newsAlertActive = false; // news চলাকালীন signal বন্ধ থাকবে

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
  const url = `https://fcsapi.com/api-v3/forex/economy_cal?period=today&access_key=${FCS_API_KEY}`;
  const data = await fetchJSON(url);
  if (!data.response || !Array.isArray(data.response)) return [];
  return data.response;
}

function getBDTime() {
  const now = new Date();
  const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return bd;
}

function formatBDTime(dateStr) {
  const d = new Date(dateStr);
  const bd = new Date(d.getTime() + 6 * 60 * 60 * 1000);
  const h = String(bd.getUTCHours()).padStart(2, '0');
  const m = String(bd.getUTCMinutes()).padStart(2, '0');
  return h + ':' + m + ' PM (BD)';
}

function getImpactEmoji(impact) {
  if (impact === 'high') return 'HIGH 🔴';
  if (impact === 'medium') return 'MEDIUM 🟡';
  return 'LOW 🟢';
}

module.exports = function(bot) {
  console.log('News alert system started!');

  const alertedNews = new Set();

  async function checkNews() {
    try {
      const newsList = await getForexNews();
      const now = getBDTime();

      for (const news of newsList) {
        // শুধু high impact news
        if (!news.impact || news.impact.toLowerCase() !== 'high') continue;

        const newsId = news.id || (news.title + news.date);
        if (alertedNews.has(newsId)) continue;

        // News এর time
        const newsTime = new Date(news.date);
        const bdNewsTime = new Date(newsTime.getTime() + 6 * 60 * 60 * 1000);

        // এখন থেকে news এর time পর্যন্ত কত মিনিট বাকি
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
            '🗞 *' + (news.country || 'USD') + '* - ' + news.title + '\n' +
            '⏰ *Time:* `' + h + ':' + m + ' (BD Time)`\n' +
            '📊 *Impact:* ' + getImpactEmoji(news.impact) + '\n\n' +
            (news.forecast ? '📈 *Forecast:* `' + news.forecast + '`\n' : '') +
            (news.previous ? '📉 *Previous:* `' + news.previous + '`\n' : '') +
            '\n⛔ *এই সময়ে trade করবেন না!*\n' +
            '💥 Market volatile থাকবে।\n' +
            '━━━━━━━━━━━━━━━━━━',
            { parse_mode: 'Markdown' }
          );

          console.log('News alert sent: ' + news.title);

          // News শেষ হওয়ার পরে signal আবার চালু করবো
          const waitMs = diffMs + (30 * 60 * 1000); // news time + 30 মিনিট পরে
          setTimeout(async () => {
            newsAlertActive = false;
            await bot.sendMessage(CHANNEL_ID,
              '✅ *News শেষ হয়েছে!*\n\n' +
              '📊 𝗤𝘅 𝗔𝗜 𝗣𝗿𝗲𝗱𝗶𝗰𝘁𝗼𝗿 𝗩𝗜𝗣 𝗯𝗼𝘁 আবার চালু হয়েছে।',
              { parse_mode: 'Markdown' }
            );
            console.log('Signal resumed after news: ' + news.title);
          }, waitMs);
        }
      }
    } catch (e) {
      console.log('News check error: ' + e.message);
    }
  }

  // প্রতি 5 মিনিটে news check করবে
  setTimeout(() => {
    checkNews();
    setInterval(checkNews, 5 * 60 * 1000);
  }, 10000);

  // newsAlertActive export করবো যাতে channel.js ব্যবহার করতে পারে
  return {
    isNewsActive: () => newsAlertActive
  };
};
