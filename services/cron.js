
const db = require('../db/database');
const http = require('http');

function sendWA(phone, message) {
  return new Promise((resolve, reject) => {
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);
    else if (!cleanPhone.startsWith('62')) cleanPhone = '62' + cleanPhone;
    const body = JSON.stringify({ phone: cleanPhone, message });
    const req = http.request({
      host: 'localhost', port: 3001, path: '/send', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => { res.resume(); resolve(); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Auto-reminder for pending orders (1 hour after creation, up to 23 hours)
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

      sendWA(order.customer_phone, msg).catch(() => {});
      db.prepare('UPDATE orders SET wa_reminder_sent=1 WHERE id=?').run(order.id);
      console.log(`[cron] WA reminder sent to ${order.customer_phone} for order #${order.ref_kode}`);
    }
  } catch (e) {
    console.error('[cron] Auto reminder error:', e.message);
  }
}

// Auto-reminder for leads that never reached payment (15 minutes after form submit)
function sendLeadsReminder() {
  try {
    const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value]));
    const template = settings.wa_leads_msg;
    if (!template) return;

    // Leads older than 15 min, wa_sent=0, and no successful order exists for same email
    const leads = db.prepare(`
      SELECT l.* FROM leads l
      WHERE l.wa_sent = 0
        AND l.created_at <= datetime('now', '-15 minutes')
        AND l.created_at >= datetime('now', '-24 hours')
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.customer_email = l.customer_email
            AND o.status = 'success'
            AND o.product_id = l.product_id
        )
    `).all();

    for (const lead of leads) {
      const msg = template
        .replace('{name}', lead.customer_name)
        .replace('{product}', lead.product_name || '');

      sendWA(lead.customer_phone, msg).catch(() => {});
      db.prepare('UPDATE leads SET wa_sent=1 WHERE id=?').run(lead.id);
      console.log(`[cron] Lead reminder sent to ${lead.customer_phone} (${lead.customer_name})`);
    }
  } catch (e) {
    console.error('[cron] Lead reminder error:', e.message);
  }
}

// Pending orders: every 30 minutes
setInterval(sendWAAutoReminder, 30 * 60 * 1000);

// Leads reminder: every 5 minutes
setInterval(sendLeadsReminder, 5 * 60 * 1000);

module.exports = { sendWAAutoReminder, sendLeadsReminder };
