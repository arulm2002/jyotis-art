const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const isProd = process.env.NODE_ENV === 'production';

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProd) throw new Error('SESSION_SECRET must be set in production');
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] SESSION_SECRET not set; using a random one (sessions reset on restart).');
}

// Currencies Stripe treats as having no minor unit (e.g. JPY: 1000 means ¥1000).
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);

const currency = (process.env.CURRENCY || 'usd').toLowerCase();
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  baseUrl: (process.env.BASE_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/+$/, ''),
  siteName: process.env.SITE_NAME || "Jyoti's Art",
  artistName: process.env.ARTIST_NAME || 'Jyoti',
  sessionSecret,
  currency,
  zeroDecimal: ZERO_DECIMAL.has(currency),
  isZeroDecimal: (c) => ZERO_DECIMAL.has(String(c).toLowerCase()),
  dataDir,
  uploadDir: path.join(dataDir, 'uploads'),
  dbFile: path.join(dataDir, 'shop.db'),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  demoPayments: process.env.DEMO_PAYMENTS === 'true',
  shippingCountries: (process.env.SHIPPING_COUNTRIES || 'US,CA,GB,IN,JP,AU,SG,DE,FR')
    .split(',').map((c) => c.trim().toUpperCase()).filter(Boolean),
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
};
