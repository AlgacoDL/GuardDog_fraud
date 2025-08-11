# GuardDog AI Fraud Worker

Cloudflare Worker for processing Shopify webhooks with fraud advisory capabilities.

## Features

- **HMAC Verification**: Constant-time HMAC verification for Shopify webhook security
- **Idempotency**: Deduplication using (shop, topic, webhook_id) key
- **Rate Limiting**: Per-shop rate limiting to prevent abuse
- **Fail-Open**: Graceful degradation with 500ms timeout to scoring API
- **Shop Management**: Handles app uninstall to disable ingest for shops
- **Correlation IDs**: Request tracing and monitoring

## Architecture

```
Shopify Webhook → HMAC Verify → Rate Limit → Idempotency Check → Scoring API (500ms timeout) → Response
                                    ↓
                              Fail-Open (degraded=true)
```

## Setup

### Prerequisites

- Node.js 18+
- Wrangler CLI
- Cloudflare account with Workers and KV access

### Installation

```bash
cd worker
npm install
```

### Environment Variables

Set these secrets in Wrangler:

```bash
# Shopify webhook secret
wrangler secret put SHOPIFY_WEBHOOK_SECRET

# Scoring API configuration
wrangler secret put SCORING_API_URL
wrangler secret put SCORING_API_SECRET
```

### KV Namespaces

Create KV namespaces and update `wrangler.toml`:

```bash
# Idempotency ledger
wrangler kv:namespace create "IDEMPOTENCY_LEDGER"

# Shop status
wrangler kv:namespace create "SHOP_STATUS"

# Rate limits
wrangler kv:namespace create "RATE_LIMITS"

# Degraded requests
wrangler kv:namespace create "DEGRADED_REQUESTS"
```

## Development

### Local Development

```bash
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Type Checking

```bash
npm run type-check
```

## Deployment

### Staging

```bash
npm run deploy:staging
```

### Production

```bash
npm run deploy:production
```

## API Endpoints

### POST / (Webhook Handler)

Processes Shopify webhooks with the following flow:

1. **HMAC Verification**: Verifies `X-Shopify-Hmac-Sha256` header
2. **Rate Limiting**: Enforces per-shop limits
3. **Idempotency**: Checks for duplicate webhooks
4. **Scoring**: Forwards to scoring API with 500ms timeout
5. **Fail-Open**: Returns degraded response on timeout/error

#### Headers

- `X-Shopify-Shop-Domain`: Shop domain
- `X-Shopify-Topic`: Webhook topic (e.g., `orders/create`)
- `X-Shopify-Webhook-Id`: Unique webhook identifier
- `X-Shopify-Hmac-Sha256`: HMAC signature
- `X-Shopify-API-Version`: Shopify API version

#### Response Headers

- `X-Correlation-ID`: Request correlation ID
- `X-Processing-Time`: Processing time in milliseconds
- `X-Degraded`: `true` if fail-open occurred
- `X-Idempotency-Replay`: `true` if cached response

## Configuration

### Rate Limits

Default limits per shop:
- **Minute**: 60 requests
- **Hour**: 3600 requests  
- **Day**: 86400 requests

### Timeouts

- **Scoring API**: 500ms
- **Idempotency TTL**: 7 days
- **Shop Status TTL**: 1 year

## Monitoring

### Metrics

- Processing time (p95 < 300ms target)
- Error rate (< 0.5% target)
- Fail-open rate (< 0.2% target)
- Rate limit violations

### Logs

- Correlation IDs for request tracing
- Degraded request details in KV
- Rate limit violations
- HMAC verification failures

## Security

- **HMAC Verification**: Constant-time comparison prevents timing attacks
- **Rate Limiting**: Prevents abuse and DoS
- **Idempotency**: Prevents duplicate processing
- **Fail-Open**: Ensures system availability

## Testing

### Test Coverage

- **HMAC Verification**: Signature validation and timing attack prevention
- **Idempotency**: Duplicate webhook handling
- **Timeout Handling**: Fail-open mechanism
- **Rate Limiting**: Per-shop limits
- **Error Handling**: Graceful degradation

### Running Tests

```bash
# Unit tests
npm test

# Integration tests (if applicable)
npm run test:integration

# Load tests (if applicable)
npm run test:load
```

## Troubleshooting

### Common Issues

1. **HMAC Verification Fails**
   - Check webhook secret configuration
   - Verify raw body handling

2. **Rate Limiting Too Aggressive**
   - Adjust limits in `rateLimit.ts`
   - Check KV namespace configuration

3. **Timeout Issues**
   - Verify scoring API URL and credentials
   - Check network connectivity

4. **KV Storage Errors**
   - Verify KV namespace bindings
   - Check permissions and quotas

### Debug Mode

Enable debug logging by setting environment variable:

```bash
wrangler secret put DEBUG true
```

## Contributing

1. Follow conventional commit format
2. Add tests for new functionality
3. Ensure all tests pass
4. Update documentation as needed

## License

MIT License - see LICENSE file for details.
