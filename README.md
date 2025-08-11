# GuardDog AI - Shopify Fraud Advisory MVP

> **EU-focused fraud intelligence for Shopify merchants**  
> Advisory-only scoring with PSD2 TRA insights • Low false positives • Explainable decisions

## MVP Scope

**What we do:**
- Real-time fraud risk scoring for Shopify orders
- PSD2 Transaction Risk Analysis (TRA) candidate identification
- Explainable risk factors with actionable insights
- EU compliance with GDPR and PSD2 regulations
- Shopify webhook integration with metafield writebacks

**What we don't do (MVP):**
- Automatic order declines or holds
- Guaranteed fraud protection tiers
- Complex graph-based analysis
- Real-time customer communication

## Success Metrics

- **Latency:** p95 < 300ms end-to-end
- **Accuracy:** ~75-85% recall at 0.5-1.0% false positive rate
- **Reliability:** < 0.5% error rate, fail-open on timeouts
- **Compliance:** 100% GDPR webhook execution, PSD2 TRA awareness

## Architecture Overview

```
Shopify Webhooks → Cloudflare Worker → FastAPI Scoring → Postgres
                                    ↓
                            Risk Advice + PSD2 TRA
                                    ↓
                            Order Metafields + Tags
```

**Key Components:**
- **Cloudflare Worker:** Webhook ingestion, HMAC verification, rate limiting
- **FastAPI:** ML scoring, feature engineering, PSD2 TRA analysis
- **Postgres:** Feature storage, velocity tracking, merchant feedback
- **Shopify Integration:** Metafields, tags, optional Risk Assessments API

## PSD2 TRA Integration

- Identifies low-risk transactions eligible for SCA exemption
- Factors: amount thresholds, velocity patterns, device fingerprinting
- Helps merchants reduce friction while maintaining compliance
- EU-specific risk assessment aligned with regulatory requirements

## Privacy & Security

- Per-shop salted hashing of customer identifiers
- Minimal PII retention (90-day purge)
- HMAC verification on all webhooks
- GDPR-compliant data handling

## Getting Started

1. **Install App** from Shopify App Store
2. **Configure** risk thresholds and notification preferences
3. **Monitor** daily fraud digest and feedback loop
4. **Optimize** based on false positive feedback

## Target Audience

- **Solo founders** launching Shopify stores in EU
- **Early-stage merchants** seeking fraud intelligence
- **Compliance-focused** businesses requiring PSD2 TRA insights
- **Merchants** wanting explainable fraud decisions

## Roadmap

- **€200 MRR:** Redis velocity caching
- **€500 MRR:** Device fingerprinting enhancement
- **€1k MRR:** Safe-signal optimization
- **€5k MRR:** Neural network shadow deployment

## Technical Stack

- **Frontend:** Shopify App Bridge
- **Backend:** FastAPI + Python ML stack
- **Infrastructure:** Cloudflare Workers + Fly.io + Supabase
- **ML:** LightGBM with monotonic constraints

## Support

For technical questions or feature requests, please open an issue in this repository.

---

*Built for EU merchants who value transparency, compliance, and actionable fraud intelligence.*
