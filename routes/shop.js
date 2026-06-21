
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { trackPage } = require('../middleware/analytics');
const { capiViewContent } = require('../services/capi');

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

router.get('/', trackPage('/'), (req, res) => {
  const settings = getSettings();
  const featured = db.prepare('SELECT * FROM products WHERE is_active=1 ORDER BY created_at DESC LIMIT 8').all();
  const categories = db.prepare('SELECT DISTINCT category FROM products WHERE is_active=1').all();
  res.render('shop/index', { products: featured, categories, settings });
});

router.get('/catalog', trackPage('/catalog'), (req, res) => {
  const settings = getSettings();
  const { category, search, page = 1 } = req.query;
  const limit = 12;
  const offset = (page - 1) * limit;
  let query = 'SELECT * FROM products WHERE is_active=1';
  const params = [];
  if (category) { query += ' AND category=?'; params.push(category); }
  if (search) { query += ' AND (name LIKE ? OR description LIKE ?)'; params.push('%' + search + '%', '%' + search + '%'); }
  const total = db.prepare(query.replace('SELECT *', 'SELECT COUNT(*) as c')).get(...params).c;
  query += ' LIMIT ' + limit + ' OFFSET ' + offset;
  const products = db.prepare(query).all(...params);
  const categories = db.prepare('SELECT DISTINCT category FROM products WHERE is_active=1').all();
  res.render('shop/catalog', { products, categories, settings, category, search, page: +page, total, limit });
});

router.get('/product/:slug', (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE slug=? AND is_active=1').get(req.params.slug);
  if (!product) return res.status(404).render('shop/404', { settings });
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    const ref = req.headers['referer'] || '';
    db.prepare('INSERT INTO page_views (page, ref, ua, ip) VALUES (?, ?, ?, ?)').run('/product/' + req.params.slug, ref, ua, ip);
    const allSettings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r=>[r.key,r.value]));
    capiViewContent(allSettings, product, req);
  } catch(e) {}
  res.render('shop/product', { product, settings, serverTime: Date.now() });
});

module.exports = router;