import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  scenarios: {
    steady: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: '15m',
      preAllocatedVUs: 10,
      maxVUs: 20
    },
    burst: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 50,
      maxVUs: 100,
      startTime: '16m' // Start after steady test
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.005'],
    http_req_rate: ['rate>=4.5'], // Ensure we maintain close to 5 rps for steady
  },
};

// Test data - use environment variables for body and HMAC
const testBody = __ENV.TEST_BODY || JSON.stringify({
  id: `ord_${__VU}_${Date.now()}`,
  total_price: 19.99,
  currency: 'USD',
  shop_domain: 'test-shop.myshopify.com'
});

// HMAC should be precomputed using your actual APP_SECRET
const validHmacBase64 = __ENV.TEST_HMAC || 'dGVzdC1obWFjLWZvci1kZXZlbG9wbWVudA==';

export default function () {
  const url = __ENV.WORKER_URL || 'http://localhost:8787';
  
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Shop-Domain': 'dev.myshopify.com',
    'X-Shopify-Topic': 'orders/create',
    'X-Shopify-Webhook-Id': `${__VU}-${__ITER}`,
    'X-Shopify-Hmac-Sha256': validHmacBase64,
    'X-Shopify-API-Version': '2024-01'
  };

  const res = http.post(url, testBody, { headers });
  
  // Verify response
  check(res, { 
    'status is 200': (r) => r.status === 200,
    'response time < 300ms': (r) => r.timings.duration < 300,
    'has correlation id header': (r) => r.headers['X-Correlation-ID'] !== undefined,
  });

  // Small sleep to maintain rate
  sleep(0.2);
}

// Setup function to validate environment
export function setup() {
  const url = __ENV.WORKER_URL || 'http://localhost:8787';
  
  // Test basic connectivity
  const res = http.get(url);
  
  if (res.status !== 405) { // Should return "Method not allowed" for GET
    throw new Error(`Worker not responding correctly. Expected 405, got ${res.status}`);
  }
  
  console.log('✅ Worker connectivity verified');
  return { workerUrl: url };
}

// Teardown function
export function teardown(data) {
  console.log('🏁 Load test completed');
  console.log(`📊 Final metrics available at: ${data.workerUrl}`);
}
