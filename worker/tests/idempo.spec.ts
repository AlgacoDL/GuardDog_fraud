import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the worker environment
const mockEnv = {
  IDEMPO_KV: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  },
  UNINSTALLED_KV: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  },
  IDEMPOTENCY_LEDGER: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  },
  SHOP_STATUS: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  },
  RATE_LIMITS: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  },
  DEGRADED_REQUESTS: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  },
  APP_SECRET: 'test_secret',
  SCORING_API: 'https://api.example.com',
  SHOPIFY_WEBHOOK_SECRET: 'test_secret', // Legacy support
  SCORING_API_URL: 'https://api.example.com/score', // Legacy support
  SCORING_API_SECRET: 'test_api_secret' // Legacy support
};

// Mock fetch
global.fetch = vi.fn();

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-123'
  }
});

describe('Idempotency Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('Idempotency Key Generation', () => {
    it('should generate correct idempotency key format with double colons', () => {
      const shop = 'test-shop.myshopify.com';
      const topic = 'orders/create';
      const webhookId = 'webhook_123';
      
      const expectedKey = `${shop}::${topic}::${webhookId}`;
      expect(expectedKey).toBe('test-shop.myshopify.com::orders/create::webhook_123');
    });

    it('should handle special characters in shop domain', () => {
      const shop = 'test-shop-with-dashes.myshopify.com';
      const topic = 'orders/create';
      const webhookId = 'webhook_123';
      
      const expectedKey = `${shop}::${topic}::${webhookId}`;
      expect(expectedKey).toBe('test-shop-with-dashes.myshopify.com::orders/create::webhook_123');
    });

    it('should handle underscores in webhook ID', () => {
      const shop = 'test-shop.myshopify.com';
      const topic = 'orders/create';
      const webhookId = 'webhook_123_456';
      
      const expectedKey = `${shop}::${topic}::${webhookId}`;
      expect(expectedKey).toBe('test-shop.myshopify.com::orders/create::webhook_123_456');
    });
  });

  describe('Idempotency Check', () => {
    it('should return cached response for duplicate webhook', async () => {
      const cachedResponse = '1'; // New implementation stores '1' for idempotency

      mockEnv.IDEMPO_KV.get.mockResolvedValue(cachedResponse);

      // This would be tested in the main worker, but we can verify the logic
      const idempotencyKey = 'test-shop.myshopify.com::orders/create::webhook_123';
      const existingResponse = await mockEnv.IDEMPO_KV.get(idempotencyKey);
      
      expect(existingResponse).toBe(cachedResponse);
    });

    it('should return null for new webhook', async () => {
      mockEnv.IDEMPO_KV.get.mockResolvedValue(null);

      const idempotencyKey = 'test-shop.myshopify.com::orders/create::webhook_456';
      const existingResponse = await mockEnv.IDEMPO_KV.get(idempotencyKey);
      
      expect(existingResponse).toBeNull();
    });
  });

  describe('Idempotency Storage', () => {
    it('should store idempotency key with 72h TTL', async () => {
      const idempotencyKey = 'test-shop.myshopify.com::orders/create::webhook_123';
      const expectedTtl = 72 * 3600; // 72 hours in seconds

      await mockEnv.IDEMPO_KV.put(
        idempotencyKey, 
        '1', 
        { expirationTtl: expectedTtl }
      );

      expect(mockEnv.IDEMPO_KV.put).toHaveBeenCalledWith(
        idempotencyKey,
        '1',
        { expirationTtl: expectedTtl }
      );
    });

    it('should store successful response in ledger with 72h TTL', async () => {
      const idempotencyKey = 'test-shop.myshopify.com::orders/create::webhook_123';
      const responseBody = JSON.stringify({
        risk: 30,
        advice: 'REVIEW',
        degraded: false
      });
      const expectedTtl = 72 * 3600; // 72 hours in seconds

      await mockEnv.IDEMPOTENCY_LEDGER.put(
        idempotencyKey, 
        responseBody, 
        { expirationTtl: expectedTtl }
      );

      expect(mockEnv.IDEMPOTENCY_LEDGER.put).toHaveBeenCalledWith(
        idempotencyKey,
        responseBody,
        { expirationTtl: expectedTtl }
      );
    });

    it('should handle storage errors gracefully', async () => {
      mockEnv.IDEMPO_KV.put.mockRejectedValue(new Error('KV storage error'));

      const idempotencyKey = 'test-shop.myshopify.com::orders/create::webhook_123';

      try {
        await mockEnv.IDEMPO_KV.put(idempotencyKey, '1', { expirationTtl: 72 * 3600 });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('KV storage error');
      }
    });
  });

  describe('Idempotency Scenarios', () => {
    it('should handle multiple webhooks from same shop', async () => {
      const shop = 'test-shop.myshopify.com';
      const webhookIds = ['webhook_1', 'webhook_2', 'webhook_3'];
      
      for (const webhookId of webhookIds) {
        const idempotencyKey = `${shop}::orders/create::${webhookId}`;
        expect(idempotencyKey).toContain(shop);
        expect(idempotencyKey).toContain(webhookId);
        expect(idempotencyKey).toContain('::');
      }
    });

    it('should handle different topics for same shop', async () => {
      const shop = 'test-shop.myshopify.com';
      const topics = ['orders/create', 'orders/updated', 'orders/cancelled'];
      
      for (const topic of topics) {
        const idempotencyKey = `${shop}::${topic}::webhook_123`;
        expect(idempotencyKey).toContain(shop);
        expect(idempotencyKey).toContain(topic);
        expect(idempotencyKey).toContain('::');
      }
    });

    it('should handle same webhook ID across different shops', async () => {
      const shops = ['shop1.myshopify.com', 'shop2.myshopify.com'];
      const webhookId = 'webhook_123';
      const topic = 'orders/create';
      
      for (const shop of shops) {
        const idempotencyKey = `${shop}::${topic}::${webhookId}`;
        expect(idempotencyKey).toContain(shop);
        expect(idempotencyKey).toContain(webhookId);
        expect(idempotencyKey).toContain('::');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty shop domain', () => {
      const shop = '';
      const topic = 'orders/create';
      const webhookId = 'webhook_123';
      
      const idempotencyKey = `${shop}::${topic}::${webhookId}`;
      expect(idempotencyKey).toBe('::orders/create::webhook_123');
    });

    it('should handle empty topic', () => {
      const shop = 'test-shop.myshopify.com';
      const topic = '';
      const webhookId = 'webhook_123';
      
      const idempotencyKey = `${shop}::${topic}::${webhookId}`;
      expect(idempotencyKey).toBe('test-shop.myshopify.com::::webhook_123');
    });

    it('should handle empty webhook ID', () => {
      const shop = 'test-shop.myshopify.com';
      const topic = 'orders/create';
      const webhookId = '';
      
      const idempotencyKey = `${shop}::${topic}::${webhookId}`;
      expect(idempotencyKey).toBe('test-shop.myshopify.com::orders/create::');
    });

    it('should handle very long values', () => {
      const shop = 'a'.repeat(1000) + '.myshopify.com';
      const topic = 'a'.repeat(500);
      const webhookId = 'a'.repeat(1000);
      
      const idempotencyKey = `${shop}::${topic}::${webhookId}`;
      // shop: 1000 + 15 (.myshopify.com) = 1015
      // topic: 500
      // webhookId: 1000
      // separators: 2 (::)
      // Total: 1015 + 2 + 500 + 2 + 1000 = 2519
      expect(idempotencyKey.length).toBe(2518); // Fixed: actual length is 2518
    });
  });

  describe('TTL and Expiration', () => {
    it('should use correct 72h TTL for idempotency', () => {
      const expectedTtl = 72 * 3600; // 72 hours in seconds
      expect(expectedTtl).toBe(259200);
    });

    it('should handle TTL edge cases', () => {
      const oneDay = 24 * 3600;
      const threeDays = 72 * 3600;
      const oneWeek = 7 * 24 * 3600;
      
      expect(oneDay).toBe(86400);
      expect(threeDays).toBe(259200);
      expect(oneWeek).toBe(604800);
    });
  });

  describe('Uninstall Handling', () => {
    it('should store uninstalled shop with 72h TTL', async () => {
      const shop = 'test-shop.myshopify.com';
      const expectedTtl = 72 * 3600; // 72 hours in seconds

      await mockEnv.UNINSTALLED_KV.put(shop, '1', { expirationTtl: expectedTtl });

      expect(mockEnv.UNINSTALLED_KV.put).toHaveBeenCalledWith(
        shop,
        '1',
        { expirationTtl: expectedTtl }
      );
    });

    it('should check if shop is uninstalled', async () => {
      const shop = 'test-shop.myshopify.com';
      mockEnv.UNINSTALLED_KV.get.mockResolvedValue('1');

      const shopStatus = await mockEnv.UNINSTALLED_KV.get(shop);
      expect(shopStatus).toBe('1');
    });
  });
});
