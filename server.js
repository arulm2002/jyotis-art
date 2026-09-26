const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const config = require('./src/config');
const db = require('./src/db');
const SqliteStore = require('./src/session-store');
const { formatPrice, csrfToken, verifyCsrf } = require('./src/helpers');
const { cartCount } = require('./src/cart');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (config.isProd) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'img-src': ["'self'", 'data:'],
      // Checkout POSTs redirect to Stripe's hosted payment page.
      'form-action': ["'self'", 'https://checkout.stripe.com'],
    },
  },
}));

// Stripe webhooks need the raw body for signature verification, so mount before body parsers.
app.use('/webhooks', require('./src/routes/webhooks'));

app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));
app.use('/uploads', express.static(config.uploadDir, { maxAge: '30d' }));

app.use(session({
  store: new SqliteStore(db),
  secret: config.sessionSecret,
  name: 'sid',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 30 * 24 * 60 * 60 * 1000 },
}));

app.use((req, res, next) => {
  req.user = req.session.userId
    ? db.prepare('SELECT id, email, name, is_admin FROM users WHERE id = ?').get(req.session.userId)
    : null;
  res.locals.user = req.user;
  res.locals.site = { name: config.siteName, artist: config.artistName };
  res.locals.formatPrice = formatPrice;
  res.locals.currencyCode = config.currency.toUpperCase();
  res.locals.csrf = () => csrfToken(req);
  res.locals.cartCount = cartCount(req);
  res.locals.flash = req.session.flash || [];
  res.locals.path = req.path;
  delete req.session.flash;
  next();
});

// Multipart forms (image uploads) verify CSRF inside their route, after multer parses the body.
app.use((req, res, next) => {
  if (req.method !== 'POST' || req.is('multipart/form-data')) return next();
  verifyCsrf(req, res, next);
});

app.use(require('./src/routes/shop'));
app.use(require('./src/routes/auth'));
app.use(require('./src/routes/cart'));
app.use(require('./src/routes/checkout'));
app.use('/account', require('./src/routes/account'));
app.use('/admin', require('./src/routes/admin'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: "We couldn't find that page." });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(err.status || 500).render('error', { title: 'Something went wrong', message: err.expose ? err.message : 'Please try again in a moment.' });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`${config.siteName} running at ${config.baseUrl}`);
    if (!config.stripeSecretKey) console.log(config.demoPayments ? '[payments] DEMO mode: orders are marked paid without charging.' : '[payments] Stripe not configured; checkout is disabled.');
  });
}

module.exports = app;
