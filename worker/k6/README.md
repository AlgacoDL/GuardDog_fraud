# k6 Load Testing for GuardDog Fraud Worker

This directory contains k6 load tests to validate the worker meets **Gate A** acceptance criteria.

## Gate A Requirements

- **Load**: 5 requests per second (rps)
- **Duration**: 15 minutes
- **Performance**: p95 response time < 300ms
- **Reliability**: Error rate < 0.5%

## Prerequisites

1. Install k6: https://k6.io/docs/getting-started/installation/
2. Ensure your worker is running and accessible
3. Set the `WORKER_URL` environment variable
4. Generate valid HMAC for testing (see HMAC Generation section below)

## HMAC Generation

Before running tests, generate a valid HMAC for your test body:

```bash
# Set your APP_SECRET (same as wrangler.toml)
export APP_SECRET="your_shopify_app_secret"

# Generate HMAC
node hmac-gen.mjs
```

This will output the environment variables needed for k6:
```bash
export TEST_BODY='{"id":"demo","total_price":19.99,"currency":"USD","shop_domain":"test-shop.myshopify.com"}'
export TEST_HMAC='generated_hmac_here'
```

## Running the Tests

### Basic Smoke Test
```bash
# Set your worker URL and test data
export WORKER_URL="https://your-worker.your-domain.workers.dev"
export TEST_BODY='{"id":"demo","total_price":19.99,"currency":"USD","shop_domain":"test-shop.myshopify.com"}'
export TEST_HMAC='your_generated_hmac_here'

# Run the 15-minute load test
k6 run load.js
```

### With Custom Parameters
```bash
k6 run \
  --env WORKER_URL="https://your-worker.your-domain.workers.dev" \
  --out json=results.json \
  load.js
```

### Local Development
```bash
# Test against local worker
k6 run --env WORKER_URL="http://localhost:8787" load.js
```

## Test Configuration

The test includes two scenarios:

### Steady State (Gate A)
- **Constant arrival rate**: 5 rps
- **Duration**: 15 minutes (900 seconds)
- **Virtual Users**: 10-20 VUs
- **Thresholds**: 
  - p95 < 300ms
  - Error rate < 0.5%
  - Maintain ~5 rps

### Burst Test (Optional)
- **Constant arrival rate**: 50 rps
- **Duration**: 1 minute
- **Virtual Users**: 50-100 VUs
- **Start time**: After steady test completes (16m)
- **Purpose**: Validate headroom and burst handling

## HMAC Verification

**Important**: The test uses a precomputed HMAC for the static test body. For production testing:

1. **Option 1**: Generate valid HMACs using your actual `APP_SECRET`
2. **Option 2**: Create a test endpoint that bypasses HMAC verification
3. **Option 3**: Use the same HMAC for all requests (less secure but simpler for testing)

### Generating Valid HMACs
```javascript
// Example: Generate HMAC for test body
const crypto = require('crypto');
const body = JSON.stringify({ id: "test", total_price: 19.99 });
const hmac = crypto.createHmac('sha256', 'your-app-secret').update(body).digest('base64');
console.log('HMAC:', hmac);
```

## Expected Results

### Success Criteria (Gate A = Green)
- ✅ p95 response time < 300ms
- ✅ Error rate < 0.5%
- ✅ Maintains 5 rps throughout test
- ✅ All checks pass

### Failure Indicators
- ❌ p95 > 300ms (performance issue)
- ❌ Error rate > 0.5% (reliability issue)
- ❌ Cannot maintain 5 rps (capacity issue)

## Troubleshooting

### Common Issues

1. **Worker not responding**
   - Check if worker is deployed and running
   - Verify `WORKER_URL` is correct
   - Check worker logs for errors

2. **High error rates**
   - Verify HMAC signatures are valid
   - Check worker error logs
   - Ensure scoring API is accessible

3. **Slow response times**
   - Check worker CPU/memory usage
   - Verify KV store performance
   - Check scoring API response times

### Debug Mode
```bash
# Run with verbose logging
k6 run --verbose load.js
```

## Performance Tuning

If you're not meeting Gate A criteria:

1. **Optimize worker code**
   - Reduce KV operations
   - Optimize HMAC verification
   - Minimize JSON parsing overhead

2. **Infrastructure improvements**
   - Increase worker CPU/memory limits
   - Optimize KV store configuration
   - Use faster regions for deployment

3. **Scoring API optimization**
   - Reduce timeout from 500ms if possible
   - Optimize upstream API performance
   - Consider caching strategies

## Continuous Integration

Add this to your CI pipeline:

```yaml
- name: Run k6 Load Tests
  run: |
    export WORKER_URL="${{ secrets.WORKER_URL }}"
    k6 run --out json=results.json load.js
    
- name: Check Gate A Criteria
  run: |
    # Parse results.json and verify thresholds
    # Fail build if p95 > 300ms or error rate > 0.5%
```

## Monitoring

During the test, monitor:
- Worker metrics (CPU, memory, requests)
- KV store performance
- Scoring API response times
- Error rates and types

## Next Steps

After achieving **Gate A**:
1. Run longer duration tests (1+ hours)
2. Test failure scenarios (scoring API down)
3. Validate idempotency under load
4. Test uninstall flow performance
