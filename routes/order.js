
const express = require('express');
const router = express.Router();
const db = require('../db/database');

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

router.get('/status', (req, res) => {
  const settings = getSettings();
  const { ref } = req.query;
  let order = null, product = null, upsells = [];
  if (ref) {
    order = db.prepare('SELECT * FROM orders WHERE ref_kode=?').get(ref);
    if (order) {
      product = db.prepare('SELECT product_link, file_path FROM products WHERE id=?').get(order.product_id);
      if (order.status === 'success') {
        upsells = db.prepare(`
          SELECT id, name, slug, image, price, discount_price, badge
          FROM products WHERE is_active=1 AND id != ?
          ORDER BY COALESCE(is_pinned,0) DESC, COALESCE(priority,0) DESC, RANDOM() LIMIT 3
        `).all(order.product_id);
      }
    }
  }
  res.render('shop/order-status', { order, settings, ref, product, upsells });
});

router.post('/check', (req, res) => {
  const { ref, email } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE ref_kode=? AND customer_email=?').get(ref, email);
  res.json({ order });
});

module.exports = router;
