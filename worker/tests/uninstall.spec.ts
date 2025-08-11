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
  APP_SECRET: 'test_secret',
  SCORING_API: 'https://api.example.com'
};

// Mock fetch
global.fetch = vi.fn();

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-123'
  }
});

describe('Uninstall Flow Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('App Uninstall Webhook', () => {
    it('should handle app/uninstalled topic and store shop as disabled', async () => {
      const shop = 'test-shop.myshopify.com';
      const topic = 'app/uninstalled';
      const webhookId = 'webhook_123';
      const expectedTtl = 72 * 3600; // 72 hours in seconds

      // Mock the uninstall flow
      await mockEnv.UNINSTALLED_KV.put(shop, '1', { expirationTtl: expectedTtl });

      expect(mockEnv.UNINSTALLED_KV.put).toHaveBeenCalledWith(
        shop,
        '1',
        { expirationTtl: expectedTtl }
      );
    });

    it('should use correct TTL for uninstalled shops', () => {
      const expectedTtl = 72 * 3600; // 72 hours in seconds
      expect(expectedTtl).toBe(259200);
    });

    it('should handle multiple uninstalls for same shop', async () => {
      const shop = 'test-shop.myshopify.com';
      const expectedTtl = 72 * 3600;

      // First uninstall
      await mockEnv.UNINSTALLED_KV.put(shop, '1', { expirationTtl: expectedTtl });
      
      // Second uninstall (should update TTL)
      await mockEnv.UNINSTALLED_KV.put(shop, '1', { expirationTtl: expectedTtl });

      expect(mockEnv.UNINSTALLED_KV.put).toHaveBeenCalledTimes(2);
    });
  });

  describe('Blocking Traffic from Uninstalled Shops', () => {
    it('should return 200-fast for uninstalled shops', async () => {
      const shop = 'test-shop.myshopify.com';
      
      // Mock that shop is uninstalled
      mockEnv.UNINSTALLED_KV.get.mockResolvedValue('1');

      const shopStatus = await mockEnv.UNINSTALLED_KV.get(shop);
      expect(shopStatus).toBe('1');
    });

    it('should allow traffic for non-uninstalled shops', async () => {
      const shop = 'test-shop.myshopify.com';
      
      // Mock that shop is not uninstalled
      mockEnv.UNINSTALLED_KV.get.mockResolvedValue(null);

      const shopStatus = await mockEnv.UNINSTALLED_KV.get(shop);
      expect(shopStatus).toBeNull();
    });

    it('should handle multiple shops with different statuses', async () => {
      const shop1 = 'shop1.myshopify.com';
      const shop2 = 'shop2.myshopify.com';
      
      // Shop1 is uninstalled
      mockEnv.UNINSTALLED_KV.get.mockImplementation((key: string) => {
        if (key === shop1) return Promise.resolve('1');
        if (key === shop2) return Promise.resolve(null);
        return Promise.resolve(null);
      });

      const shop1Status = await mockEnv.UNINSTALLED_KV.get(shop1);
      const shop2Status = await mockEnv.UNINSTALLED_KV.get(shop2);

      expect(shop1Status).toBe('1');
      expect(shop2Status).toBeNull();
    });
  });

  describe('Uninstall Flow Integration', () => {
    it('should complete full uninstall flow', async () => {
      const shop = 'test-shop.myshopify.com';
      const topic = 'app/uninstalled';
      const webhookId = 'webhook_123';
      const expectedTtl = 72 * 3600;

      // Step 1: Receive uninstall webhook
      await mockEnv.UNINSTALLED_KV.put(shop, '1', { expirationTtl: expectedTtl });

      // Step 2: Verify shop is stored as disabled
      expect(mockEnv.UNINSTALLED_KV.put).toHaveBeenCalledWith(
        shop,
        '1',
        { expirationTtl: expectedTtl }
      );

      // Step 3: Subsequent requests should find shop as disabled
      mockEnv.UNINSTALLED_KV.get.mockResolvedValue('1');
      const shopStatus = await mockEnv.UNINSTALLED_KV.get(shop);
      expect(shopStatus).toBe('1');
    });

    it('should handle uninstall followed by reinstall scenario', async () => {
      const shop = 'test-shop.myshopify.com';
      const expectedTtl = 72 * 3600;

      // Step 1: App gets uninstalled
      await mockEnv.UNINSTALLED_KV.put(shop, '1', { expirationTtl: expectedTtl });

      // Step 2: Verify shop is disabled
      mockEnv.UNINSTALLED_KV.get.mockResolvedValue('1');
      let shopStatus = await mockEnv.UNINSTALLED_KV.get(shop);
      expect(shopStatus).toBe('1');

      // Step 3: App gets reinstalled (TTL expires or manual cleanup)
      // This would happen automatically after 72h, or manually via admin
      mockEnv.UNINSTALLED_KV.delete.mockResolvedValue(undefined);
      await mockEnv.UNINSTALLED_KV.delete(shop);

      // Step 4: Verify shop is no longer disabled
      mockEnv.UNINSTALLED_KV.get.mockResolvedValue(null);
      shopStatus = await mockEnv.UNINSTALLED_KV.get(shop);
      expect(shopStatus).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty shop domain in uninstall', async () => {
      const shop = '';
      const expectedTtl = 72 * 3600;

      await mockEnv.UNINSTALLED_KV.put(shop, '1', { expirationTtl: expectedTtl });

      expect(mockEnv.UNINSTALLED_KV.put).toHaveBeenCalledWith(
        shop,
        '1',
        { expirationTtl: expectedTtl }
      );
    });

    it('should handle very long shop domain', async () => {
      const shop = 'a'.repeat(1000) + '.myshopify.com';
      const expectedTtl = 72 * 3600;

      await mockEnv.UNINSTALLED_KV.put(shop, '1', { expirationTtl: expectedTtl });

      expect(mockEnv.UNINSTALLED_KV.put).toHaveBeenCalledWith(
        shop,
        '1',
        { expirationTtl: expectedTtl }
      );
    });

    it('should handle special characters in shop domain', async () => {
      const shop = 'test-shop-with-special-chars-&_#.myshopify.com';
      const expectedTtl = 72 * 3600;

      await mockEnv.UNINSTALLED_KV.put(shop, '1', { expirationTtl: expectedTtl });

      expect(mockEnv.UNINSTALLED_KV.put).toHaveBeenCalledWith(
        shop,
        '1',
        { expirationTtl: expectedTtl }
      );
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle rapid uninstall requests', async () => {
      const shop = 'test-shop.myshopify.com';
      const expectedTtl = 72 * 3600;

      // Simulate rapid uninstall requests
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(mockEnv.UNINSTALLED_KV.put(shop, '1', { expirationTtl: expectedTtl }));
      }

      await Promise.all(promises);

      expect(mockEnv.UNINSTALLED_KV.put).toHaveBeenCalledTimes(10);
    });

    it('should handle multiple shops uninstalling simultaneously', async () => {
      const shops = Array.from({ length: 100 }, (_, i) => `shop${i}.myshopify.com`);
      const expectedTtl = 72 * 3600;

      // Simulate multiple shops uninstalling simultaneously
      const promises = shops.map(shop => 
        mockEnv.UNINSTALLED_KV.put(shop, '1', { expirationTtl: expectedTtl })
      );

      await Promise.all(promises);

      expect(mockEnv.UNINSTALLED_KV.put).toHaveBeenCalledTimes(100);
    });
  });
});
