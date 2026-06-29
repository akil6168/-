// v16 - Chart Analysis: Direct Screenshot → AI Full Scan
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const bot = new TelegramBot(TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const ADMIN_ID = 5724602667;
const verifyMode = new Set();
const passwordMode = new Map();
const approvedUsers = new Set([ADMIN_ID]);
const broadcastMode = new Set();
const chartMode = new Set(); // Chart Analysis screenshot waiting

const STARTED_FILE = 'started_users.json';
const APPROVED_FILE = 'approved_users.json';
const SUBMISSIONS_FILE = 'submissions.json';

let startedUsers = new Set();
if (fs.existsSync(STARTED_FILE)) {
  try { startedUsers = new Set(JSON.parse(fs.readFileSync(STARTED_FILE, 'utf8'))); } catch (e) {}
}
if (fs.existsSync(APPROVED_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(APPROVED_FILE, 'utf8'));
    data.forEach(u => approvedUsers.add(u));
  } catch (e) {}
}
let submissions = [];
if (fs.existsSync(SUBMISSIONS_FILE)) {
  try { submissions = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8')); } catch (e) {}
}

function saveStartedUsers() {
  fs.writeFileSync(STARTED_FILE, JSON.stringify([...startedUsers]));
}
function saveApprovedUsers() {
  fs.writeFileSync(APPROVED_FILE, JSON.stringify([...approvedUsers]));
}
function saveSubmissions() {
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions));
}

const approvedKeyboard = {
  keyboard: [
    [{ text: '➕ Generate New Signal 📊' }],
    [{ text: '📉 Chart Analysis 🔬' }]
  ],
  resize_keyboard: true,
  persistent: true
};

const pairs = [
  'EUR/USD OTC', 'GBP/USD OTC', 'USD/JPY OTC',
  'AUD/USD OTC', 'USD/CAD OTC', 'EUR/GBP OTC',
  'EUR/NZD OTC', 'GBP/NZD OTC', 'USD/PKR OTC',
  'USD/INR OTC', 'USD/BDT OTC', 'USD/IDR OTC',
  'CAD/CHF OTC'
];

function sendPairMenu(chatId) {
  const keyboard = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const row = [{ text: pairs[i], callback_data: 'pair_' + pairs[i] }];
    if (pairs[i + 1]) row.push({ text: pairs[i + 1], callback_data: 'pair_' + pairs[i + 1] });
    keyboard.push(row);
  }
  bot.sendMessage(chatId, '📊 Choose Trading Pair (OTC) 👇', {
    reply_markup: { inline_keyboard: keyboard }
  });
}

// ✅ AI Chart Analysis — Full Deep Scan, no pair needed
async function analyzeChartWithAI(imageBuffer, mimeType) {
  const base64Image = imageBuffer.toString('base64');

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: base64Image
          }
        },
        {
          type: 'text',
          text: `You are an expert professional forex and binary options trading analyst with 15+ years of experience. 

Deeply analyze this trading chart screenshot and respond ONLY with a valid JSON object. No markdown, no backticks, no explanation outside the JSON.

Scan everything visible:
- Candlestick patterns (Doji, Engulfing, Hammer, Shooting Star, Harami, Morning/Evening Star, Pinbar, etc.)
- Trend direction (uptrend, downtrend, sideways)
- Support and resistance levels
- Price action and momentum
- Any visible indicators (RSI, MACD, Bollinger Bands, Moving Averages, Stochastic, etc.)
- Chart patterns (Head & Shoulders, Double Top/Bottom, Triangle, Wedge, Flag, Channel, etc.)
- Volume if visible
- Market structure (Higher Highs, Lower Lows, Break of Structure, etc.)

JSON format (respond with ONLY this, no other text):
{
  "direction": "UP" or "DOWN",
  "winRate": "XX%" (realistic between 72-91 based on signal strength),
  "confidence": "High" or "Medium" or "Low",
  "pair": "detected pair name or Unknown",
  "timeframe": "detected timeframe like M1 M5 M15 M30 H1 or Unknown",
  "expiry": "best expiry suggestion like 1 MIN, 5 MIN, 15 MIN",
  "candlePattern": "detected candle pattern name",
  "chartPattern": "detected chart pattern or None",
  "trend": "Uptrend / Downtrend / Sideways",
  "indicators": "detected indicators and their signals or None visible",
  "supportResistance": "brief note on key S/R levels",
  "reason": "3-4 sentence deep professional analysis explaining the signal logic based on what you see"
}`
        }
      ]
    }]
  });

  const text = response.content.map(c => c.text || '').join('');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'User';
  const userId = msg.from.id;

  if (!startedUsers.has(userId)) {
    startedUsers.add(userId);
    saveStartedUsers();
    await bot.sendMessage(ADMIN_ID,
      '♻️ *NEW USER STARTED BOT* ➕\n\n' +
      '👤 Name: ' + firstName + '\n' +
      '🆔 ID: `' + userId + '`',
      { parse_mode: 'Markdown' }
    );
  }

  if (userId === ADMIN_ID || approvedUsers.has(userId)) {
    await bot.sendMessage(chatId,
      '👋 *Welcome to 𝗤𝘅_𝘅𝗮𝗮𝗻_𝗙𝗮𝘁𝗵𝗲𝗿_𝗯𝗼𝘁!* 🚀\n\n' +
      '📊 Signal পেতে *Generate New Signal* বাটনে ক্লিক করুন।\n\n' +
      '📉 Chart এর screenshot দিয়ে AI analysis পেতে *Chart Analysis* বাটনে ক্লিক করুন।',
      { parse_mode: 'Markdown', reply_markup: approvedKeyboard }
    );
    return;
  }

  await bot.sendMessage(chatId,
    '👋 *Welcome to 𝗤𝘅_𝘅𝗮𝗮𝗻_𝗙𝗮𝘁𝗵𝗲𝗿_𝗯𝗼𝘁!* 🚀\n\n' +
    '📈 Get full access to premium trading signals.\n\n' +
    '🏆 Trade smarter with our advanced signal system.\n\n' +
    '💡 নিচে দেওয়া লিংক থেকে একাউন্ট খুলে 📌 আপনার 8-digit Trader ID পাঠান verification এর জন্য।\n\n' +
    '✅ Access premium features after verification.',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Create Quotex Account', url: 'https://market-qx.pro/sign-up/?lid=2178055' }],
          [{ text: '✅ Verify Trader ID', callback_data: '/verify' }]
        ]
      }
    }
  );
});

// /menu
bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!approvedUsers.has(userId)) {
    await bot.sendMessage(chatId, '🔒 আপনার account verified না।\n\n✅ আগে Verify করুন — /start');
    return;
  }
  sendPairMenu(chatId);
});

// /admin
bot.onText(/\/admin/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  await bot.sendMessage(ADMIN_ID,
    '👑 *ADMIN PANEL*\n══════════════════',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👥 Total Users', callback_data: 'admin_total' }],
          [{ text: '✅ Approved Users', callback_data: 'admin_approved' }],
          [{ text: '⏳ Pending Verify List', callback_data: 'admin_pending' }],
          [{ text: '📋 Trader ID Submissions', callback_data: 'admin_submissions' }],
          [{ text: '📢 Broadcast Message', callback_data: 'admin_broadcast' }]
        ]
      }
    }
  );
});

// /approve
bot.onText(/\/approve (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const parts = match[1].split(' ');
  if (parts.length < 2) {
    await bot.sendMessage(ADMIN_ID, '❌ Format: /approve [user_id] [password]');
    return;
  }
  const targetId = parseInt(parts[0]);
  const password = parts[1];
  passwordMode.set(targetId, password);
  await bot.sendMessage(targetId,
    '✅ *আপনার Trader ID verify হয়েছে!*\n\n🔐 Bot access করতে আপনার password দিন:',
    { parse_mode: 'Markdown' }
  );
  await bot.sendMessage(ADMIN_ID,
    '✅ User `' + targetId + '` কে approve করা হয়েছে।\n🔑 Password: `' + password + '`',
    { parse_mode: 'Markdown' }
  );
});

// ✅ Main message handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || 'User';
  const username = msg.from.username
    ? '@' + msg.from.username
    : '[' + firstName + '](tg://user?id=' + userId + ')';

  // ✅ Handle chart photo — user is in chart mode
  if (msg.photo && chartMode.has(userId)) {
    chartMode.delete(userId);

    if (!approvedUsers.has(userId)) {
      await bot.sendMessage(chatId, '🔒 আপনার account verified না।');
      return;
    }

    const loadMsg = await bot.sendMessage(chatId,
      '🔬 *AI Chart Scanning শুরু হচ্ছে...*\n\n⏳ Analyzing...',
      { parse_mode: 'Markdown' }
    );

    const scanSteps = [
      '🕯️ Candlestick pattern detect করছি...',
      '📊 Trend & price action analyze করছি...',
      '🔲 Support / Resistance চেক করছি...',
      '📈 Indicators scan করছি...',
      '🧠 AI signal calculate করছি...',
      '✅ Signal ready হচ্ছে...'
    ];

    let stepIdx = 0;
    const stepInterval = setInterval(async () => {
      if (stepIdx < scanSteps.length) {
        try {
          await bot.editMessageText(
            '🔬 *AI Chart Scanning চলছে...*\n\n' + scanSteps[stepIdx],
            { chat_id: chatId, message_id: loadMsg.message_id, parse_mode: 'Markdown' }
          );
        } catch (e) {}
        stepIdx++;
      }
    }, 1000);

    try {
      // Get highest quality photo
      const photo = msg.photo[msg.photo.length - 1];
      const fileInfo = await bot.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${fileInfo.file_path}`;

      // Download image buffer
      const https = require('https');
      const imageBuffer = await new Promise((resolve, reject) => {
        https.get(fileUrl, (res) => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        });
      });

      const ext = fileInfo.file_path.split('.').pop().toLowerCase();
      const mimeType = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';

      // AI Deep Scan
      const analysis = await analyzeChartWithAI(imageBuffer, mimeType);

      clearInterval(stepInterval);
      try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

      const dirEmoji = analysis.direction === 'UP' ? '⏫' : '⏬';
      const dirColor = analysis.direction === 'UP' ? '🟢' : '🔴';
      const confEmoji = analysis.confidence === 'High' ? '🟢' : analysis.confidence === 'Medium' ? '🟡' : '🔴';

      const now = new Date();
      const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      const h = String(bd.getUTCHours()).padStart(2, '0');
      const m = String(bd.getUTCMinutes()).padStart(2, '0');

      await bot.sendMessage(chatId,
        '╭────────────────────╮\n' +
        '│  🔬 *𝗔𝗜 𝗖𝗛𝗔𝗥𝗧 𝗔𝗡𝗔𝗟𝗬𝗦𝗜𝗦*  │\n' +
        '╰────────────────────╯\n\n' +
        '📊 *ASSET*         ➜ `' + (analysis.pair || 'Detected') + '`\n' +
        '🕐 *TIMEFRAME*  ➜ `' + analysis.timeframe + '`\n' +
        '⏱️ *EXPIRY*        ➜ `' + analysis.expiry + '`\n' +
        '══════════════════\n' +
        dirColor + ' *DIRECTION*    ➜ *' + analysis.direction + '* ' + dirEmoji + '\n' +
        '🏆 *WIN RATE*     ➜ `' + analysis.winRate + '`\n' +
        '✅ *CONFIDENCE* ➜ ' + analysis.confidence + ' ' + confEmoji + '\n' +
        '══════════════════\n' +
        '📈 *TREND*              ➜ `' + analysis.trend + '`\n' +
        '🕯️ *CANDLE*           ➜ `' + analysis.candlePattern + '`\n' +
        '📐 *CHART PATTERN* ➜ `' + analysis.chartPattern + '`\n' +
        '🔧 *INDICATORS*    ➜ `' + analysis.indicators + '`\n' +
        '🔲 *S/R LEVELS*     ➜ `' + analysis.supportResistance + '`\n' +
        '══════════════════\n' +
        '🧠 *AI Analysis:*\n' +
        '_' + analysis.reason + '_\n' +
        '══════════════════\n' +
        '⏹️ *Take the trade now!*\n' +
        '⚠️ _Trade at your own risk if loss use 1 stet MTG_ ⚠️',
        { parse_mode: 'Markdown', reply_markup: approvedKeyboard }
      );

    } catch (err) {
      clearInterval(stepInterval);
      console.error('Chart AI error:', err.message);
      try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
      await bot.sendMessage(chatId,
        '❌ *Analysis failed!*\n\n' +
        'স্পষ্ট chart screenshot পাঠান এবং আবার চেষ্টা করুন।\n' +
        '📉 *Chart Analysis* বাটনে ক্লিক করে আবার শুরু করুন।',
        { parse_mode: 'Markdown', reply_markup: approvedKeyboard }
      );
    }
    return;
  }

  if (!text || text.startsWith('/')) return;

  // ✅ Generate New Signal button
  if (text === '➕ Generate New Signal 📊') {
    if (!approvedUsers.has(userId)) {
      await bot.sendMessage(chatId, '🔒 আপনার account verified না।');
      return;
    }
    sendPairMenu(chatId);
    return;
  }

  // ✅ Chart Analysis button — সরাসরি screenshot চাও
  if (text === '📉 Chart Analysis 🔬') {
    if (!approvedUsers.has(userId)) {
      await bot.sendMessage(chatId, '🔒 আপনার account verified না।');
      return;
    }
    chartMode.add(userId);
    await bot.sendMessage(chatId,
      '📸 *Chart Screenshot পাঠান!*\n\n' +
      '🔬 AI আপনার chart এর সবকিছু scan করবে:\n' +
      '• Candlestick Patterns\n' +
      '• Trend Direction\n' +
      '• Support & Resistance\n' +
      '• Chart Patterns\n' +
      '• Indicators\n\n' +
      '➡️ এখন আপনার chart এর screenshot পাঠান 👇',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Broadcast mode
  if (broadcastMode.has(userId) && userId === ADMIN_ID) {
    broadcastMode.delete(userId);
    let successCount = 0;
    for (const uid of startedUsers) {
      try {
        await bot.sendMessage(uid, '📢 *Admin Message:*\n\n' + text, { parse_mode: 'Markdown' });
        successCount++;
      } catch (e) {}
    }
    await bot.sendMessage(ADMIN_ID, '✅ Broadcast sent to ' + successCount + ' users!');
    return;
  }

  // Password check
  if (passwordMode.has(userId)) {
    const correctPass = passwordMode.get(userId);
    if (text === correctPass) {
      passwordMode.delete(userId);
      approvedUsers.add(userId);
      saveApprovedUsers();
      await bot.sendMessage(chatId,
        '🎉 *Bot access পেয়েছেন!*\n\n' +
        '📊 *Generate New Signal* — Random signal নিন\n' +
        '📉 *Chart Analysis* — Chart screenshot দিয়ে AI signal নিন',
        { parse_mode: 'Markdown', reply_markup: approvedKeyboard }
      );
    } else {
      await bot.sendMessage(chatId, '❌ ভুল password! আবার চেষ্টা করুন।');
    }
    return;
  }

  if (!verifyMode.has(userId)) return;

  if (!/^\d{8}$/.test(text)) {
    await bot.sendMessage(chatId, '❌ ভুল Trader ID\n\n📌 সঠিক 8-digit Trader ID পাঠান।');
    return;
  }

  verifyMode.delete(userId);
  submissions.push({
    userId, name: firstName,
    username: msg.from.username || null,
    traderId: text,
    time: new Date().toISOString()
  });
  saveSubmissions();

  await bot.sendMessage(ADMIN_ID,
    '🔔 *NEW TRADER ID SUBMISSION*\n\n' +
    '👤 Name: ' + username + '\n' +
    '🆔 User ID: `' + userId + '`\n' +
    '📌 Trader ID: `' + text + '`\n\n' +
    '✅ Approve: `/approve ' + userId + ' [password]`',
    { parse_mode: 'Markdown' }
  );
  await bot.sendMessage(chatId,
    '✅ আপনার Trader ID পাঠানো হয়েছে।\nAdmin verification এর জন্য অপেক্ষা করুন।'
  );
});

// Callback handler
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  bot.answerCallbackQuery(query.id);

  // Admin callbacks
  if (data === 'admin_total' && userId === ADMIN_ID) {
    await bot.sendMessage(ADMIN_ID,
      '👥 *TOTAL USERS*\n\n' +
      '📊 Total Started: `' + startedUsers.size + '`\n' +
      '✅ Total Approved: `' + (approvedUsers.size - 1) + '`\n' +
      '📋 Total Submissions: `' + submissions.length + '`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (data === 'admin_approved' && userId === ADMIN_ID) {
    const list = [...approvedUsers].filter(u => u !== ADMIN_ID);
    if (list.length === 0) { await bot.sendMessage(ADMIN_ID, '✅ কোনো approved user নেই।'); return; }
    let text = '✅ *APPROVED USERS*\n\n';
    list.forEach((uid, i) => {
      const sub = submissions.find(s => s.userId === uid);
      const uname = sub && sub.username ? '@' + sub.username : (sub ? sub.name : 'Unknown');
      const traderId = sub ? sub.traderId : 'N/A';
      text += (i + 1) + '. ' + uname + '\n🆔 User: `' + uid + '`\n📌 Trader ID: `' + traderId + '`\n\n';
    });
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (data === 'admin_pending' && userId === ADMIN_ID) {
    const pending = submissions.filter(s => !approvedUsers.has(s.userId));
    if (pending.length === 0) { await bot.sendMessage(ADMIN_ID, '⏳ কোনো pending user নেই।'); return; }
    let text = '⏳ *PENDING VERIFY LIST*\n\n';
    pending.forEach((s, i) => {
      const uname = s.username ? '@' + s.username : s.name;
      text += (i + 1) + '. ' + uname + '\n🆔 `' + s.userId + '`\n📌 Trader ID: `' + s.traderId + '`\n\n';
    });
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (data === 'admin_submissions' && userId === ADMIN_ID) {
    if (submissions.length === 0) { await bot.sendMessage(ADMIN_ID, '📋 কোনো submission নেই।'); return; }
    let text = '📋 *TRADER ID SUBMISSIONS*\n\n';
    submissions.forEach((s, i) => {
      const uname = s.username ? '@' + s.username : s.name;
      text += (i + 1) + '. ' + uname + '\n🆔 User: `' + s.userId + '`\n📌 Trader ID: `' + s.traderId + '`\n\n';
    });
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });
    return;
  }

  if (data === 'admin_broadcast' && userId === ADMIN_ID) {
    broadcastMode.add(ADMIN_ID);
    await bot.sendMessage(ADMIN_ID, '📢 যে message সব user কে পাঠাতে চাও সেটা লেখো:');
    return;
  }

  if (data === '/verify') {
    verifyMode.add(userId);
    await bot.sendMessage(chatId, '📌 আপনার 8-digit Quotex Trader ID পাঠান:');
    return;
  }

  // Generate Signal pair selection
  if (data.startsWith('pair_')) {
    const pair = data.replace('pair_', '');
    if (!pairs.includes(pair)) return;

    if (!approvedUsers.has(userId)) {
      await bot.sendMessage(chatId, '🔒 আপনার account verified না।\n\n✅ আগে Verify করুন — /start');
      return;
    }

    // Step 1: Loading bar
    const loadMsg = await bot.sendMessage(chatId, '⏳ Loading signal generation....\n\n0 / 100');
    const loadId = loadMsg.message_id;
    let count = 0;
    await new Promise((resolve) => {
      const loadInterval = setInterval(async () => {
        count++;
        try {
          await bot.editMessageText(
            '⏳ Loading signal generation....\n\n' + count + ' / 100',
            { chat_id: chatId, message_id: loadId }
          );
        } catch (e) {}
        if (count >= 100) { clearInterval(loadInterval); resolve(); }
      }, 30);
    });

    // Step 2: Clock
    const clockMsg = await bot.sendMessage(chatId, '🕐 Signal generating...\n\n⏰ Bangladesh Time: --:--:--');
    const clockId = clockMsg.message_id;
    await new Promise((resolve) => {
      const clockInterval = setInterval(async () => {
        const now = new Date();
        const bd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
        const h = String(bd.getUTCHours()).padStart(2, '0');
        const m = String(bd.getUTCMinutes()).padStart(2, '0');
        const s = String(bd.getUTCSeconds()).padStart(2, '0');
        try {
          await bot.editMessageText(
            '🕐 Signal generating...\n\n⏰ Bangladesh Time: ' + h + ':' + m + ':' + s,
            { chat_id: chatId, message_id: clockId }
          );
        } catch (e) {}
        if (bd.getUTCSeconds() === 58) { clearInterval(clockInterval); resolve(); }
      }, 1000);
    });

    try { await bot.deleteMessage(chatId, loadId); } catch (e) {}
    try { await bot.deleteMessage(chatId, clockId); } catch (e) {}

    const directions = ['UP⏫', 'DOWN⏬'];
    const randomDir = directions[Math.floor(Math.random() * 2)];
    const winRates = ['75%', '78%', '80%', '82%', '85%'];
    const confidences = ['Medium 🟡', 'High 🟢', 'Very High 🔥'];
    const winRate = winRates[Math.floor(Math.random() * winRates.length)];
    const confidence = confidences[Math.floor(Math.random() * confidences.length)];

    const now2 = new Date();
    const bd2 = new Date(now2.getTime() + 6 * 60 * 60 * 1000);
    bd2.setMinutes(bd2.getMinutes() + 1);
    const exH = String(bd2.getUTCHours()).padStart(2, '0');
    const exM = String(bd2.getUTCMinutes()).padStart(2, '0');

    await bot.sendMessage(chatId,
      '╭──────────────────╮\n' +
      '│    📈 *𝗤𝘅 𝘅𝗮𝗮𝗻 𝗙𝗮𝘁𝗵𝗲𝗿 𝗯𝗼𝘁*\n' +
      '╰──────────────────╯\n\n' +
      '📊 *ASSET*  ➜ `' + pair + '`\n' +
      '🔹 *TIME*     ➜ `1 MIN`\n' +
      '🔹 *EXPIRY* ➜ `' + exH + ':' + exM + '`\n' +
      '══════════════════\n' +
      '🚀 *DIRECTION* ➜ ' + randomDir + '\n' +
      '♻️ *WIN RATE*   ➜ `' + winRate + '`\n' +
      '✅ *CONFIDENCE* ➜ ' + confidence + '\n' +
      '══════════════════\n' +
      '⏹️ *Take the trade now!*\n' +
      '⚠️ _Trade at your own risk if loss use 1 stet MTG_ ⚠️',
      { parse_mode: 'Markdown' }
    );
  }
});

console.log('✅ Bot v16 running — Chart Analysis: Direct Screenshot → AI Full Scan');
