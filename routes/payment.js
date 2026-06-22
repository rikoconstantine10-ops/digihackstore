
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

function saveLead(productId, productName, name, email, phone, domisili) {
  try {
    db.prepare('INSERT INTO leads (product_id, product_name, customer_name, customer_email, customer_phone, domisili) VALUES (?,?,?,?,?,?)')
      .run(productId, productName, name, email, phone, domisili || '');
  } catch(e) {
    try {
      db.prepare('INSERT INTO leads (product_id, product_name, customer_name, customer_email, customer_phone) VALUES (?,?,?,?,?)')
        .run(productId, productName, name, email, phone);
    } catch(e2) {}
  }
}

// ── Step 1: Form (data diri) ──────────────────────────────────────────────────

router.get('/:slug', (req, res, next) => trackPage('/checkout/' + req.params.slug)(req, res, next), (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE slug=? AND is_active=1').get(req.params.slug);
  if (!product) return res.status(404).render('shop/404', { settings });
  try { capiInitiateCheckout(settings, product, req); } catch(e) {}
  res.render('shop/checkout', { product, settings, error: null });
});

router.post('/:slug', (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE slug=? AND is_active=1').get(req.params.slug);
  if (!product) return res.status(404).render('shop/404', { settings });

  const { name, email, phone, domisili } = req.body;
  if (!name || !email || !phone || !domisili) {
    return res.render('shop/checkout', { product, settings, error: 'Semua field wajib diisi.' });
  }

  saveLead(product.id, product.name, name, email, phone, domisili);

  const baseAmount = product.discount_price || product.price;
  const refKode = Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000);

  req.session.pendingCheckout = {
    name, email, phone, domisili, refKode,
    productId: product.id, productName: product.name,
    baseAmount, amount: baseAmount,
    addonProductId: null, addonProductName: null, addonAmount: 0,
  };

  const addons = getProductAddons(product.id);
  if (addons.length > 0) {
    return res.redirect('/checkout/' + req.params.slug + '/addon');
  }
  res.redirect('/checkout/' + req.params.slug + '/payment');
});

// ── Step 2: Add-on ────────────────────────────────────────────────────────────

router.get('/:slug/addon', (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE slug=? AND is_active=1').get(req.params.slug);
  if (!product) return res.status(404).render('shop/404', { settings });

  const pending = req.session.pendingCheckout;
  if (!pending || pending.productId !== product.id) return res.redirect('/checkout/' + req.params.slug);

  const addons = getProductAddons(product.id);
  if (!addons.length) return res.redirect('/checkout/' + req.params.slug + '/payment');

  res.render('shop/addon', { product, settings, addons, pending });
});

router.post('/:slug/addon', (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE slug=? AND is_active=1').get(req.params.slug);
  if (!product) return res.status(404).render('shop/404', { settings });

  const pending = req.session.pendingCheckout;
  if (!pending || pending.productId !== product.id) return res.redirect('/checkout/' + req.params.slug);

  let rawIds = req.body['addon_product_id[]'] || req.body['addon_product_id'];
  if (!rawIds) rawIds = [];
  if (!Array.isArray(rawIds)) rawIds = [rawIds];

  let totalAddonAmount = 0;
  const addonNames = [];
  const addonIds = [];

  for (const aid of rawIds) {
    const parsed = parseInt(aid);
    if (!parsed) continue;
    const addonRow = db.prepare(`
      SELECT p.*, pa.addon_price FROM product_addons pa
      JOIN products p ON p.id = pa.addon_product_id
      WHERE pa.product_id = ? AND pa.addon_product_id = ? AND p.is_active = 1
    `).get(product.id, parsed);
    if (addonRow) {
      const addonAmount = addonRow.addon_price || addonRow.discount_price || addonRow.price;
      totalAddonAmount += addonAmount;
      addonNames.push(addonRow.name);
      addonIds.push(addonRow.id);
    }
  }

  pending.addonProductId = addonIds.length ? addonIds.join(',') : null;
  pending.addonProductName = addonNames.length ? addonNames.join(' + ') : null;
  pending.addonAmount = totalAddonAmount;
  pending.amount = pending.baseAmount + totalAddonAmount;

  req.session.pendingCheckout = pending;
  res.redirect('/checkout/' + req.params.slug + '/payment');
});

// ── Step 3: Payment method ────────────────────────────────────────────────────

router.get('/:slug/payment', (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE slug=? AND is_active=1').get(req.params.slug);
  if (!product) return res.status(404).render('shop/404', { settings });

  const pending = req.session.pendingCheckout;
  if (!pending || pending.productId !== product.id) return res.redirect('/checkout/' + req.params.slug);

  res.render('shop/payment-method', { product, settings, pending, error: null });
});

router.post('/:slug/payment', async (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE slug=? AND is_active=1').get(req.params.slug);
  if (!product) return res.status(404).render('shop/404', { settings });

  const pending = req.session.pendingCheckout;
  if (!pending || pending.productId !== product.id) return res.redirect('/checkout/' + req.params.slug);

  const { channel } = req.body;
  if (!channel) {
    return res.render('shop/payment-method', { product, settings, pending, error: 'Pilih metode pembayaran.' });
  }

  const { refKode, amount, name, email, phone, addonProductId, addonProductName, addonAmount } = pending;
  const produkLabel = addonProductName ? `${product.name} + ${addonProductName}` : product.name;

  try {
    const result = await createTransaction({ refKode, amount, channel, cusName: name, cusEmail: email, cusPhone: phone, produk: produkLabel });
    if (!result.status) {
      return res.render('shop/payment-method', { product, settings, pending, error: 'Gagal membuat transaksi. Coba lagi.' });
    }

    const data = result.data;
    db.prepare(`INSERT INTO orders
      (ref_kode,id_reference,product_id,product_name,customer_name,customer_email,customer_phone,amount,payment_method,status,checkout_url,addon_product_id,addon_product_name,addon_amount)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(refKode, data.id_reference, product.id, product.name, name, email, phone, amount, channel, 'pending', data.checkout_url, addonProductId, addonProductName, addonAmount || 0);

    req.session.pendingCheckout = null;
    res.redirect(data.checkout_url);
  } catch (e) {
    console.error(e);
    res.render('shop/payment-method', { product, settings, pending, error: 'Terjadi kesalahan sistem.' });
  }
});

module.exports = router;
