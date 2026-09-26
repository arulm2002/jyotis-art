const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const db = require('../db');
const config = require('../config');
const { requireAdmin, verifyCsrf, parsePrice, priceInputValue, flash } = require('../helpers');
const { orderWithItems } = require('../orders');

const router = express.Router();
router.use(requireAdmin);

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + IMAGE_TYPES[file.mimetype]),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
    const err = new Error('Please upload a JPG, PNG, WEBP or GIF image.');
    err.code = 'BAD_IMAGE';
    cb(err);
  },
}).single('image');

// Run multer, turning upload errors into a form error instead of a 500.
function handleUpload(req, res, next) {
  upload(req, res, (err) => {
    if (err) req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'That image is too large (15 MB max).' : err.message;
    next();
  });
}

function removeUpload(filename) {
  if (!filename) return;
  fs.unlink(path.join(config.uploadDir, path.basename(filename)), () => {});
}

function readArtworkForm(req) {
  const b = req.body || {};
  const form = {
    title: String(b.title || '').trim(),
    description: String(b.description || '').trim(),
    medium: String(b.medium || '').trim(),
    dimensions: String(b.dimensions || '').trim(),
    price: String(b.price || '').trim(),
    stock: String(b.stock ?? '1').trim(),
    is_published: b.is_published === 'on',
  };
  const errors = [];
  if (req.uploadError) errors.push(req.uploadError);
  if (!form.title) errors.push('Title is required.');
  const priceMinor = parsePrice(form.price);
  if (priceMinor === null) errors.push('Enter a valid price, for example 45 or 45.00.');
  const stock = parseInt(form.stock, 10);
  if (!Number.isInteger(stock) || stock < 0 || String(stock) !== form.stock) errors.push('Quantity available must be 0 or more.');
  return { form, errors, priceMinor, stock };
}

router.get('/', (req, res) => {
  const artworks = db.prepare('SELECT * FROM artworks ORDER BY created_at DESC, id DESC').all();
  const stats = db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(total_minor), 0) AS revenue FROM orders WHERE status IN ('paid', 'shipped')`).get();
  const toShip = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status = 'paid'`).get().n;
  res.render('admin/dashboard', { title: 'Admin', artworks, stats, toShip });
});

router.get('/artworks/new', (req, res) => {
  res.render('admin/artwork-form', { title: 'Add artwork', form: { stock: '1', is_published: true }, art: null });
});

router.post('/artworks', handleUpload, verifyCsrf, (req, res) => {
  const { form, errors, priceMinor, stock } = readArtworkForm(req);
  if (!req.file && !req.uploadError) errors.push('Please choose a picture of the artwork.');
  if (errors.length) {
    removeUpload(req.file && req.file.filename);
    return res.status(400).render('admin/artwork-form', { title: 'Add artwork', form, art: null, errors });
  }
  db.prepare(`INSERT INTO artworks (title, description, medium, dimensions, price_minor, stock, image, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(form.title, form.description, form.medium, form.dimensions, priceMinor, stock, req.file.filename, form.is_published ? 1 : 0);
  flash(req, 'success', `"${form.title}" was added.`);
  res.redirect('/admin');
});

router.get('/artworks/:id/edit', (req, res, next) => {
  const art = db.prepare('SELECT * FROM artworks WHERE id = ?').get(Number(req.params.id));
  if (!art) return next();
  const form = { ...art, price: priceInputValue(art.price_minor), stock: String(art.stock), is_published: !!art.is_published };
  res.render('admin/artwork-form', { title: `Edit "${art.title}"`, form, art });
});

router.post('/artworks/:id', handleUpload, verifyCsrf, (req, res, next) => {
  const art = db.prepare('SELECT * FROM artworks WHERE id = ?').get(Number(req.params.id));
  if (!art) { removeUpload(req.file && req.file.filename); return next(); }
  const { form, errors, priceMinor, stock } = readArtworkForm(req);
  if (errors.length) {
    removeUpload(req.file && req.file.filename);
    return res.status(400).render('admin/artwork-form', { title: `Edit "${art.title}"`, form, art, errors });
  }
  const image = req.file ? req.file.filename : art.image;
  db.prepare(`UPDATE artworks SET title = ?, description = ?, medium = ?, dimensions = ?, price_minor = ?, stock = ?, image = ?, is_published = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(form.title, form.description, form.medium, form.dimensions, priceMinor, stock, image, form.is_published ? 1 : 0, art.id);
  if (req.file) removeUpload(art.image);
  flash(req, 'success', `"${form.title}" was updated.`);
  res.redirect('/admin');
});

router.post('/artworks/:id/delete', (req, res) => {
  const art = db.prepare('SELECT * FROM artworks WHERE id = ?').get(Number(req.params.id));
  if (art) {
    db.prepare('DELETE FROM artworks WHERE id = ?').run(art.id);
    removeUpload(art.image);
    flash(req, 'success', `"${art.title}" was deleted.`);
  }
  res.redirect('/admin');
});

router.get('/orders', (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, u.name AS customer_name, u.email,
      (SELECT GROUP_CONCAT(title, ', ') FROM order_items WHERE order_id = o.id) AS titles
    FROM orders o JOIN users u ON u.id = o.user_id
    WHERE o.status != 'pending'
    ORDER BY o.created_at DESC, o.id DESC`).all();
  res.render('admin/orders', { title: 'Orders', orders });
});

router.get('/orders/:id', (req, res, next) => {
  const order = orderWithItems(Number(req.params.id));
  if (!order) return next();
  res.render('admin/order', { title: `Order #${order.id}`, order });
});

router.post('/orders/:id/status', (req, res) => {
  const status = req.body.status;
  if (['paid', 'shipped', 'cancelled'].includes(status)) {
    db.prepare(`UPDATE orders SET status = ? WHERE id = ? AND status != 'pending'`).run(status, Number(req.params.id));
    flash(req, 'success', `Order #${req.params.id} marked ${status}.`);
  }
  res.redirect(`/admin/orders/${Number(req.params.id)}`);
});

module.exports = router;
