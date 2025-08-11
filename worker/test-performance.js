const http = require('http');

// Test configuration
const TEST_DURATION = 30000; // 30 seconds
const REQUESTS_PER_SECOND = 5;
const TARGET_URL = 'http://127.0.0.1:8787';

// Test data
const testBody = JSON.stringify({
  id: `ord_${Date.now()}`,
  total_price: 19.99,
  currency: 'USD',
  shop_domain: 'test-shop.myshopify.com'
});

const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Shop-Domain': 'dev.myshopify.com',
  'X-Shopify-Topic': 'orders/create',
  'X-Shopify-Webhook-Id': 'test-123',
  'X-Shopify-Hmac-Sha256': 'dGVzdC1obWFjLWZvci1kZXZlbG9wbWVudA==',
  'X-Shopify-API-Version': '2024-01'
};

// Performance tracking
let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;
let responseTimes = [];

function makeRequest() {
  const startTime = Date.now();
  
  const req = http.request(TARGET_URL, {
    method: 'POST',
    headers: headers
  }, (res) => {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    responseTimes.push(responseTime);
    totalRequests++;
    
    if (res.statusCode === 200) {
      successfulRequests++;
    } else {
      failedRequests++;
    }
  });
  
  req.on('error', (err) => {
    failedRequests++;
    totalRequests++;
  });
  
  req.write(testBody);
  req.end();
}

// Start the test
console.log('Starting performance test...');
console.log(`Duration: ${TEST_DURATION/1000}s`);
console.log(`Target RPS: ${REQUESTS_PER_SECOND}`);

const interval = setInterval(makeRequest, 1000 / REQUESTS_PER_SECOND);

// Stop after test duration
setTimeout(() => {
  clearInterval(interval);
  
  // Calculate metrics
  const errorRate = (failedRequests / totalRequests) * 100;
  responseTimes.sort((a, b) => a - b);
  const p95Index = Math.floor(responseTimes.length * 0.95);
  const p95Latency = responseTimes[p95Index];
  
  console.log('\n=== Performance Test Results ===');
  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Successful: ${successfulRequests}`);
  console.log(`Failed: ${failedRequests}`);
  console.log(`Error Rate: ${errorRate.toFixed(2)}%`);
  console.log(`p95 Latency: ${p95Latency}ms`);
  console.log(`Average Latency: ${(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2)}ms`);
  
  // Check thresholds
  const p95Pass = p95Latency < 300;
  const errorPass = errorRate < 0.5;
  
  console.log('\n=== Thresholds ===');
  console.log(`p95 < 300ms: ${p95Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Error rate < 0.5%: ${errorPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Gate A Status: ${p95Pass && errorPass ? '🟢 GREEN' : '🔴 RED'}`);
  
  process.exit(p95Pass && errorPass ? 0 : 1);
}, TEST_DURATION);
