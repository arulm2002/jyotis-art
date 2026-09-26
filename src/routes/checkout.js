const express = require('express');
const db = require('../db');
const config = require('../config');
const stripe = require('../stripe');
const { cartDetails } = require('../cart');
const { flash, requireLogin } = require('../helpers');
const { fulfillOrder, orderWithItems, shippingFromStripeSession } = require('../orders');

const router = express.Router();

const createOrder = db.transaction((userId, items, total) => {
  const info = db.prepare('INSERT INTO orders (user_id, total_minor, currency) VALUES (?, ?, ?)').run(userId, total, config.currency);
  const addItem = db.prepare('INSERT INTO order_items (order_id, artwork_id, title, price_minor, quantity) VALUES (?, ?, ?, ?, ?)');
  for (const { art, quantity } of items) addItem.run(info.lastInsertRowid, art.id, art.title, art.price_minor, quantity);
  return Number(info.lastInsertRowid);
});

router.post('/checkout', requireLogin, async (req, res) => {
  const { items, total, notices } = cartDetails(req);
  if (notices.length) {
    notices.forEach((m) => flash(req, 'info', m));
    return res.redirect('/cart');
  }
  if (!items.length) return res.redirect('/cart');

  if (!stripe && !config.demoPayments) {
    flash(req, 'error', 'Online payments are not set up yet. Please check back soon.');
    return res.redirect('/cart');
  }

  const orderId = createOrder(req.user.id, items, total);

  if (!stripe) {
    // Demo mode: no real payment, useful for trying the site out locally.
    fulfillOrder(orderId, { name: req.user.name });
    req.session.cart = {};
    return res.redirect(`/account/orders/${orderId}?new=1`);
  }

  const publicImages = config.baseUrl.startsWith('https://');
  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: req.user.email,
    client_reference_id: String(orderId),
    metadata: { order_id: String(orderId) },
    line_items: items.map(({ art, quantity }) => ({
      quantity,
      price_data: {
        currency: config.currency,
        unit_amount: art.price_minor,
        product_data: {
          name: art.title,
          ...(art.description ? { description: art.description.slice(0, 300) } : {}),
          ...(publicImages ? { images: [`${config.baseUrl}/uploads/${art.image}`] } : {}),
        },
      },
    })),
    shipping_address_collection: { allowed_countries: config.shippingCountries },
    success_url: `${config.baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.baseUrl}/cart`,
  });
  db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?').run(checkout.id, orderId);
  res.redirect(303, checkout.url);
});

router.get('/checkout/success', requireLogin, async (req, res, next) => {
  if (!stripe || typeof req.query.session_id !== 'string') return next();
  const order = db.prepare('SELECT * FROM orders WHERE stripe_session_id = ? AND user_id = ?').get(req.query.session_id, req.user.id);
  if (!order) return next();
  const checkout = await stripe.checkout.sessions.retrieve(req.query.session_id);
  if (checkout.payment_status === 'paid') {
    fulfillOrder(order.id, shippingFromStripeSession(checkout));
    req.session.cart = {};
  }
  res.redirect(`/account/orders/${order.id}?new=1`);
});

module.exports = router;
