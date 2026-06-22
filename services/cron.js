
const db = require('../db/database');
const http = require('http');

function sendWAAutoReminder() {
  try {
    const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value]));
    if (!settings.wa_number || !settings.wa_pending_msg) return;

    const pendingOrders = db.prepare(`
      SELECT * FROM orders
      WHERE status = 'pending'
        AND wa_reminder_sent = 0
        AND created_at <= datetime('now', '-1 hour')
        AND created_at >= datetime('now', '-23 hours')
    `).all();

    for (const order of pendingOrders) {
      const msg = settings.wa_pending_msg
        .replace('{name}', order.customer_name)
        .replace('{product}', order.product_name)
        .replace('{expired}', order.created_at ? order.created_at.slice(0, 16) : '-')
        .replace('{url}', order.checkout_url || '');

      const body = JSON.stringify({ phone: order.customer_phone, message: msg });
      const req = http.request({
        host: 'localhost', port: 3001, path: '/send', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      });
      req.on('error', () => {});
      req.write(body);
      req.end();

      db.prepare('UPDATE orders SET wa_reminder_sent=1 WHERE id=?').run(order.id);
      console.log(`[cron] WA reminder sent to ${order.customer_phone} for order #${order.ref_kode}`);
    }
  } catch (e) {
    console.error('[cron] Auto reminder error:', e.message);
  }
}

// Run every 30 minutes
setInterval(sendWAAutoReminder, 30 * 60 * 1000);

module.exports = { sendWAAutoReminder };
