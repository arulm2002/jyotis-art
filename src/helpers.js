const crypto = require('crypto');
const config = require('./config');

const factor = config.zeroDecimal ? 1 : 100;

function formatPrice(minor, currency = config.currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
    .format(minor / (config.isZeroDecimal(currency) ? 1 : 100));
}

// "25.50" -> 2550 (or 25 for zero-decimal currencies). Returns null when invalid.
function parsePrice(input) {
  const s = String(input || '').trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const minor = Math.round(parseFloat(s) * factor);
  return minor > 0 ? minor : null;
}

function priceInputValue(minor) {
  return config.zeroDecimal ? String(minor) : (minor / 100).toFixed(2);
}

// Session-bound CSRF token for all state-changing forms.
function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  return req.session.csrf;
}

function verifyCsrf(req, res, next) {
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  const expected = req.session.csrf || '';
  const ok = sent.length === expected.length && expected.length > 0 &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) return res.status(403).render('error', { title: 'Session expired', message: 'Your form session expired. Please go back, refresh the page, and try again.' });
  next();
}

function flash(req, type, message) {
  req.session.flash = req.session.flash || [];
  req.session.flash.push({ type, message });
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  flash(req, 'info', 'Please log in to continue.');
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.is_admin) return next();
  if (!req.user) return requireLogin(req, res, next);
  res.status(403).render('error', { title: 'Not allowed', message: 'This area is for the site owner only.' });
}

// Only allow redirects back into this site.
function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

module.exports = { formatPrice, parsePrice, priceInputValue, csrfToken, verifyCsrf, flash, requireLogin, requireAdmin, safeNext };
