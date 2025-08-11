# Cursor Context — GuardDog AI (Shopify Fraud Advisory MVP)

## 1) TL;DR

* **Product:** Advisory-only fraud intelligence for EU Shopify merchants; low FP, explainable, PSD2 TRA-aware.
* **Non‑goals (MVP):** No auto-declines, no guarantee tier, no GPUs/Neo4j.
* **Tenets:** Fail‑open; Shopify‑compliant ingestion; minimal PII (hashed, per‑shop salt); p95 < 300 ms.
* **Stack:** Cloudflare Worker (webhooks) → FastAPI (scoring) → Postgres (features/labels). Optional Redis later.

---

## 2) Success Criteria

* **Latency:** p95 < 300 ms end‑to‑end; **error rate** < 0.5% steady.
* **Accuracy (MVP):** \~75–85% recall at 0.5–1.0% FP advice.
* **Ops:** Fail‑open returns APPROVE(degraded) on timeouts/errors; daily digest; GDPR webhooks.

---

## 3) High-Level Architecture

```mermaid
flowchart TD
  A[Shopify Webhooks] --> B[Cloudflare Worker\n• HMAC verify\n• Idempotency (shop,topic,webhook_id)\n• Rate limit per shop\n• Fast 200 + forward (500ms timeout)]
  B --> C[FastAPI /score\nnormalize→features→model→calibration→thresholds]
  C --> D[(Postgres)\nraw_events, idempo_ledger, feat_velocity_hour, labels_feedback, writeback_queue]
  C --> E[Advice JSON\n+ Reason Codes]
  E --> F[Shopify Admin\nOrder metafield + tag\n(optional Risk Assessment)]
  C --> G[Daily Digest / Feedback]
  C --> H[Metrics/Status]
```

---

## 4) Shopify Compliance (Must‑Follow)

* **Verify HMAC** on raw body (`X-Shopify-Hmac-SHA256`).
* **Idempotency key:** `(shop_domain, topic, X-Shopify-Webhook-Id)` → 200 OK on duplicate.
* **Fast 200** to Shopify; do scoring async or with a 500 ms timeout → **fail‑open** tag if degraded.
* **GDPR webhooks:** `customers/data_request`, `customers/redact`, `shop/redact` implemented.
* **Write-backs:** Order **metafield** (`guarddog.risk.summary`) + **tag**; optionally **Risk Assessments API**.
* **API version pinned** (e.g., `2025-04`) + minimal scopes (`read_orders`, `write_orders`).
* **Bulk backfill:** use GraphQL Bulk Operations; never REST loops for large history.

---

## 5) Contracts

### 5.1 Canonical Event (input to /score)

```json
{
  "shop": "acme.myshopify.com",
  "topic": "orders/create",
  "webhook_id": "...",
  "triggered_at": "2025-08-09T10:22:11Z",
  "order_id": "gid://shopify/Order/123",
  "placed_at": "2025-08-09T10:21:59Z",
  "amount": 79.90,
  "currency": "EUR",
  "email_hash": "sha256(user@x + shop_salt)",
  "device_hash": "sha256(fp + shop_salt)",
  "browser_ip": "83.55.42.11",
  "billing_country": "ES",
  "shipping_country": "PT",
  "bin": "457173",
  "avs": "Y",
  "cvv": "M",
  "line_count": 2
}
```

### 5.2 AdviceResponse (output from /score)

```json
{
  "risk": 34,
  "advice": "REVIEW",   
  "psd2": { "tra_candidate": true, "why": ["low_amount","low_velocity"] },
  "reasons": ["IP_BIN_COUNTRY_MISMATCH","VELOCITY_1H=3"],
  "degraded": false,
  "ts": "2025-08-09T10:22:55Z"
}
```

---

## 6) Data Model (DB)

* **idempo\_ledger** `(shop, topic, webhook_id)` PK.
* **raw\_events** minimal order facts (hashed identifiers; no PAN; 90‑day retention).
* **feat\_velocity\_hour** `(shop, key_type, key_hash, bucket_start)` → counts.
* **labels\_feedback** merchant FP/TP labels + confidence.
* **writeback\_queue** pending Shopify mutations with retry on 429.

---

## 7) Features & Model (MVP)

* **Features:** IP↔country distance, BIN↔country mismatch, velocity (1h/24h) per email/IP/device/BIN, AVS/CVV encodings, amount, line\_count.
* **Model:** LightGBM (CPU), **monotonic constraints** (safe↓ danger↑), class weights/focal BCE.
* **Calibration:** Beta or Venn‑Abers.
* **Thresholding:** profit‑aware + **Mondrian FP cap** per shop/hour.
* **Explainability:** top 3–5 reason codes (TreeSHAP mapping).

---

## 8) Performance & SLOs

* p95 latency < **300 ms**, error rate < **0.5%**, fail‑open rate < **0.2%**.
* Alerts when thresholds breached; status page update.

---

## 9) Security & Privacy

* HMAC on all webhooks; OAuth nonce/state on app auth.
* Per‑shop **salted hashing** of identifiers; minimal scopes.
* **90‑day purge** of PII; GDPR webhooks executed; DPIA one‑pager.
* Secrets via platform secret stores; never committed.

---

## 10) Branching, PRs, and DoD

* Branches: `feat/*`, `fix/*`, `chore/*`; Conventional Commits.
* **PR DoD:** tests green; k6 p95<300ms; HMAC/idempotency verified; API version pinned; docs updated; rollback plan.
* **CI:** lint/test, Docker build, k6 load test.

---

## 11) Testing

* **Unit:** features, calibration, thresholds, reason codes.
* **Integration:** Worker→API flow; idempotent replay; write-back retry on 429.
* **Load:** k6 5 rps (15m) + 50 rps spike (60s) → SLOs must hold.

---

## 12) Environments & Config

* **Env vars:**

  * `DATABASE_URL`, `SCORING_SECRET`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_API_VERSION`, `SENDGRID_API_KEY`.
  * Threshold knobs: `FP_TARGET`, `PROFIT_FN_EURO`, `PROFIT_FP_EURO`.
* **Deploy:** API on Fly.io; Worker on Cloudflare; DB on Supabase/Postgres.

---

## 13) Write‑Back Patterns

* **Metafield**: `guarddog.risk.summary` (full AdviceResponse JSON).
* **Tag**: `GuardDog-Risk:High|Medium|Low`.
* **Risk Assessments (optional)**: vendor assessment into Shopify Fraud analysis; also usable in Shopify Flow.

---

## 14) Feature Flags (per shop)

* `monitor_only` (no tags), `advisory_tags` (on/off), `threshold_offset`, `rate_limit`, `use_risk_assessment`.

---

## 15) Cursor Prompts (Usage Pattern)

**When creating/modifying files:**

```
Create/Modify file at PATH: <path/to/file>
Goal: <why this change exists>
Acceptance Criteria:
- Point A
- Point B
Tests:
- Unit test at <path/test_*.py or *.spec.ts> covering ...
Notes:
- Any migrations, flags, or docs updated
```

---

## 16) Roadmap (Revenue‑Gated)

* €200 MRR → Redis velocity cache.
* €500 MRR → Device entropy snippet.
* €1k MRR → Safe‑signal gate.
* €5k MRR → Light NN (ONNX) in shadow.
* €8k MRR → Graph embeddings (batch).

---

## 17) Glossary

* **FP:** False positive (legit order incorrectly flagged).
* **TRA:** Transaction Risk Analysis (PSD2 SCA exemption route).
* **Fail‑open:** On error/timeout, system returns APPROVE (degraded) to avoid conversion loss.
* **Mondrian FP cap:** Per‑segment quantile cutoff to control FP rate.

---

### Appendix A — Shopify Header Map (ingress)

* `X-Shopify-Shop-Domain` → `shop`
* `X-Shopify-Topic` → `topic`
* `X-Shopify-Webhook-Id` → `webhook_id`
* `X-Shopify-Hmac-Sha256` → HMAC verify against raw body

### Appendix B — Minimal DB Keys

* `idempo_ledger`: `(shop, topic, webhook_id)`
* `feat_velocity_hour`: `(shop, key_type, key_hash, bucket_start)`

---

**Use this file as the single source of truth for Cursor when generating code, tests, or docs.**
