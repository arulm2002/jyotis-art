// Starts the site in demo mode for trying it out locally: no setup file needed,
// a ready-made owner login, and checkout that completes without charging anyone.
const path = require('path');

if (process.env.NODE_ENV === 'production') {
  console.error('Demo mode is for trying the site on your own computer only.');
  process.exit(1);
}

Object.assign(process.env, {
  DEMO_PAYMENTS: 'true',
  STRIPE_SECRET_KEY: '',
  ADMIN_EMAIL: 'owner@demo.local',
  ADMIN_PASSWORD: 'demo-password',
  DATA_DIR: path.join(__dirname, '..', 'demo-data'),
});

const config = require('../src/config');
require('../server').listen(config.port, () => {
  console.log('');
  console.log(`  Open ${config.baseUrl} in your web browser.`);
  console.log('  Owner login:  owner@demo.local  /  demo-password');
  console.log('  Payments are in demo mode: nothing is charged.');
  console.log('  Press Ctrl+C here to stop the site.');
  console.log('');
});
