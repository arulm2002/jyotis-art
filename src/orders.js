const db = require('./db');

// Mark an order paid and reduce stock. Safe to call more than once (webhook + success page).
const fulfillOrder = db.transaction((orderId, shipping = {}) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order || order.status !== 'pending') return false;
  db.prepare(`UPDATE orders SET status = 'paid', paid_at = datetime('now'), shipping_name = ?, shipping_address = ? WHERE id = ?`)
    .run(shipping.name || null, shipping.address ? JSON.stringify(shipping.address) : null, orderId);
  const items = db.prepare('SELECT artwork_id, quantity FROM order_items WHERE order_id = ?').all(orderId);
  const dec = db.prepare(`UPDATE artworks SET stock = MAX(stock - ?, 0), updated_at = datetime('now') WHERE id = ?`);
  for (const item of items) if (item.artwork_id) dec.run(item.quantity, item.artwork_id);
  return true;
});

function cancelOrder(orderId) {
  db.prepare(`UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).run(orderId);
}

function orderWithItems(orderId) {
  const order = db.prepare(`SELECT o.*, u.email, u.name AS customer_name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?`).get(orderId);
  if (!order) return null;
  order.items = db.prepare(`SELECT oi.*, a.image FROM order_items oi LEFT JOIN artworks a ON a.id = oi.artwork_id WHERE oi.order_id = ?`).all(orderId);
  order.address = order.shipping_address ? JSON.parse(order.shipping_address) : null;
  return order;
}

// Stripe has moved shipping details around between API versions; accept either shape.
function shippingFromStripeSession(s) {
  const d = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || null;
  if (!d) return {};
  return { name: d.name, address: d.address };
}

module.exports = { fulfillOrder, cancelOrder, orderWithItems, shippingFromStripeSession };
