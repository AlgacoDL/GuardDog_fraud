# Pull Request

## Description
<!-- Brief description of what this PR does -->

## Changes Made
<!-- List the key changes made in this PR -->
- 
- 
- 

## Definition of Done Checklist

### Testing
- [ ] Tests green (unit, integration, and relevant e2e tests)
- [ ] k6 load test shows p95 < 300ms under load
- [ ] Performance regression testing completed

### Security & Compliance
- [ ] HMAC verification implemented/verified for webhook endpoints
- [ ] Idempotency handling verified (shop, topic, webhook_id)
- [ ] Shopify API version pinned (e.g., `2025-04`)
- [ ] Minimal scopes verified (`read_orders`, `write_orders` only as needed)

### Code Quality
- [ ] Code follows conventional commits format
- [ ] Linting passes
- [ ] Code review completed
- [ ] No secrets committed (use platform secret stores)

### Documentation
- [ ] Documentation updated (if applicable)
- [ ] API contracts updated (if endpoints changed)
- [ ] Environment variables documented (if new ones added)

### Deployment Readiness
- [ ] Rollback plan documented below
- [ ] Database migrations tested (if applicable)
- [ ] Feature flags configured (if applicable)
- [ ] Monitoring/alerts updated (if needed)

## Rollback Plan

### Rollback Trigger Conditions
<!-- When should this change be rolled back? -->
- [ ] p95 latency > 300ms sustained for 5+ minutes
- [ ] Error rate > 0.5% sustained for 5+ minutes
- [ ] Fail-open rate > 0.2% sustained for 5+ minutes
- [ ] Critical functionality broken

### Rollback Steps
<!-- Detailed steps to rollback this change -->
1. 
2. 
3. 

### Rollback Verification
<!-- How to verify rollback was successful -->
- [ ] Metrics return to baseline
- [ ] Critical user flows working
- [ ] No error spikes in logs

### Emergency Contacts
- @founder (primary)
- <!-- Add other emergency contacts -->

## Testing Evidence
<!-- Screenshots, logs, or other evidence that testing was completed -->

## Additional Notes
<!-- Any other relevant information for reviewers -->
