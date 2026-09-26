const express = require('express');
const db = require('../db');
const { requireLogin } = require('../helpers');
const { orderWithItems } = require('../orders');

const router = express.Router();
router.use(requireLogin);

router.get('/orders', (req, res) => {
  const orders = db.prepare(`SELECT * FROM orders WHERE user_id = ? AND status != 'pending' ORDER BY created_at DESC, id DESC`).all(req.user.id);
  res.render('account/orders', { title: 'My orders', orders });
});

router.get('/orders/:id', (req, res, next) => {
  const order = orderWithItems(Number(req.params.id));
  if (!order || order.user_id !== req.user.id) return next();
  res.render('account/order', { title: `Order #${order.id}`, order, isNew: req.query.new === '1' });
});

module.exports = router;
