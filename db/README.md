# GuardDog AI Database Schema

This directory contains the database schema and migration scripts for the GuardDog AI fraud detection system.

## Overview

The database is designed for high-throughput webhook ingestion with minimal constraints to maintain "hot ingest" performance. The schema focuses on the core A3 scope tables needed for initial MVP deployment.

## Tables

### 1. `idempo_ledger`
Webhook idempotency tracking to prevent duplicate processing.

**Columns:**
- `shop_domain` (text, NOT NULL) - Shopify store domain
- `topic` (text, NOT NULL) - Webhook topic (e.g., 'orders/create')
- `webhook_id` (text, NOT NULL) - Unique webhook identifier
- `ts` (timestamptz, NOT NULL, DEFAULT now()) - Timestamp of webhook receipt

**Primary Key:** Composite (shop_domain, topic, webhook_id)

### 2. `raw_events`
Minimal order facts with hashed identifiers for privacy.

**Columns:**
- `shop_domain` (text) - Shopify store domain
- `order_id` (text) - Order identifier
- `ts` (timestamptz) - Order timestamp
- `ip_trunc` (cidr) - Truncated IP address for geolocation
- `email_hash` (text) - Hashed email address
- `device_hash` (text) - Hashed device fingerprint
- `issuer_cc` (text) - Credit card issuer country
- `billing_cc` (text) - Billing address country
- `shipping_cc` (text) - Shipping address country
- `avs_result` (text) - Address verification result
- `cvv_result` (text) - CVV verification result
- `amount_cents` (int) - Order amount in cents

**Indexes:**
- `idx_raw_events_shop_ts` on (shop_domain, ts)
- `idx_raw_events_shop_order` on (shop_domain, order_id)

### 3. `feat_velocity_hour`
Feature velocity tracking per shop, key type, and hourly buckets.

**Columns:**
- `shop_domain` (text, NOT NULL) - Shopify store domain
- `key_type` (text, NOT NULL) - Type of key: 'email', 'ip', 'device', 'bin'
- `key_hash` (text, NOT NULL) - Hashed value of the key
- `bucket_start` (timestamptz, NOT NULL) - Start of the hourly bucket
- `attempts` (int, NOT NULL, DEFAULT 0) - Number of attempts in this bucket

**Primary Key:** Composite (shop_domain, key_type, key_hash, bucket_start)

**Indexes:**
- `idx_feat_velocity_shop_key` on (shop_domain, key_type, key_hash)

**Functions:**
- `inc_velocity_hour(p_shop_domain, p_key_type, p_key_hash, p_bucket_start, p_inc)` - Increment attempt count for a key in an hourly bucket

### 4. `labels_feedback`
Merchant feedback on false positives and true positives for model improvement.

**Columns:**
- `shop_domain` (text) - Shopify store domain
- `order_id` (text) - Order identifier
- `label` (text) - Actual outcome: 'TP' (true positive) or 'FP' (false positive)
- `confidence` (int) - Merchant confidence in feedback (0-100)
- `ts` (timestamptz) - Feedback timestamp

**Constraints:**
- `label` must be either 'TP' or 'FP'
- `confidence` must be between 0 and 100

**Indexes:**
- `idx_labels_feedback_shop_order` on (shop_domain, order_id)

## Future Scope (B3/B4)

The following table is planned for future implementation and is not part of the initial A3 scope:

### `writeback_queue` (Migration 0004)
Queue for pending Shopify mutations with retry logic on 429 errors.

## Design Principles

### Hot Ingest
- No foreign key constraints between tables to maintain high throughput
- Minimal indexes to reduce write overhead
- Simple table structures for fast inserts

### Simple Purging
- No retention triggers baked into DDL
- Data retention policies implemented as separate jobs in Gate C
- Raw events designed for 90-day retention cycles

### Privacy First
- All PII is hashed before storage
- IP addresses stored as truncated CIDR blocks
- No direct storage of sensitive customer data

## Migrations

### Current Scope (A3)
- `0001_init.sql` - Create idempo_ledger and raw_events tables
- `0002_feature_buckets.sql` - Create feat_velocity_hour table and inc_velocity_hour function
- `0003_labels_feedback.sql` - Create labels_feedback table

### Future Scope (B3/B4)
- `0004_writeback_queue.sql` - Create writeback_queue table for Shopify mutations

## Running Migrations

Use the migration scripts in `db/scripts/`:

**Linux/macOS:**
```bash
./db/scripts/migrate.sh
```

**Windows:**
```cmd
db\scripts\migrate.bat
```

The migration runner will:
1. Create a `schema_migrations` table to track applied migrations
2. Apply SQL files in numerical order
3. Support dry-run mode for testing

## Testing

Run the test suite to validate the database schema:

```bash
cd api
pip install -r requirements-test.txt
pytest tests/test_db_schema.py -v
```

The tests verify:
- Existence of all required tables
- Correct primary keys on idempo_ledger and feat_velocity_hour
- Required indexes on all tables
- CIDR type for ip_trunc column
- Existence of inc_velocity_hour function

## Performance Considerations

- **Indexes:** Minimal indexes to balance query performance with write throughput
- **Constraints:** No foreign keys to avoid write overhead
- **Data Types:** Appropriate types (text, timestamptz, cidr) for efficient storage
- **Partitioning:** Future consideration for time-based partitioning on large tables

## Security

- **Connection:** Use environment variable `DATABASE_URL` for database connection
- **Permissions:** Minimal required permissions for application users
- **Encryption:** Data encrypted at rest (database-level configuration)
- **Access Control:** Row-level security considerations for multi-tenant isolation
