const db = require('./db');

// Cart lives in the session as { [artworkId]: quantity }.
function getCart(req) {
  if (!req.session.cart) req.session.cart = {};
  return req.session.cart;
}

function cartCount(req) {
  return Object.values(req.session.cart || {}).reduce((a, b) => a + b, 0);
}

// Resolve cart against the DB, dropping items that are gone/unpublished and clamping to stock.
function cartDetails(req) {
  const cart = getCart(req);
  const items = [];
  const notices = [];
  for (const [id, qty] of Object.entries(cart)) {
    const art = db.prepare('SELECT * FROM artworks WHERE id = ? AND is_published = 1').get(Number(id));
    if (!art || art.stock <= 0) {
      delete cart[id];
      notices.push(art ? `"${art.title}" has just been sold and was removed from your cart.` : 'An item in your cart is no longer available.');
      continue;
    }
    const quantity = Math.min(qty, art.stock);
    if (quantity !== qty) {
      cart[id] = quantity;
      notices.push(`Only ${art.stock} of "${art.title}" available; quantity updated.`);
    }
    items.push({ art, quantity, lineTotal: art.price_minor * quantity });
  }
  const total = items.reduce((sum, i) => sum + i.lineTotal, 0);
  return { items, total, notices };
}

module.exports = { getCart, cartCount, cartDetails };
