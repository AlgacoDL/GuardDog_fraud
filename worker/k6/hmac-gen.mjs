#!/usr/bin/env node

/**
 * Generate HMAC for k6 testing
 * Usage: APP_SECRET=your_shopify_app_secret node hmac-gen.mjs
 */

import crypto from 'node:crypto';

const secret = process.env.APP_SECRET;
if (!secret) {
  console.error('❌ APP_SECRET environment variable is required');
  console.error('Usage: APP_SECRET=your_shopify_app_secret node hmac-gen.mjs');
  process.exit(1);
}

// Test body that matches what k6 will send
const body = JSON.stringify({ 
  id: "demo", 
  total_price: 19.99,
  currency: 'USD',
  shop_domain: 'test-shop.myshopify.com'
});

// Generate HMAC using the same algorithm as the worker
const sig = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');

console.log('✅ HMAC generated successfully');
console.log('');
console.log('📝 Test body:');
console.log(body);
console.log('');
console.log('🔐 HMAC (base64):');
console.log(sig);
console.log('');
console.log('🚀 k6 environment variables:');
console.log(`export TEST_BODY='${body}'`);
console.log(`export TEST_HMAC='${sig}'`);
console.log('');
console.log('💡 Or run k6 directly:');
console.log(`TEST_BODY='${body}' TEST_HMAC='${sig}' k6 run load.js`);
