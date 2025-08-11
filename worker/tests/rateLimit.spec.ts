import { describe, it, expect, beforeEach, vi } from 'vitest';
import { allowShop } from '../src/rateLimit';

function makeKV() {
  return {
    get: vi.fn<Parameters<KVNamespace["get"]>, ReturnType<KVNamespace["get"]>>()
          .mockResolvedValue(null),
    put: vi.fn<Parameters<KVNamespace["put"]>, ReturnType<KVNamespace["put"]>>()
          .mockResolvedValue(undefined),
  } as unknown as KVNamespace;
}

describe('Rate Limiting', () => {
  let kv: KVNamespace;
  const env = {} as any;

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    kv = makeKV();
    (env as any).IDEMPO_KV = kv;  // inject fresh KV per test
  });

  describe('allowShop', () => {
    it('allows first request and consumes a token', async () => {
      // first request => get() returns null -> burst tokens -> consume -> put()
      const ok = await allowShop(env, 'test-shop.myshopify.com', 30, 2, 3600);
      expect(ok).toBe(true);

      expect(kv.put).toHaveBeenCalledTimes(1);
      const [key, payload, opts] = (kv.put as any).mock.calls[0];
      expect(key).toBe('rl:test-shop.myshopify.com');
      expect(JSON.parse(payload).tokens).toBe(29);
      expect(opts).toMatchObject({ expirationTtl: 3600 });
    });

    it('allows request when tokens are available', async () => {
      const existingRecord = JSON.stringify({ t: Math.floor(Date.now() / 1000), tokens: 15 });
      (kv.get as any).mockResolvedValueOnce(existingRecord);

      const ok = await allowShop(env, 'test-shop.myshopify.com');
      expect(ok).toBe(true);

      expect(kv.put).toHaveBeenCalledTimes(1);
      const [key, payload, opts] = (kv.put as any).mock.calls[0];
      expect(key).toBe('rl:test-shop.myshopify.com');
      expect(JSON.parse(payload).tokens).toBe(14);
      expect(opts).toMatchObject({ expirationTtl: 3600 });
    });

    it('refills tokens over time', async () => {
      const oldTime = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
      const existingRecord = JSON.stringify({ t: oldTime, tokens: 0 });
      (kv.get as any).mockResolvedValueOnce(existingRecord);

      const ok = await allowShop(env, 'test-shop.myshopify.com');
      expect(ok).toBe(true);

      // Should refill 20 tokens (10 seconds * 2 per second) but cap at burst of 30
      expect(kv.put).toHaveBeenCalledTimes(1);
      const [key, payload, opts] = (kv.put as any).mock.calls[0];
      expect(key).toBe('rl:test-shop.myshopify.com');
      expect(JSON.parse(payload).tokens).toBe(19);
      expect(opts).toMatchObject({ expirationTtl: 3600 });
    });

    it('denies when bucket empty', async () => {
      // simulate empty bucket persisted earlier
      (kv.get as any).mockResolvedValueOnce(JSON.stringify({ t: Math.floor(Date.now()/1000), tokens: 0 }));
      const ok = await allowShop(env, 'test-shop.myshopify.com');
      expect(ok).toBe(false);
      expect(kv.put).toHaveBeenCalledTimes(1); // still persists state
    });

    it('caps tokens at burst limit', async () => {
      const oldTime = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago
      const existingRecord = JSON.stringify({ t: oldTime, tokens: 0 });
      (kv.get as any).mockResolvedValueOnce(existingRecord);

      const ok = await allowShop(env, 'test-shop.myshopify.com');
      expect(ok).toBe(true);

      // Should refill 200 tokens but cap at burst of 30
      expect(kv.put).toHaveBeenCalledTimes(1);
      const [key, payload, opts] = (kv.put as any).mock.calls[0];
      expect(key).toBe('rl:test-shop.myshopify.com');
      expect(JSON.parse(payload).tokens).toBe(29);
      expect(opts).toMatchObject({ expirationTtl: 3600 });
    });

    it('handles custom burst and refill rates', async () => {
      const ok = await allowShop(env, 'test-shop.myshopify.com', 50, 5, 120);
      expect(ok).toBe(true);

      expect(kv.put).toHaveBeenCalledTimes(1);
      const [key, payload, opts] = (kv.put as any).mock.calls[0];
      expect(key).toBe('rl:test-shop.myshopify.com');
      expect(JSON.parse(payload).tokens).toBe(49);
      expect(opts).toMatchObject({ expirationTtl: 120 });
    });

    it('fails-open on KV errors', async () => {
      (kv.get as any).mockRejectedValueOnce(new Error('KV error'));

      const ok = await allowShop(env, 'test-shop.myshopify.com');
      expect(ok).toBe(true); // Fail-open behavior
    });

    it('fails-open on malformed KV data', async () => {
      (kv.get as any).mockResolvedValueOnce('invalid-json');

      const ok = await allowShop(env, 'test-shop.myshopify.com');
      expect(ok).toBe(true); // Fail-open behavior
    });
  });
});
