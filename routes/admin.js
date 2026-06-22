
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

function auth(req, res, next) {
  if (req.session.admin) return next();
  res.redirect('/admin/login');
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

router.get('/login', (req, res) => res.render('admin/login', { error: null }));

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username=?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.render('admin/login', { error: 'Username atau password salah.' });
  }
  req.session.admin = { id: admin.id, username: admin.username };
  res.redirect('/admin');
});

router.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/admin/login'); });

router.get('/', auth, (req, res) => {
  const settings = getSettings();
  const stats = {
    total_orders: db.prepare('SELECT COUNT(*) as c FROM orders').get().c,
    success_orders: db.prepare('SELECT COUNT(*) as c FROM orders WHERE status=?').get('success').c,
    pending_orders: db.prepare('SELECT COUNT(*) as c FROM orders WHERE status=?').get('pending').c,
    revenue: db.prepare('SELECT COALESCE(SUM(amount),0) as s FROM orders WHERE status=?').get('success').s,
    total_products: db.prepare('SELECT COUNT(*) as c FROM products WHERE is_active=1').get().c,
    today_views: db.prepare("SELECT COUNT(*) as c FROM page_views WHERE date(created_at)=date('now')").get().c,
  };
  const recent = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10').all();
  const topProducts = db.prepare(`
    SELECT p.name, p.slug,
      COALESCE((SELECT COUNT(*) FROM page_views pv WHERE pv.page = '/product/' || p.slug), 0) as views,
      COALESCE((SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id AND o.status = 'success'), 0) as sales
    FROM products p WHERE p.is_active = 1
    ORDER BY views DESC LIMIT 5
  `).all();
  const revenueDaily = db.prepare(`
    SELECT date(paid_at) as day, SUM(amount) as revenue
    FROM orders WHERE status='success' AND paid_at >= date('now', '-7 days')
    GROUP BY day ORDER BY day
  `).all();
  const realtimeVisitors = db.prepare(`
    SELECT COUNT(DISTINCT ip) as c FROM page_views
    WHERE created_at >= datetime('now', '-5 minutes') AND ip != ''
  `).get().c;
  res.render('admin/dashboard', { settings, stats, recent, admin: req.session.admin, topProducts, revenueDaily, realtimeVisitors });
});

// Products
router.get('/products', auth, (req, res) => {
  const settings = getSettings();
  const products = db.prepare(`
    SELECT p.*,
      COALESCE((SELECT COUNT(*) FROM page_views pv WHERE pv.page = '/product/' || p.slug), 0) as view_count,
      COALESCE((SELECT COUNT(*) FROM page_views pv WHERE pv.page = '/checkout/' || p.slug), 0) as checkout_count,
      COALESCE((SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id AND o.status = 'success'), 0) as sales_count
    FROM products p
    ORDER BY COALESCE(p.is_pinned,0) DESC, COALESCE(p.priority,0) DESC, p.created_at DESC
  `).all();
  res.render('admin/products', { settings, products, admin: req.session.admin, success: req.query.saved });
});

router.get('/products/new', auth, (req, res) => {
  const settings = getSettings();
  const allProducts = db.prepare('SELECT id, name, price, discount_price, image FROM products WHERE is_active = 1 ORDER BY name').all();
  res.render('admin/product-form', { settings, product: null, allProducts, admin: req.session.admin, error: null, success: null });
});

router.get('/products/edit/:id', auth, (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!product) return res.redirect('/admin/products');
  product.addons = db.prepare('SELECT addon_product_id, addon_price FROM product_addons WHERE product_id = ?').all(product.id);
  const allProducts = db.prepare('SELECT id, name, price, discount_price, image FROM products WHERE is_active = 1 AND id != ? ORDER BY name').all(req.params.id);
  res.render('admin/product-form', { settings, product, allProducts, admin: req.session.admin, error: null, success: req.query.saved });
});

router.post('/products/add', auth, upload.fields([{name:'image',maxCount:1},{name:'file',maxCount:1}]), (req, res) => {
  const { name, category, description, price, discount_price, badge, countdown_end, priority, product_link, social_proof } = req.body;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '-' + Date.now();
  const image = req.files.image ? '/uploads/' + req.files.image[0].filename : null;
  const file_path = req.files.file ? req.files.file[0].filename : null;
  const insertResult = db.prepare('INSERT INTO products (name,slug,category,description,price,discount_price,image,file_path,badge,countdown_end,priority,product_link,social_proof) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(name, slug, category, description, parseInt(price), discount_price ? parseInt(discount_price) : null, image, file_path, badge||null, countdown_end||null, priority ? parseInt(priority) : 0, product_link||null, social_proof ? parseInt(social_proof) : 0);
  const newId = insertResult.lastInsertRowid;
  const rawAddonIds = req.body.addon_ids;
  const addonIds = rawAddonIds ? (Array.isArray(rawAddonIds) ? rawAddonIds : [rawAddonIds]) : [];
  for (const aid of addonIds) {
    const ap = req.body['addon_price_' + aid] ? parseInt(req.body['addon_price_' + aid]) : null;
    db.prepare('INSERT OR IGNORE INTO product_addons (product_id, addon_product_id, addon_price) VALUES (?,?,?)').run(newId, parseInt(aid), ap);
  }
  res.redirect('/admin/products?saved=1');
});

router.post('/products/edit/:id', auth, upload.fields([{name:'image',maxCount:1},{name:'file',maxCount:1}]), (req, res) => {
  const { name, category, description, price, discount_price, badge, countdown_end, is_active, social_proof, priority, product_link } = req.body;
  const updates = { name, category, description, price: parseInt(price), discount_price: discount_price ? parseInt(discount_price) : null, badge: badge||null, countdown_end: countdown_end||null, is_active: is_active ? 1 : 0, social_proof: social_proof ? parseInt(social_proof) : 0, priority: priority ? parseInt(priority) : 0, product_link: product_link||null };
  if (req.files.image) updates.image = '/uploads/' + req.files.image[0].filename;
  if (req.files.file) updates.file_path = req.files.file[0].filename;
  const cols = Object.keys(updates).map(k => `${k}=?`).join(',');
  db.prepare(`UPDATE products SET ${cols} WHERE id=?`).run(...Object.values(updates), req.params.id);
  db.prepare('DELETE FROM product_addons WHERE product_id = ?').run(req.params.id);
  const rawAddonIds = req.body.addon_ids;
  const addonIds = rawAddonIds ? (Array.isArray(rawAddonIds) ? rawAddonIds : [rawAddonIds]) : [];
  for (const aid of addonIds) {
    const ap = req.body['addon_price_' + aid] ? parseInt(req.body['addon_price_' + aid]) : null;
    db.prepare('INSERT OR IGNORE INTO product_addons (product_id, addon_product_id, addon_price) VALUES (?,?,?)').run(parseInt(req.params.id), parseInt(aid), ap);
  }
  res.redirect('/admin/products/edit/' + req.params.id + '?saved=1');
});

router.post('/products/priority/:id', auth, (req, res) => {
  db.prepare('UPDATE products SET priority=? WHERE id=?').run(parseInt(req.body.priority)||0, req.params.id);
  res.json({ success: true });
});

router.post('/products/toggle/:id', auth, (req, res) => {
  const p = db.prepare('SELECT is_active FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.json({ success: false });
  db.prepare('UPDATE products SET is_active=? WHERE id=?').run(p.is_active ? 0 : 1, req.params.id);
  res.json({ success: true, is_active: !p.is_active });
});

router.post('/products/pin/:id', auth, (req, res) => {
  const p = db.prepare('SELECT is_pinned FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.json({ success: false });
  db.prepare('UPDATE products SET is_pinned=? WHERE id=?').run(p.is_pinned ? 0 : 1, req.params.id);
  res.json({ success: true, is_pinned: !p.is_pinned });
});

router.post('/products/delete/:id', auth, (req, res) => {
  db.prepare('UPDATE products SET is_active=0 WHERE id=?').run(req.params.id);
  res.redirect('/admin/products');
});

// Orders
router.get('/orders', auth, (req, res) => {
  const settings = getSettings();
  const { status, page = 1 } = req.query;
  const limit = 20; const offset = (page-1)*limit;
  let q = 'SELECT * FROM orders';
  const params = [];
  if (status) { q += ' WHERE status=?'; params.push(status); }
  const total = db.prepare(q.replace('SELECT *','SELECT COUNT(*) as c')).get(...params).c;
  q += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const orders = db.prepare(q).all(...params);
  res.render('admin/orders', { settings, orders, admin: req.session.admin, status, page:+page, total, limit });
});

router.get('/orders/export', auth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  const csv = ['ID,Ref,Produk,Nama,Email,HP,Amount,Metode,Status,Email Sent,WA Sent,Paid At,Tanggal',...orders.map(o=>`${o.id},${o.ref_kode},"${o.product_name}","${o.customer_name}",${o.customer_email},${o.customer_phone},${o.amount},${o.payment_method},${o.status},${o.email_sent},${o.wa_sent},${o.paid_at||''},${o.created_at}`)].join('\n');
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition','attachment; filename=orders.csv');
  res.send(csv);
});

// Settings
router.get('/settings', auth, (req, res) => {
  const settings = getSettings();
  res.render('admin/settings', { settings, admin: req.session.admin, success: req.query.saved });
});

router.post('/settings', auth, (req, res) => {
  const allowed = ['store_name','store_domain','meta_pixel_id','meta_capi_token','ga4_id','wa_number','wa_followup_msg','wa_pending_msg'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key, req.body[key]);
    }
  }
  res.redirect('/admin/settings?saved=1');
});

router.post('/orders/resend-email/:id', auth, async (req, res) => {
  const { sendProductEmail } = require('../services/email');
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(order.product_id);
  const addonProduct = order.addon_product_id ? db.prepare('SELECT * FROM products WHERE id=?').get(order.addon_product_id) : null;
  try {
    await sendProductEmail(order, product || { name: order.product_name, file_path: null }, addonProduct);
    db.prepare('UPDATE orders SET email_sent=1 WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

router.get('/analytics', auth, (req, res) => {
  const week = new Date(Date.now() - 7*24*60*60*1000).toISOString().slice(0, 10);
  const month = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0, 10);

  const todayViews = db.prepare("SELECT COUNT(*) as c FROM page_views WHERE date(created_at)=date('now')").get().c;
  const weekViews = db.prepare("SELECT COUNT(*) as c FROM page_views WHERE created_at >= ?").get(week).c;
  const monthViews = db.prepare("SELECT COUNT(*) as c FROM page_views WHERE created_at >= ?").get(month).c;
  const totalViews = db.prepare("SELECT COUNT(*) as c FROM page_views").get().c;
  const topPages = db.prepare("SELECT page, COUNT(*) as views FROM page_views GROUP BY page ORDER BY views DESC LIMIT 10").all();
  const topRefs = db.prepare("SELECT ref, COUNT(*) as c FROM page_views WHERE ref != '' GROUP BY ref ORDER BY c DESC LIMIT 10").all();
  const daily = db.prepare("SELECT date(created_at) as day, COUNT(*) as views FROM page_views WHERE created_at >= ? GROUP BY day ORDER BY day").all(week);
  const checkoutVisits = db.prepare("SELECT COUNT(*) as c FROM page_views WHERE page LIKE '/checkout%'").get().c;
  const successOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status='success'").get().c;
  const convRate = checkoutVisits > 0 ? ((successOrders / checkoutVisits) * 100).toFixed(1) : 0;

  const productStats = db.prepare(`
    SELECT p.id, p.name, p.slug, p.category,
      COALESCE((SELECT COUNT(*) FROM page_views pv WHERE pv.page = '/product/' || p.slug), 0) as page_views,
      COALESCE((SELECT COUNT(*) FROM page_views pv WHERE pv.page = '/checkout/' || p.slug), 0) as checkout_views,
      COALESCE((SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id), 0) as total_orders,
      COALESCE((SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id AND o.status = 'success'), 0) as success_orders
    FROM products p
    WHERE p.is_active = 1
    ORDER BY page_views DESC
  `).all();

  const utmStats = db.prepare(`
    SELECT utm_source, utm_medium, utm_campaign, COUNT(*) as visits
    FROM page_views WHERE utm_source != ''
    GROUP BY utm_source, utm_medium, utm_campaign
    ORDER BY visits DESC LIMIT 20
  `).all();

  res.render('admin/analytics', {
    admin: req.session.admin,
    stats: { todayViews, weekViews, monthViews, totalViews, convRate, successOrders },
    topPages, topRefs, daily, productStats, utmStats
  });
});

router.get('/wa', auth, async (req, res) => {
  const settings = getSettings();
  let waStatus = { connected: false, qr: null };
  try {
    const http = require('http');
    waStatus = await new Promise((resolve, reject) => {
      http.get({ host: 'localhost', port: 3001, path: '/qr-data' }, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ connected: false, qr: null }); } });
      }).on('error', () => resolve({ connected: false, qr: null }));
    });
  } catch(e) {}
  res.render('admin/wa', { settings, admin: req.session.admin, waStatus });
});

router.post('/wa/logout', auth, async (req, res) => {
  try {
    const http = require('http');
    await new Promise((resolve) => {
      const body = JSON.stringify({});
      const r = http.request({ host: 'localhost', port: 3001, path: '/logout', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (r2) => { r2.resume(); resolve(); });
      r.on('error', resolve);
      r.write(body); r.end();
    });
  } catch(e) {}
  res.redirect('/admin/wa');
});

// VMP Connection Test
router.get('/test-vmp', auth, async (req, res) => {
  const { getChannels } = require('../services/payment');
  const result = {
    vmp_api_key: process.env.VMP_API_KEY ? '✅ SET (' + process.env.VMP_API_KEY.slice(0,8) + '...)' : '❌ NOT SET',
    vmp_secret_key: process.env.VMP_SECRET_KEY ? '✅ SET' : '❌ NOT SET',
    vmp_base_url: process.env.VMP_BASE_URL || 'https://violetmediapay.com/api/live (default)',
    callback_url: process.env.CALLBACK_URL || '❌ NOT SET',
    redirect_url: process.env.REDIRECT_URL || '❌ NOT SET',
  };
  if (!process.env.VMP_API_KEY || !process.env.VMP_SECRET_KEY) {
    return res.json({ status: 'error', message: 'VMP credentials tidak di-set di .env', config: result });
  }
  try {
    const channels = await getChannels();
    res.json({ status: 'success', message: 'Koneksi VMP berhasil!', config: result, channels });
  } catch(e) {
    res.json({ status: 'error', message: 'Gagal konek ke VMP: ' + e.message, config: result });
  }
});

router.post('/orders/send-reminder/:id', auth, async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.json({ success: false, error: 'Order not found' });
  const settings = getSettings();
  if (!settings.wa_number || !settings.wa_pending_msg) {
    return res.json({ success: false, error: 'WA belum dikonfigurasi di Settings' });
  }
  const msg = settings.wa_pending_msg
    .replace('{name}', order.customer_name)
    .replace('{product}', order.product_name)
    .replace('{expired}', order.created_at ? order.created_at.slice(0,16) : '-')
    .replace('{url}', order.checkout_url || '');
  try {
    const http = require('http');
    const body = JSON.stringify({ phone: order.customer_phone, message: msg });
    await new Promise((resolve, reject) => {
      const r2 = http.request({ host: 'localhost', port: 3001, path: '/send', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res2) => { res2.resume(); resolve(); });
      r2.on('error', reject);
      r2.write(body); r2.end();
    });
    res.json({ success: true });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// Leads
router.get('/leads', auth, (req, res) => {
  const settings = getSettings();
  const leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 500').all();
  res.render('admin/leads', { settings, leads, admin: req.session.admin });
});

router.post('/leads/:id/status', auth, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE leads SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ success: true });
});

router.post('/leads/:id/notes', auth, (req, res) => {
  const { notes } = req.body;
  db.prepare('UPDATE leads SET notes=? WHERE id=?').run(notes, req.params.id);
  res.json({ success: true });
});

router.post('/leads/blast', auth, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.json({ success: false, error: 'Message kosong' });
  const leads = db.prepare("SELECT * FROM leads WHERE customer_phone != ''").all();
  let sent = 0, failed = 0;
  const http = require('http');
  for (const lead of leads) {
    const phone = lead.customer_phone.replace(/\D/g,'').replace(/^0/,'62');
    const personalizedMsg = message
      .replace('{name}', lead.customer_name)
      .replace('{product}', lead.product_name || '');
    try {
      await new Promise((resolve, reject) => {
        const body = JSON.stringify({ phone, message: personalizedMsg });
        const r = http.request({ host:'localhost', port:3001, path:'/send', method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} }, (res2) => { res2.resume(); resolve(); });
        r.on('error', reject); r.write(body); r.end();
      });
      db.prepare('UPDATE leads SET wa_sent=1 WHERE id=?').run(lead.id);
      sent++;
    } catch(e) { failed++; }
  }
  res.json({ success: true, sent, failed });
});

// Funnel analytics
router.get('/funnel', auth, (req, res) => {
  const settings = getSettings();
  const funnel = {
    product_views: db.prepare("SELECT COUNT(*) as c FROM page_views WHERE page LIKE '/product/%'").get().c,
    checkout_starts: db.prepare("SELECT COUNT(*) as c FROM leads").get().c,
    payment_reached: db.prepare("SELECT COUNT(*) as c FROM orders").get().c,
    payment_success: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status='success'").get().c,
  };
  res.render('admin/funnel', { settings, funnel, admin: req.session.admin });
});

module.exports = router;
