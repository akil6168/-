const crypto = require('crypto');

const ADMIN_ID = 5724602667;

function validateInitData(initData, botToken) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  if (!hash) return null;

  urlParams.delete('hash');
  const dataCheckArr = [];
  for (const [key, value] of [...urlParams.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const authDate = parseInt(urlParams.get('auth_date') || '0', 10);
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > 86400) return null;

  const userStr = urlParams.get('user');
  if (!userStr) return null;
  return JSON.parse(userStr);
}

const { addScanRoute } = require('./miniapp-scan-route');

function registerMiniAppRoutes(app, { db, approvedUsers, bannedUsers, submissions }) {
  app.use(require('express').json());

  addScanRoute(app, { approvedUsers, bannedUsers, validateInitData });

  app.post('/miniapp/verify', async (req, res) => {
    try {
      const { initData } = req.body;
      if (!initData) return res.status(400).json({ verified: false, error: 'initData missing' });

      const botToken = process.env.BOT_TOKEN;
      const tgUser = validateInitData(initData, botToken);
      if (!tgUser) return res.status(401).json({ verified: false, error: 'invalid initData' });

      const userId = tgUser.id;

      if (bannedUsers.has(userId)) {
        return res.status(403).json({ verified: false, banned: true });
      }

      const isAdmin = userId === ADMIN_ID;
      const isApproved = isAdmin || approvedUsers.has(userId);

      const sub = submissions.find(s => s.userId === userId);

      return res.json({
        verified: isApproved,
        isAdmin,
        userId,
        firstName: tgUser.first_name || null,
        traderId: sub ? sub.traderId : null,
      });
    } catch (e) {
      console.error('miniapp /verify error:', e.message);
      return res.status(500).json({ verified: false, error: 'server error' });
    }
  });
}

module.exports = { registerMiniAppRoutes, validateInitData };
