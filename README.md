# Jyoti's Art: Online Gallery and Shop

A small website where you can publish your daughter's artwork and sell it online.

**What visitors can do**
- Browse the gallery and open each piece to see its picture, description, medium, size, and price
- Create an account, log in, add pieces to a cart, and pay by card through Stripe's secure checkout page
- See their past orders and each order's status (paid or shipped)

**What you (the owner) can do** on the **Admin** page
- Upload a picture of a piece and add its title, description, medium, size, price, and how many are available
- Edit, hide, or delete pieces. A piece shows as **Sold** automatically when its last copy is bought
- See orders with the customer's name, email, and shipping address, and mark them **shipped**

Card details are entered only on Stripe's hosted payment page. They never touch this website.

---

## 1. Try it on your computer

You need [Node.js](https://nodejs.org) version 20 or newer.

```bash
npm install
cp .env.example .env
```

Open `.env` and set at least these:

```
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=choose-a-long-password
DEMO_PAYMENTS=true
```

Then start the site:

```bash
npm start
```

Open http://localhost:3000, click **Log in**, and sign in with your admin email and password. You'll land on the **Admin** page. Click **+ Add artwork** to upload your first piece.

With `DEMO_PAYMENTS=true`, checkout completes without charging anyone, so you can test the whole buying flow. Log out, create a customer account, and buy something.

## 2. Turn on real payments (Stripe)

1. Create a free account at https://stripe.com and finish the account activation steps (bank account for payouts, and so on).
2. In the Stripe Dashboard go to **Developers → API keys** and copy the **Secret key**. Start with the **test mode** key (`sk_test_...`).
3. In `.env`, set `STRIPE_SECRET_KEY=sk_test_...` and set `DEMO_PAYMENTS=false`.
4. Set `CURRENCY` to your currency (for example `usd`, `inr`, `jpy`) and `SHIPPING_COUNTRIES` to the countries you ship to.
5. Restart the site and place a test order with Stripe's test card `4242 4242 4242 4242`, any future expiry date, and any CVC.

**Webhook (recommended on the live site).** A webhook lets Stripe confirm payments even if the customer closes the browser before returning to your site.
- In Stripe go to **Developers → Webhooks → Add endpoint**.
- Endpoint URL: `https://YOUR-DOMAIN/webhooks/stripe`
- Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
- Copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

When everything works, switch to your **live** secret key (`sk_live_...`) and create the webhook again in live mode.

## 3. Put it on the internet

The site is a standard Node.js app. It stores everything (database and pictures) in the folder set by `DATA_DIR`, so the hosting service **must give it a persistent disk**. Otherwise uploads disappear when the site restarts.

Good options are [Render](https://render.com), [Railway](https://railway.app), and [Fly.io](https://fly.io). With any of them:

1. Connect this GitHub repository.
2. Build command: `npm install`. Start command: `npm start`. A `Dockerfile` is included if the host prefers Docker.
3. Add a persistent disk/volume (1 GB is plenty to start) mounted at, for example, `/data`.
4. Set these environment variables in the host's dashboard (the same names as in `.env.example`):
   - `NODE_ENV=production`
   - `DATA_DIR=/data`
   - `BASE_URL=https://your-domain` (the site's real public address)
   - `SESSION_SECRET` (a long random string: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SITE_NAME`, `ARTIST_NAME`, `CURRENCY`, `SHIPPING_COUNTRIES`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
   - Do **not** set `DEMO_PAYMENTS` on the live site.
5. Optionally connect your own domain name in the host's settings.

**Back up** the `DATA_DIR` folder from time to time. It contains every artwork, customer account, and order.

## 4. Everyday use

| Task | Where |
|---|---|
| Add a new piece | Admin → **+ Add artwork** |
| Change a price or description | Admin → **Edit** next to the piece |
| Hide a piece without deleting it | Edit → uncheck **Show in the gallery** |
| Sell prints (several copies) | Set **Quantity available** to the number of copies |
| See who bought what and where to ship it | Admin → **Orders** → click an order |
| Mark an order as sent | Open the order → status **shipped** → Save |
| Refund a customer | In the Stripe Dashboard (then mark the order **cancelled** here) |

To edit the text on the **About** page, change `views/about.ejs`. Colors and fonts are in `public/css/style.css`.

## For developers

- Stack: Node.js, Express 5, EJS templates, SQLite (`better-sqlite3`), Stripe Checkout
- `npm run dev` restarts the server on file changes
- `npm test` runs an end-to-end test (admin upload → customer signup → cart → demo checkout → sold)
- Project layout:
  - `server.js`: app setup, security headers, sessions
  - `src/routes/`: shop, auth, cart, checkout, account, admin, and Stripe webhook routes
  - `src/db.js`: database schema
  - `src/orders.js`: payment fulfillment (idempotent, so it is safe for the webhook and the success page to both run it)
  - `views/`: page templates
  - `public/`: CSS and small scripts
- Prices are stored as integers in the currency's smallest unit (cents). Zero-decimal currencies such as JPY are handled.
- Security: bcrypt password hashing, CSRF tokens on every form, session regeneration on login, login throttling, Helmet security headers, image-only uploads with random file names, and admin-only routes.
