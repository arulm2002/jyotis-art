const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { flash, safeNext } = require('../helpers');

const router = express.Router();

// Simple in-memory throttle on login attempts per IP.
const attempts = new Map();
function throttled(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, reset: now + 15 * 60 * 1000 };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + 15 * 60 * 1000; }
  rec.count += 1;
  attempts.set(ip, rec);
  return rec.count > 20;
}

function logIn(req, userId, cb) {
  const cart = req.session.cart; // keep the guest cart after login
  req.session.regenerate((err) => {
    if (err) return cb(err);
    req.session.userId = userId;
    req.session.cart = cart;
    cb();
  });
}

router.get('/register', (req, res) => {
  res.render('register', { title: 'Create account', form: {}, next: safeNext(req.query.next) });
});

router.post('/register', (req, res, next) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const nextUrl = safeNext(req.body.next);
  const errors = [];
  if (!name) errors.push('Please enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Please enter a valid email address.');
  if (password.length < 8) errors.push('Password must be at least 8 characters.');
  if (!errors.length && db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) errors.push('An account with that email already exists. Try logging in.');
  if (errors.length) return res.status(400).render('register', { title: 'Create account', form: { name, email }, errors, next: nextUrl });

  const info = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run(email, name, bcrypt.hashSync(password, 12));
  logIn(req, info.lastInsertRowid, (err) => {
    if (err) return next(err);
    flash(req, 'success', `Welcome, ${name}!`);
    res.redirect(nextUrl);
  });
});

router.get('/login', (req, res) => {
  res.render('login', { title: 'Log in', form: {}, next: safeNext(req.query.next) });
});

router.post('/login', (req, res, next) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const nextUrl = safeNext(req.body.next);
  if (throttled(req.ip)) {
    return res.status(429).render('login', { title: 'Log in', form: { email }, errors: ['Too many attempts. Please wait a few minutes.'], next: nextUrl });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).render('login', { title: 'Log in', form: { email }, errors: ['Incorrect email or password.'], next: nextUrl });
  }
  logIn(req, user.id, (err) => {
    if (err) return next(err);
    flash(req, 'success', `Welcome back, ${user.name}!`);
    res.redirect(user.is_admin && nextUrl === '/' ? '/admin' : nextUrl);
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.redirect('/');
  });
});

module.exports = router;
