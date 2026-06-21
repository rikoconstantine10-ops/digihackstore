
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
        try {
          await sendProductEmail(order, product || { name: order.product_name, file_path: null });
          db.prepare('UPDATE orders SET email_sent=1 WHERE ref_kode=?').run(String(ref));
        } catch(e) { console.error('Email failed:', e.message); }
      }

      // CAPI Purchase
      try { capiPurchase(settings, order); } catch(e) { console.error('CAPI:', e.message); }

      // WA followup - fire and forget
      const settings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r=>[r.key,r.value]));
      if (settings.wa_number && settings.wa_followup_msg) {
        const msg = settings.wa_followup_msg
          .replace('{name}', order.customer_name)
          .replace('{product}', order.product_name)
          .replace('{email}', order.customer_email);
        try {
          const http = require('http');
          const body = JSON.stringify({ number: order.customer_phone, message: msg });
          const req2 = http.request({ host:'localhost', port:3001, path:'/send', method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} });
          req2.write(body); req2.end();
          db.prepare('UPDATE orders SET wa_sent=1 WHERE ref_kode=?').run(String(ref));
        } catch(e) { console.error('WA failed:', e.message); }
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
