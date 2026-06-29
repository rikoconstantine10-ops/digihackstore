
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
  const lcpImage = (featured[0] && featured[0].image) ? featured[0].image : null;
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.render('shop/index', { products: featured, categories, settings, lcpImage });
});

router.get('/catalog', trackPage('/catalog'), (req, res) => {
  const settings = getSettings();
  const { category, search, page = 1, sort, min_price, max_price } = req.query;
  const limit = 12;
  const offset = (page - 1) * limit;
  let baseWhere = 'FROM products p WHERE p.is_active=1';
  const params = [];
  if (category) { baseWhere += ' AND p.category=?'; params.push(category); }
  if (search) { baseWhere += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push('%' + search + '%', '%' + search + '%'); }
  if (min_price) { baseWhere += ' AND COALESCE(p.discount_price, p.price) >= ?'; params.push(parseInt(min_price) || 0); }
  if (max_price) { baseWhere += ' AND COALESCE(p.discount_price, p.price) <= ?'; params.push(parseInt(max_price) || 999999999); }
  const total = db.prepare('SELECT COUNT(*) as c ' + baseWhere).get(...params).c;
  let orderBy;
  switch (sort) {
    case 'price_asc': orderBy = 'COALESCE(p.discount_price, p.price) ASC'; break;
    case 'price_desc': orderBy = 'COALESCE(p.discount_price, p.price) DESC'; break;
    case 'popular': orderBy = 'total_sold DESC'; break;
    default: orderBy = 'COALESCE(p.is_pinned,0) DESC, COALESCE(p.priority,0) DESC, p.created_at DESC';
  }
  const query = `SELECT p.*, COALESCE(p.social_proof, 0) + COALESCE((SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id AND o.status = 'success'), 0) as total_sold ${baseWhere} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
  const products = db.prepare(query).all(...params);
  const categories = db.prepare('SELECT DISTINCT category FROM products WHERE is_active=1').all();
  res.render('shop/catalog', { products, categories, settings, category, search, page: +page, total, limit, sort: sort || '', min_price: min_price || '', max_price: max_price || '' });
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

router.get('/sitemap.xml', (req, res) => {
  const settings = getSettings();
  const base = (settings.store_domain || 'https://digihackstore.com').replace(/\/$/, '');
  const products = db.prepare('SELECT slug, created_at FROM products WHERE is_active=1 ORDER BY created_at DESC').all();
  const today = new Date().toISOString().slice(0, 10);

  const staticPages = [
    { url: '/', changefreq: 'daily', priority: '1.0', lastmod: today },
    { url: '/catalog', changefreq: 'daily', priority: '0.9', lastmod: today },
  ];

  const productUrls = products.map(p => ({
    url: '/product/' + p.slug,
    changefreq: 'weekly',
    priority: '0.8',
    lastmod: (p.created_at || today).slice(0, 10)
  }));

  const allUrls = [...staticPages, ...productUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${base}${u.url}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(xml);
});

router.get('/wishlist', (req, res) => {
  const settings = getSettings();
  res.render('shop/wishlist', { settings });
});

router.get('/robots.txt', (req, res) => {
  const settings = getSettings();
  const base = (settings.store_domain || 'https://digihackstore.com').replace(/\/$/, '');
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /checkout\nDisallow: /callback\nDisallow: /order\n\nSitemap: ${base}/sitemap.xml\n`);
});

module.exports = router;