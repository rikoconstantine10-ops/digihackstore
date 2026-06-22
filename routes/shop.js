
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { trackPage } = require('../middleware/analytics');
const { capiViewContent, genEventId } = require('../services/capi');

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

router.get('/', trackPage('/'), (req, res) => {
  const settings = getSettings();
  const featured = db.prepare(`
    SELECT p.*, COALESCE(p.social_proof, 0) + COALESCE((SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id AND o.status = 'success'), 0) as total_sold
    FROM products p WHERE p.is_active=1 ORDER BY COALESCE(p.is_pinned,0) DESC, COALESCE(p.priority,0) DESC, p.created_at DESC LIMIT 8
  `).all();
  const categories = db.prepare('SELECT DISTINCT category FROM products WHERE is_active=1').all();
  res.render('shop/index', { products: featured, categories, settings });
});

router.get('/catalog', trackPage('/catalog'), (req, res) => {
  const settings = getSettings();
  const { category, search, page = 1 } = req.query;
  const limit = 12;
  const offset = (page - 1) * limit;
  let baseWhere = 'FROM products p WHERE p.is_active=1';
  const params = [];
  if (category) { baseWhere += ' AND p.category=?'; params.push(category); }
  if (search) { baseWhere += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push('%' + search + '%', '%' + search + '%'); }
  const total = db.prepare('SELECT COUNT(*) as c ' + baseWhere).get(...params).c;
  const query = `SELECT p.*, COALESCE(p.social_proof, 0) + COALESCE((SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id AND o.status = 'success'), 0) as total_sold ${baseWhere} ORDER BY COALESCE(p.is_pinned,0) DESC, COALESCE(p.priority,0) DESC, p.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const products = db.prepare(query).all(...params);
  const categories = db.prepare('SELECT DISTINCT category FROM products WHERE is_active=1').all();
  res.render('shop/catalog', { products, categories, settings, category, search, page: +page, total, limit });
});

router.get('/product/:slug', (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE slug=? AND is_active=1').get(req.params.slug);
  if (!product) return res.status(404).render('shop/404', { settings });
  let vcEventId = null;
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    const ref = req.headers['referer'] || '';
    db.prepare('INSERT INTO page_views (page, ref, ua, ip) VALUES (?, ?, ?, ?)').run('/product/' + req.params.slug, ref, ua, ip);
    const allSettings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r=>[r.key,r.value]));
    vcEventId = genEventId('vc');
    capiViewContent(allSettings, product, req, vcEventId);
  } catch(e) {}
  const realSales = db.prepare("SELECT COUNT(*) as c FROM orders WHERE product_id=? AND status='success'").get(product.id).c;
  const salesCount = realSales + (product.social_proof || 0);
  res.render('shop/product', { product, settings, salesCount, vcEventId });
});

module.exports = router;