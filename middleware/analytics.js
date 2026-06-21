const db = require('../db/database');

function trackPage(page) {
  return (req, res, next) => {
    try {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
      const ua = req.headers['user-agent'] || '';
      const ref = req.headers['referer'] || '';
      db.prepare('INSERT INTO page_views (page, ref, ua, ip) VALUES (?, ?, ?, ?)').run(page, ref, ua, ip);
    } catch(e) {}
    next();
  };
}

module.exports = { trackPage };