const config = require('./config');

const stripe = config.stripeSecretKey ? require('stripe')(config.stripeSecretKey) : null;

module.exports = stripe;
