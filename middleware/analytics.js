const db = require('../db/database');

function trackPage(page) {
  return (req, res, next) => {
    try {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
      const ua = req.headers['user-agent'] || '';
      const ref = req.headers['referer'] || '';
      const utm_source = req.query.utm_source || '';
      const utm_medium = req.query.utm_medium || '';
      const utm_campaign = req.query.utm_campaign || '';
      const utm_content = req.query.utm_content || '';
      db.prepare('INSERT INTO page_views (page, ref, ua, ip, utm_source, utm_medium, utm_campaign, utm_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(page, ref, ua, ip, utm_source, utm_medium, utm_campaign, utm_content);
    } catch(e) {}
    next();
  };
}

module.exports = { trackPage };