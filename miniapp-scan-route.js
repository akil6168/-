const analysisEngine = require('./analysis-engine');

function addScanRoute(app, deps) {
  const { approvedUsers, bannedUsers, validateInitData } = deps;
  const ADMIN_ID = 5724602667;

  app.post('/miniapp/scan', async (req, res) => {
    try {
      const { initData, symbol } = req.body;
      if (!initData || !symbol) {
        return res.status(400).json({ signal: false, error: 'initData or symbol missing' });
      }

      const botToken = process.env.BOT_TOKEN;
      const tgUser = validateInitData(initData, botToken);
      if (!tgUser) return res.status(401).json({ signal: false, error: 'invalid initData' });

      const userId = tgUser.id;
      if (bannedUsers.has(userId)) return res.status(403).json({ signal: false, error: 'banned' });

      const isAdmin = userId === ADMIN_ID;
      const isApproved = isAdmin || approvedUsers.has(userId);
      if (!isApproved) {
        return res.status(403).json({ signal: false, error: 'not_verified' });
      }

      const cleanSymbol = String(symbol).replace(' OTC', '');

      const result = await analysisEngine.analyze(cleanSymbol);

      // ✅ নতুন — এন্ট্রি/ক্লোজ টাইম হিসাব (পরবর্তী পূর্ণ মিনিট থেকে শুরু)
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
}

module.exports = { addScanRoute };
