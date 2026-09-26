const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artshop-'));
Object.assign(process.env, {
  DATA_DIR: dataDir, DEMO_PAYMENTS: 'true', STRIPE_SECRET_KEY: '', SESSION_SECRET: 'test',
  ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'admin-pass-123', CURRENCY: 'usd',
});
const app = require('../server');

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

let server; let base;
test.before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

function client() {
  let cookie = '';
  async function req(method, url, body) {
    const headers = cookie ? { cookie } : {};
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body).toString(); }
    const res = await fetch(base + url, { method, headers, body: payload, redirect: 'manual' });
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  }
  const c = {
    get: (u) => req('GET', u),
    post: (u, b) => req('POST', u, b),
    async csrf(u = '/login') { return (await c.get(u)).text.match(/name="_csrf" value="([^"]+)"/)[1]; },
  };
  return c;
}

test('admin uploads art, customer registers, buys it, and it becomes sold', async () => {
  const admin = client();
  let t = await admin.csrf();
  let r = await admin.post('/login', { _csrf: t, email: 'admin@example.com', password: 'admin-pass-123' });
  assert.strictEqual(r.location, '/admin');

  // Missing CSRF is rejected
  const fdBad = new FormData();
  fdBad.append('title', 'x');
  r = await admin.post('/admin/artworks', fdBad);
  assert.strictEqual(r.status, 403);

  t = await admin.csrf('/admin/artworks/new');
  const fd = new FormData();
  fd.append('_csrf', t); fd.append('title', 'Sunflowers & <Sky>'); fd.append('description', 'Bright and happy');
  fd.append('medium', 'Acrylic'); fd.append('dimensions', '30 x 40 cm'); fd.append('price', '45.50');
  fd.append('stock', '1'); fd.append('is_published', 'on');
  fd.append('image', new Blob([PNG], { type: 'image/png' }), 'art.png');
  r = await admin.post('/admin/artworks', fd);
  assert.strictEqual(r.status, 302, r.text);

  const shopper = client();
  r = await shopper.get('/');
  assert.match(r.text, /Sunflowers &amp; &lt;Sky&gt;/);
  assert.match(r.text, /\$45\.50/);
  const id = r.text.match(/href="\/art\/(\d+)"/)[1];
  const img = r.text.match(/src="(\/uploads\/[^"]+)"/)[1];
  assert.strictEqual((await shopper.get(img)).status, 200);

  // Non-admin cannot reach admin
  assert.strictEqual((await shopper.get('/admin')).status, 302);

  t = await shopper.csrf(`/art/${id}`);
  await shopper.post('/cart/add', { _csrf: t, artworkId: id });
  r = await shopper.get('/cart');
  assert.match(r.text, /Log in to checkout/);

  // Checkout requires login
  t = await shopper.csrf('/cart');
  r = await shopper.post('/checkout', { _csrf: t });
  assert.match(r.location, /^\/login/);

  t = await shopper.csrf('/register');
  r = await shopper.post('/register', { _csrf: t, name: 'Pat', email: 'pat@example.com', password: 'longpassword', next: '/cart' });
  assert.strictEqual(r.location, '/cart');
  r = await shopper.get('/cart');
  assert.match(r.text, /Checkout securely/, 'cart survives registration');

  t = await shopper.csrf('/cart');
  r = await shopper.post('/checkout', { _csrf: t });
  assert.match(r.location, /^\/account\/orders\/\d+\?new=1$/);
  r = await shopper.get(r.location);
  assert.match(r.text, /Thank you for your purchase/);

  r = await shopper.get(`/art/${id}`);
  assert.match(r.text, /has been sold/);

  // Another customer cannot view the order
  const other = client();
  t = await other.csrf('/register');
  await other.post('/register', { _csrf: t, name: 'Sam', email: 'sam@example.com', password: 'longpassword' });
  assert.strictEqual((await other.get('/account/orders/1')).status, 404);

  r = await admin.get('/admin/orders');
  assert.match(r.text, /Pat/);
  t = await admin.csrf('/admin/orders/1');
  r = await admin.post('/admin/orders/1/status', { _csrf: t, status: 'shipped' });
  assert.match((await admin.get('/admin/orders/1')).text, /status-shipped/);
});

test('rejects bad login and duplicate email', async () => {
  const c = client();
  let t = await c.csrf();
  let r = await c.post('/login', { _csrf: t, email: 'admin@example.com', password: 'wrong' });
  assert.strictEqual(r.status, 401);
  t = await c.csrf('/register');
  r = await c.post('/register', { _csrf: t, name: 'X', email: 'admin@example.com', password: 'longpassword' });
  assert.strictEqual(r.status, 400);
});
