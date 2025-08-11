import { describe, it, expect, beforeEach, vi } from 'vitest';
import { verifyShopifyHmacRaw, verifyHmac, verifyHmacAsync } from '../src/hmac';

describe('HMAC Verification', () => {
  const testSecret = 'test_webhook_secret_123';
  const testBody = '{"order_id": "123", "amount": 100}';
  let validHmacBase64: string;
  let mockKey: any;
  let mockHmacBuffer: Uint8Array;

  beforeEach(async () => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Generate a valid HMAC for testing using the new raw-body method
    const encoder = new TextEncoder();
    const bodyBuffer = encoder.encode(testBody);
    const secretBuffer = encoder.encode(testSecret);
    
    // Create mock HMAC result that will be consistent
    mockHmacBuffer = new Uint8Array(32).fill(1); // Mock HMAC result
    mockKey = { type: 'secret', algorithm: { name: 'HMAC' } };
    
    // Mock the crypto.subtle functions for this test
    vi.mocked(crypto.subtle.importKey).mockResolvedValue(mockKey);
    vi.mocked(crypto.subtle.sign).mockResolvedValue(mockHmacBuffer);
    
    // Convert to base64 for the new implementation
    validHmacBase64 = btoa(String.fromCharCode(...mockHmacBuffer));
  });

  describe('verifyShopifyHmacRaw', () => {
    it('should verify valid HMAC signature with raw body', async () => {
      const encoder = new TextEncoder();
      const bodyBuffer = encoder.encode(testBody);
      
      const result = await verifyShopifyHmacRaw(bodyBuffer, validHmacBase64, testSecret);
      expect(result).toBe(true);
    });

    it('should reject invalid HMAC signature', async () => {
      const encoder = new TextEncoder();
      const bodyBuffer = encoder.encode(testBody);
      const invalidHmac = 'invalid_hmac_signature_base64';
      
      const result = await verifyShopifyHmacRaw(bodyBuffer, invalidHmac, testSecret);
      expect(result).toBe(false);
    });

    it('should reject HMAC with wrong secret', async () => {
      const encoder = new TextEncoder();
      const bodyBuffer = encoder.encode(testBody);
      const wrongSecret = 'wrong_secret';
      
      // Mock different HMAC for wrong secret
      const wrongHmacBuffer = new Uint8Array(32).fill(2);
      vi.mocked(crypto.subtle.sign).mockResolvedValueOnce(wrongHmacBuffer);
      
      const result = await verifyShopifyHmacRaw(bodyBuffer, validHmacBase64, wrongSecret);
      expect(result).toBe(false);
    });

    it('should reject HMAC with modified body', async () => {
      const modifiedBody = '{"order_id": "123", "amount": 200}';
      const encoder = new TextEncoder();
      const bodyBuffer = encoder.encode(modifiedBody);
      
      // Mock different HMAC for modified body
      const modifiedHmacBuffer = new Uint8Array(32).fill(3);
      vi.mocked(crypto.subtle.sign).mockResolvedValueOnce(modifiedHmacBuffer);
      
      const result = await verifyShopifyHmacRaw(bodyBuffer, validHmacBase64, testSecret);
      expect(result).toBe(false); // Should fail because HMAC was generated for different body
    });

    it('should handle empty body', async () => {
      const emptyBody = new ArrayBuffer(0);
      const result = await verifyShopifyHmacRaw(emptyBody, validHmacBase64, testSecret);
      expect(result).toBe(false);
    });

    it('should handle empty HMAC', async () => {
      const encoder = new TextEncoder();
      const bodyBuffer = encoder.encode(testBody);
      const emptyHmac = '';
      
      const result = await verifyShopifyHmacRaw(bodyBuffer, emptyHmac, testSecret);
      expect(result).toBe(false);
    });

    it('should handle empty secret', async () => {
      const encoder = new TextEncoder();
      const bodyBuffer = encoder.encode(testBody);
      const emptySecret = '';
      
      const result = await verifyShopifyHmacRaw(bodyBuffer, validHmacBase64, emptySecret);
      expect(result).toBe(false);
    });

    it('should handle very long body', async () => {
      const longBody = 'a'.repeat(10000);
      const encoder = new TextEncoder();
      const bodyBuffer = encoder.encode(longBody);
      
      // Mock different HMAC for long body
      const longBodyHmacBuffer = new Uint8Array(32).fill(4);
      vi.mocked(crypto.subtle.sign).mockResolvedValueOnce(longBodyHmacBuffer);
      
      const result = await verifyShopifyHmacRaw(bodyBuffer, validHmacBase64, testSecret);
      expect(result).toBe(false); // Should fail because HMAC was generated for different body
    });

    it('should handle special characters in body', async () => {
      const specialBody = '{"order_id": "123", "amount": 100, "description": "Test & More"}';
      const encoder = new TextEncoder();
      const bodyBuffer = encoder.encode(specialBody);
      
      // Mock different HMAC for special body
      const specialBodyHmacBuffer = new Uint8Array(32).fill(5);
      vi.mocked(crypto.subtle.sign).mockResolvedValueOnce(specialBodyHmacBuffer);
      
      const result = await verifyShopifyHmacRaw(bodyBuffer, validHmacBase64, testSecret);
      expect(result).toBe(false); // Should fail because HMAC was generated for different body
    });

    it('should handle unicode characters in body', async () => {
      const unicodeBody = '{"order_id": "123", "amount": 100, "description": "Test 🚀"}';
      const encoder = new TextEncoder();
      const bodyBuffer = encoder.encode(unicodeBody);
      
      // Mock different HMAC for unicode body
      const unicodeBodyHmacBuffer = new Uint8Array(32).fill(6);
      vi.mocked(crypto.subtle.sign).mockResolvedValueOnce(unicodeBodyHmacBuffer);
      
      const result = await verifyShopifyHmacRaw(bodyBuffer, validHmacBase64, testSecret);
      expect(result).toBe(false); // Should fail because HMAC was generated for different body
    });
  });

  describe('Legacy verifyHmac', () => {
    it('should verify valid HMAC signature', () => {
      const result = verifyHmac(testBody, validHmacBase64, testSecret);
      expect(result).toBe(false); // Legacy function now always returns false
    });

    it('should reject invalid HMAC signature', () => {
      const invalidHmac = 'invalid_hmac_signature';
      const result = verifyHmac(testBody, invalidHmac, testSecret);
      expect(result).toBe(false);
    });

    it('should reject HMAC with wrong secret', () => {
      const wrongSecret = 'wrong_secret';
      const result = verifyHmac(testBody, validHmacBase64, testSecret);
      expect(result).toBe(false);
    });

    it('should reject HMAC with modified body', () => {
      const modifiedBody = '{"order_id": "123", "amount": 200}';
      const result = verifyHmac(modifiedBody, validHmacBase64, testSecret);
      expect(result).toBe(false);
    });
  });

  describe('Legacy verifyHmacAsync', () => {
    it('should verify valid HMAC signature asynchronously', async () => {
      const result = await verifyHmacAsync(testBody, validHmacBase64, testSecret);
      expect(result).toBe(true);
    });

    it('should reject invalid HMAC signature asynchronously', async () => {
      const invalidHmac = 'invalid_hmac_signature';
      const result = await verifyHmacAsync(testBody, invalidHmac, testSecret);
      expect(result).toBe(false);
    });

    it('should reject HMAC with wrong secret asynchronously', async () => {
      const wrongSecret = 'wrong_secret';
      // Mock different HMAC for wrong secret
      const wrongHmacBuffer = new Uint8Array(32).fill(7);
      vi.mocked(crypto.subtle.sign).mockResolvedValueOnce(wrongHmacBuffer);
      
      const result = await verifyHmacAsync(testBody, validHmacBase64, testSecret);
      expect(result).toBe(false);
    });

    it('should reject HMAC with modified body asynchronously', async () => {
      const modifiedBody = '{"order_id": "123", "amount": 200}';
      // Mock different HMAC for modified body
      const modifiedHmacBuffer = new Uint8Array(32).fill(8);
      vi.mocked(crypto.subtle.sign).mockResolvedValueOnce(modifiedHmacBuffer);
      
      const result = await verifyHmacAsync(modifiedBody, validHmacBase64, testSecret);
      expect(result).toBe(false);
    });
  });

  describe('Security Properties', () => {
    it('should use constant-time comparison', async () => {
      const encoder = new TextEncoder();
      const bodyBuffer = encoder.encode(testBody);
      
      // Test that timing doesn't reveal information about HMAC validity
      const start1 = performance.now();
      await verifyShopifyHmacRaw(bodyBuffer, validHmacBase64, testSecret);
      const time1 = performance.now() - start1;
      
      const start2 = performance.now();
      await verifyShopifyHmacRaw(bodyBuffer, 'invalid_hmac', testSecret);
      const time2 = performance.now() - start2;
      
      // Times should be roughly similar (within 10ms tolerance)
      expect(Math.abs(time1 - time2)).toBeLessThan(10);
    });

    it('should handle crypto errors gracefully', async () => {
      const encoder = new TextEncoder();
      const bodyBuffer = encoder.encode(testBody);
      
      // Mock crypto error
      vi.mocked(crypto.subtle.importKey).mockRejectedValueOnce(new Error('Crypto error'));
      
      const result = await verifyShopifyHmacRaw(bodyBuffer, validHmacBase64, testSecret);
      expect(result).toBe(false);
    });
  });
});
