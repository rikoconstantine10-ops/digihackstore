
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
  let order = null;
  if (ref) order = db.prepare('SELECT * FROM orders WHERE ref_kode=?').get(ref);
  res.render('shop/order-status', { order, settings, ref });
});

router.get('/status/:refKode', (req, res) => {
  const settings = getSettings();
  const order = db.prepare('SELECT o.*, p.file_path FROM orders o LEFT JOIN products p ON p.id = o.product_id WHERE o.ref_kode = ?').get(req.params.refKode);
  if (!order) return res.render('shop/404', { settings });
  res.render('shop/order-status', { order, settings, ref: req.params.refKode });
});

router.post('/check', (req, res) => {
  const { ref, email } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE ref_kode=? AND customer_email=?').get(ref, email);
  res.json({ order });
});

router.get('/success/:refKode', (req, res) => {
  const settings = getSettings();
  const order = db.prepare('SELECT * FROM orders WHERE ref_kode=?').get(req.params.refKode);
  if (!order) return res.redirect('/');
  const products = db.prepare('SELECT * FROM products WHERE is_active=1 AND id != ? ORDER BY RANDOM() LIMIT 3').all(order.product_id || 0);
  res.render('shop/upsell', { order, settings, products });
});

module.exports = router;
