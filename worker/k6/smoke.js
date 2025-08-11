import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.005'],
  },
};

// Test data
const testBody = JSON.stringify({
  id: `ord_${Date.now()}`,
  total_price: 19.99,
  currency: 'USD',
  shop_domain: 'test-shop.myshopify.com'
});

// Simple HMAC for testing (not cryptographically secure)
const testSecret = 'devsecret';
const validHmacBase64 = btoa('test-hmac-for-development');

export default function () {
  const url = __ENV.TARGET_URL || 'http://127.0.0.1:8787';
  
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Shop-Domain': 'dev.myshopify.com',
    'X-Shopify-Topic': 'orders/create',
    'X-Shopify-Webhook-Id': `${__VU}-${__ITER}`,
    'X-Shopify-Hmac-Sha256': validHmacBase64,
    'X-Shopify-API-Version': '2024-01'
  };

  const res = http.post(url, testBody, { headers });
  
  check(res, { 
    'status is 200': (r) => r.status === 200,
    'response time < 300ms': (r) => r.timings.duration < 300,
    'has correlation id header': (r) => r.headers['X-Correlation-ID'] !== undefined,
  });

  sleep(1);
}
