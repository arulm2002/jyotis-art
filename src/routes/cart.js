const express = require('express');
const db = require('../db');
const { getCart, cartDetails } = require('../cart');
const { flash } = require('../helpers');

const router = express.Router();

router.get('/cart', (req, res) => {
  const { items, total, notices } = cartDetails(req);
  res.locals.flash = res.locals.flash.concat(notices.map((message) => ({ type: 'info', message })));
  res.render('cart', { title: 'Your cart', items, total });
});

router.post('/cart/add', (req, res) => {
  const id = Number(req.body.artworkId);
  const art = db.prepare('SELECT * FROM artworks WHERE id = ? AND is_published = 1').get(id);
  if (!art || art.stock <= 0) {
    flash(req, 'error', 'Sorry, that piece is no longer available.');
    return res.redirect('/');
  }
  const cart = getCart(req);
  const qty = Math.max(1, parseInt(req.body.quantity, 10) || 1);
  cart[id] = Math.min((cart[id] || 0) + qty, art.stock);
  flash(req, 'success', `"${art.title}" was added to your cart.`);
  res.redirect('/cart');
});

router.post('/cart/update', (req, res) => {
  const cart = getCart(req);
  const id = String(Number(req.body.artworkId));
  const qty = parseInt(req.body.quantity, 10);
  if (cart[id] !== undefined) {
    if (!qty || qty < 1) delete cart[id];
    else cart[id] = qty; // clamped to stock by cartDetails on render
  }
  res.redirect('/cart');
});

router.post('/cart/remove', (req, res) => {
  delete getCart(req)[String(Number(req.body.artworkId))];
  res.redirect('/cart');
});

module.exports = router;
