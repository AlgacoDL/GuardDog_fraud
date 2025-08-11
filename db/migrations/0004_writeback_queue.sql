-- Migration: 0004_writeback_queue.sql
-- Description: Create writeback_queue table for pending Shopify mutations (B3/B4 scope)
-- Date: 2025-01-XX

-- Create writeback_queue table for pending Shopify mutations
CREATE TABLE IF NOT EXISTS writeback_queue (
    id BIGSERIAL PRIMARY KEY,
    shop VARCHAR(255) NOT NULL,
    order_id VARCHAR(255) NOT NULL,
    webhook_id VARCHAR(255) NOT NULL,
    operation_type VARCHAR(50) NOT NULL, -- 'metafield', 'tag', 'risk_assessment'
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for writeback_queue
CREATE INDEX IF NOT EXISTS idx_writeback_queue_shop ON writeback_queue(shop);
CREATE INDEX IF NOT EXISTS idx_writeback_queue_order_id ON writeback_queue(order_id);
CREATE INDEX IF NOT EXISTS idx_writeback_queue_status ON writeback_queue(status);
CREATE INDEX IF NOT EXISTS idx_writeback_queue_next_retry ON writeback_queue(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_writeback_queue_shop_status ON writeback_queue(shop, status);

-- Create index for retry logic
CREATE INDEX IF NOT EXISTS idx_writeback_queue_retry ON writeback_queue(next_retry_at) 
WHERE status IN ('pending', 'failed') AND next_retry_at <= NOW();

-- Add foreign key constraints
ALTER TABLE writeback_queue 
ADD CONSTRAINT fk_writeback_queue_idempo 
FOREIGN KEY (shop, webhook_id) 
REFERENCES idempo_ledger(shop_domain, webhook_id);

-- Add comments for documentation
COMMENT ON TABLE writeback_queue IS 'Queue for pending Shopify mutations with retry logic on 429 errors';
COMMENT ON COLUMN writeback_queue.operation_type IS 'Type of Shopify operation: metafield, tag, risk_assessment';
COMMENT ON COLUMN writeback_queue.payload IS 'JSON payload for the Shopify API call';
COMMENT ON COLUMN writeback_queue.status IS 'Current status of the writeback operation';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_writeback_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_writeback_queue_updated_at
    BEFORE UPDATE ON writeback_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_writeback_queue_updated_at();

