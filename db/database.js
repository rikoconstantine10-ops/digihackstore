
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, '../data/store.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL,
    discount_price INTEGER,
    image TEXT,
    file_path TEXT,
    badge TEXT,
    is_active INTEGER DEFAULT 1,
    countdown_end DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_kode TEXT UNIQUE NOT NULL,
    id_reference TEXT,
    product_id INTEGER,
    product_name TEXT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    amount INTEGER NOT NULL,
    payment_method TEXT,
    status TEXT DEFAULT 'pending',
    checkout_url TEXT,
    paid_at DATETIME,
    email_sent INTEGER DEFAULT 0,
    wa_sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page TEXT NOT NULL,
    ref TEXT DEFAULT '',
    ua TEXT DEFAULT '',
    ip TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL
  );
`);

const existingAdmin = db.prepare('SELECT id FROM admins WHERE username = ?').get(process.env.ADMIN_USERNAME || 'admin');
if (!existingAdmin) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
  db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run(process.env.ADMIN_USERNAME || 'admin', hash);
}

const defaults = [
  ['store_name', 'Digihack Store'],
  ['store_domain', 'https://digihackstore.com'],
  ['meta_pixel_id', ''],
  ['meta_capi_token', ''],
  ['wa_number', ''],
  ['wa_followup_msg', 'Halo {name}! Terima kasih sudah order di Digihack Store. Produk {product} sudah dikirim ke email {email}. Hubungi kami jika ada pertanyaan!'],
  ['wa_pending_msg', 'Halo {name}! Pesanan {product} kamu belum dibayar. Selesaikan pembayaran sebelum {expired}. Link: {url}'],
];
for (const [k, v] of defaults) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v);
}

module.exports = db;
