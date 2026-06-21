
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();

// Trust proxy (behind nginx/cloudflare)
app.set('trust proxy', 1);

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'digihack_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Rate limit checkout
const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Terlalu banyak request, coba lagi nanti.' });

// Init DB
require('./db/database');

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
