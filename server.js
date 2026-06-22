
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const path = require('path');

const app = express();

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', etag: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// SQLite session store (persists across restarts)
const Database = require('better-sqlite3');
const sessionDb = new Database(path.join(__dirname, 'data/sessions.db'));
sessionDb.exec(`CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expired INTEGER NOT NULL)`);
sessionDb.exec(`CREATE INDEX IF NOT EXISTS sessions_expired ON sessions(expired)`);

const Store = session.Store;
class SQLiteStore extends Store {
  get(sid, cb) {
    try {
      const row = sessionDb.prepare('SELECT sess FROM sessions WHERE sid=? AND expired>?').get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch(e) { cb(e); }
  }
  set(sid, sess, cb) {
    try {
      const exp = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 30*24*60*60*1000;
      sessionDb.prepare('INSERT OR REPLACE INTO sessions (sid,sess,expired) VALUES (?,?,?)').run(sid, JSON.stringify(sess), exp);
      cb(null);
    } catch(e) { cb(e); }
  }
  destroy(sid, cb) {
    try { sessionDb.prepare('DELETE FROM sessions WHERE sid=?').run(sid); cb(null); } catch(e) { cb(e); }
  }
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'digihack_secret',
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore(),
  cookie: { secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

// Rate limit checkout
const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Terlalu banyak request, coba lagi nanti.' });

// Init DB
require('./db/database');

// Background jobs
require('./services/cron');

// Routes
app.use('/', require('./routes/shop'));
app.use('/checkout', checkoutLimiter, require('./routes/payment'));
app.use('/callback', require('./routes/callback'));
app.use('/order', require('./routes/order'));
app.use('/admin', require('./routes/admin'));

// 404
app.use((req, res) => {
  try {
    const db = require('./db/database');
    const settings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));
    res.status(404).render('shop/404', { settings });
  } catch(e) {
    res.status(404).render('shop/404', { settings: { store_name: 'Digihack Store', ga4_id: '' } });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Digihack Store running on port ${PORT}`));
