const analysisEngine = require('./analysis-engine');
const twelveData = require('./twelvedata');

function addScanRoute(app, deps) {
  const { approvedUsers, bannedUsers, validateInitData } = deps;
  const ADMIN_ID = 5724602667;

  function checkAuth(req) {
    const { initData } = req.body;
    if (!initData) return null;
    const botToken = process.env.BOT_TOKEN;
    const tgUser = validateInitData(initData, botToken);
    if (!tgUser) return null;
    const userId = tgUser.id;
    if (bannedUsers.has(userId)) return null;
    const isAdmin = userId === ADMIN_ID;
    const isApproved = isAdmin || approvedUsers.has(userId);
    if (!isApproved) return null;
    return tgUser;
  }

  app.post('/miniapp/scan', async (req, res) => {
    try {
      const { symbol } = req.body;
      const tgUser = checkAuth(req);
      if (!tgUser) return res.status(401).json({ signal: false, error: 'unauthorized' });
      if (!symbol) return res.status(400).json({ signal: false, error: 'symbol missing' });

      const cleanSymbol = String(symbol).replace(' OTC', '');
      const result = await analysisEngine.analyze(cleanSymbol);

      if (result.signal) {
        const now = new Date();
        const entryDate = new Date(Math.floor((now.getTime() + 60000) / 60000) * 60000);
        const closeDate = new Date(entryDate.getTime() + 60000);
        const bdEntry = new Date(entryDate.getTime() + 6 * 60 * 60 * 1000);
        const bdClose = new Date(closeDate.getTime() + 6 * 60 * 60 * 1000);
        const fmt = (d) => String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
        result.entryTime = fmt(bdEntry);
        result.closeTime = fmt(bdClose);
        result.entryEpochMs = entryDate.getTime();
        result.closeEpochMs = closeDate.getTime();
      }

      return res.json(result);
    } catch (e) {
      console.error('miniapp /scan error:', e.message);
      return res.status(500).json({ signal: false, error: 'analysis failed' });
    }
  });

  // ✅ নতুন — নির্দিষ্ট এন্ট্রি ক্যান্ডেলের আসল Win/Loss ফলাফল চেক করার রুট
  app.post('/miniapp/result', async (req, res) => {
    try {
      const { symbol, direction, entryEpochMs } = req.body;
      const tgUser = checkAuth(req);
      if (!tgUser) return res.status(401).json({ status: 'error', error: 'unauthorized' });
      if (!symbol || !direction || !entryEpochMs) {
        return res.status(400).json({ status: 'error', error: 'missing params' });
      }

      const cleanSymbol = String(symbol).replace(' OTC', '');
      const entryDate = new Date(entryEpochMs);
      const pad = (n) => String(n).padStart(2, '0');
      const targetDatetime = `${entryDate.getUTCFullYear()}-${pad(entryDate.getUTCMonth() + 1)}-${pad(entryDate.getUTCDate())} ${pad(entryDate.getUTCHours())}:${pad(entryDate.getUTCMinutes())}:00`;

      const data = await twelveData.getTimeSeries(cleanSymbol, '1min', 10);
      if (!data.values) return res.json({ status: 'pending' });

      const match = data.values.find((v) => v.datetime === targetDatetime);
      if (!match) return res.json({ status: 'pending' });

      const open = parseFloat(match.open);
      const close = parseFloat(match.close);
      const isWin = direction === 'UP⏫' ? close > open : close < open;

      return res.json({ status: 'done', result: isWin ? 'WIN' : 'LOSS', open, close });
    } catch (e) {
      console.error('miniapp /result error:', e.message);
      return res.json({ status: 'pending' });
    }
  });
}

module.exports = { addScanRoute };
