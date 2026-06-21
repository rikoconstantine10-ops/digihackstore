
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { createTransaction } = require('../services/payment');
const { trackPage } = require('../middleware/analytics');
const { capiInitiateCheckout } = require('../services/capi');
const { v4: uuidv4 } = require('uuid');

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

router.get('/:slug', trackPage('/checkout'), (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE slug=? AND is_active=1').get(req.params.slug);
  if (!product) return res.status(404).render('shop/404', { settings });
  try { capiInitiateCheckout(settings, product, req); } catch(e) {}
  res.render('shop/checkout', { product, settings, error: null });
});

router.post('/:slug', async (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE slug=? AND is_active=1').get(req.params.slug);
  if (!product) return res.status(404).render('shop/404', { settings });

  const { name, email, phone, channel } = req.body;
  if (!name || !email || !phone || !channel) {
    return res.render('shop/checkout', { product, settings, error: 'Semua field wajib diisi.' });
  }

  const refKode = Date.now().toString().slice(-8) + Math.floor(Math.random()*1000);
  const amount = product.discount_price || product.price;

  try {
    const result = await createTransaction({ refKode, amount, channel, cusName: name, cusEmail: email, cusPhone: phone, produk: product.name });
    if (!result.status) return res.render('shop/checkout', { product, settings, error: 'Gagal membuat transaksi. Coba lagi.' });

    const data = result.data[0];
    db.prepare(`INSERT INTO orders (ref_kode, id_reference, product_id, product_name, customer_name, customer_email, customer_phone, amount, payment_method, status, checkout_url) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(refKode, data.id_reference, product.id, product.name, name, email, phone, amount, channel, 'pending', data.checkout_url);

    res.redirect(data.checkout_url);
  } catch (e) {
    console.error(e);
    res.render('shop/checkout', { product, settings, error: 'Terjadi kesalahan sistem.' });
  }
});

module.exports = router;