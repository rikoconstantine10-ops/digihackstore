
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { createTransaction } = require('../services/payment');
const { trackPage } = require('../middleware/analytics');
const { capiInitiateCheckout } = require('../services/capi');

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function getProductAddons(productId) {
  return db.prepare(`
    SELECT p.id, p.name, p.slug, p.description, p.image, p.price, p.discount_price, pa.addon_price
    FROM product_addons pa
    JOIN products p ON p.id = pa.addon_product_id
    WHERE pa.product_id = ? AND p.is_active = 1
  `).all(productId);
}

router.get('/:slug', (req, res, next) => trackPage('/checkout/' + req.params.slug)(req, res, next), (req, res) => {
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

  const refKode = Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000);
  const amount = product.discount_price || product.price;

  const addons = getProductAddons(product.id);
  if (addons.length > 0) {
    req.session.pendingCheckout = { name, email, phone, channel, refKode, amount, productId: product.id, productName: product.name };
    return res.redirect('/checkout/' + req.params.slug + '/addon');
  }

  try {
    const result = await createTransaction({ refKode, amount, channel, cusName: name, cusEmail: email, cusPhone: phone, produk: product.name });
    if (!result.status) return res.render('shop/checkout', { product, settings, error: 'Gagal membuat transaksi. Coba lagi.' });

    const data = result.data[0];
    db.prepare('INSERT INTO orders (ref_kode,id_reference,product_id,product_name,customer_name,customer_email,customer_phone,amount,payment_method,status,checkout_url) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).run(refKode, data.id_reference, product.id, product.name, name, email, phone, amount, channel, 'pending', data.checkout_url);

    res.redirect(data.checkout_url);
  } catch (e) {
    console.error(e);
    res.render('shop/checkout', { product, settings, error: 'Terjadi kesalahan sistem.' });
  }
});

// Add-on interstitial page
router.get('/:slug/addon', (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE slug=? AND is_active=1').get(req.params.slug);
  if (!product) return res.status(404).render('shop/404', { settings });

  const pending = req.session.pendingCheckout;
  if (!pending || pending.productId !== product.id) return res.redirect('/checkout/' + req.params.slug);

  const addons = getProductAddons(product.id);
  if (!addons.length) return res.redirect('/checkout/' + req.params.slug);

  res.render('shop/addon', { product, settings, addons, pending });
});

router.post('/:slug/addon', async (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE slug=? AND is_active=1').get(req.params.slug);
  if (!product) return res.status(404).render('shop/404', { settings });

  const pending = req.session.pendingCheckout;
  if (!pending || pending.productId !== product.id) return res.redirect('/checkout/' + req.params.slug);

  const { addon_product_id } = req.body;
  let { refKode, amount, name, email, phone, channel } = pending;

  let addonProductId = null;
  let addonProductName = null;
  let addonAmount = 0;

  if (addon_product_id) {
    const addonRow = db.prepare(`
      SELECT p.*, pa.addon_price FROM product_addons pa
      JOIN products p ON p.id = pa.addon_product_id
      WHERE pa.product_id = ? AND pa.addon_product_id = ? AND p.is_active = 1
    `).get(product.id, parseInt(addon_product_id));

    if (addonRow) {
      addonProductId = addonRow.id;
      addonProductName = addonRow.name;
      addonAmount = addonRow.addon_price || addonRow.discount_price || addonRow.price;
      amount += addonAmount;
    }
  }

  req.session.pendingCheckout = null;

  try {
    const produkLabel = addonProductName ? `${product.name} + ${addonProductName}` : product.name;
    const result = await createTransaction({ refKode, amount, channel, cusName: name, cusEmail: email, cusPhone: phone, produk: produkLabel });
    if (!result.status) {
      req.session.pendingCheckout = pending;
      const addons = getProductAddons(product.id);
      return res.render('shop/addon', { product, settings, addons, pending, error: 'Gagal membuat transaksi, coba lagi.' });
    }

    const data = result.data[0];
    db.prepare('INSERT INTO orders (ref_kode,id_reference,product_id,product_name,customer_name,customer_email,customer_phone,amount,payment_method,status,checkout_url,addon_product_id,addon_product_name,addon_amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(refKode, data.id_reference, product.id, product.name, name, email, phone, amount, channel, 'pending', data.checkout_url, addonProductId, addonProductName, addonAmount || 0);

    res.redirect(data.checkout_url);
  } catch (e) {
    console.error(e);
    req.session.pendingCheckout = pending;
    const addons = getProductAddons(product.id);
    res.render('shop/addon', { product, settings, addons, pending, error: 'Terjadi kesalahan sistem.' });
  }
});

module.exports = router;
