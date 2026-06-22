
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { verifyCallbackSignature } = require('../services/payment');
const { sendProductEmail } = require('../services/email');
const { capiPurchase } = require('../services/capi');

router.post('/', express.json(), async (req, res) => {
  try {
    const data = req.body;
    const { status, ref, id_reference, signature } = data;

    if (!verifyCallbackSignature(ref, signature)) {
      return res.status(400).json({ status: false });
    }

    const order = db.prepare('SELECT * FROM orders WHERE ref_kode=?').get(String(ref));
    if (!order) return res.status(404).json({ status: false });

    if (status === 'success') {
      db.prepare('UPDATE orders SET status=?, id_reference=?, paid_at=CURRENT_TIMESTAMP WHERE ref_kode=?').run('success', id_reference, String(ref));

      if (!order.email_sent) {
        const product = db.prepare('SELECT * FROM products WHERE id=?').get(order.product_id);
        const addonProduct = order.addon_product_id ? db.prepare('SELECT * FROM products WHERE id=?').get(order.addon_product_id) : null;
        try {
          await sendProductEmail(order, product || { name: order.product_name, file_path: null }, addonProduct);
          db.prepare('UPDATE orders SET email_sent=1 WHERE ref_kode=?').run(String(ref));
        } catch(e) { console.error('Email failed:', e.message); }
      }

      const settings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));

      try { capiPurchase(settings, order); } catch(e) { console.error('CAPI:', e.message); }

      if (settings.wa_number && settings.wa_followup_msg) {
        const msg = settings.wa_followup_msg
          .replace('{name}', order.customer_name)
          .replace('{product}', order.product_name)
          .replace('{email}', order.customer_email);
        try {
          const http = require('http');
          let custPhone = order.customer_phone.replace(/\D/g,'');
          if (custPhone.startsWith('0')) custPhone = '62' + custPhone.slice(1);
          else if (!custPhone.startsWith('62')) custPhone = '62' + custPhone;
          const body = JSON.stringify({ phone: custPhone, message: msg });
          const req2 = http.request({ host: 'localhost', port: 3001, path: '/send', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
          req2.write(body); req2.end();
          db.prepare('UPDATE orders SET wa_sent=1 WHERE ref_kode=?').run(String(ref));
        } catch(e) { console.error('WA failed:', e.message); }
      }

      // Admin notification
      if (settings.wa_number) {
        try {
          const http = require('http');
          const adminMsg = `🛎️ *Order Baru Masuk!*\n\nProduk: ${order.product_name}\nCustomer: ${order.customer_name}\nHP: ${order.customer_phone}\nEmail: ${order.customer_email}\nTotal: Rp ${order.amount.toLocaleString('id-ID')}\nMetode: ${order.payment_method}\nRef: #${order.ref_kode}`;
          const adminBody = JSON.stringify({ phone: settings.wa_number, message: adminMsg });
          const req3 = http.request({ host: 'localhost', port: 3001, path: '/send', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(adminBody) } });
          req3.write(adminBody); req3.end();
        } catch(e) { console.error('Admin WA failed:', e.message); }
      }
    } else if (status === 'kadaluarsa') {
      db.prepare('UPDATE orders SET status=? WHERE ref_kode=?').run('expired', String(ref));
    } else if (status === 'refund') {
      db.prepare('UPDATE orders SET status=? WHERE ref_kode=?').run('refund', String(ref));
    }

    res.json({ status: true });
  } catch (e) {
    console.error('Callback error:', e);
    res.status(500).json({ status: false });
  }
});

module.exports = router;
