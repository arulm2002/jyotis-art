const express = require('express');
const db = require('../db');
const config = require('../config');
const stripe = require('../stripe');
const { fulfillOrder, cancelOrder, shippingFromStripeSession } = require('../orders');

const router = express.Router();

router.post('/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !config.stripeWebhookSecret) return res.status(404).end();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), config.stripeWebhookSecret);
  } catch (err) {
    console.warn('[webhook] signature verification failed:', err.message);
    return res.status(400).send('Invalid signature');
  }

  const s = event.data.object;
  const order = s && s.id ? db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(s.id) : null;
  if (order) {
    if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && s.payment_status === 'paid') {
      fulfillOrder(order.id, shippingFromStripeSession(s));
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      cancelOrder(order.id);
    }
  }
  res.json({ received: true });
});

module.exports = router;
