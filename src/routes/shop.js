const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const artworks = db.prepare('SELECT * FROM artworks WHERE is_published = 1 ORDER BY stock = 0, created_at DESC').all();
  res.render('home', { title: 'Gallery', artworks });
});

router.get('/art/:id', (req, res, next) => {
  const art = db.prepare('SELECT * FROM artworks WHERE id = ? AND is_published = 1').get(Number(req.params.id));
  if (!art) return next();
  const inCart = (req.session.cart || {})[art.id] || 0;
  res.render('artwork', { title: art.title, art, inCart });
});

router.get('/about', (req, res) => res.render('about', { title: 'About the artist' }));

module.exports = router;
