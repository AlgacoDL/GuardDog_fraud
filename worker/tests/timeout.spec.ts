import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleFailOpen } from '../src/failOpen';

// Mock the worker environment
const mockEnv = {
  DEGRADED_REQUESTS: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
};

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-123'
  }
});

describe('Timeout and Fail-Open Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('handleFailOpen - Success Case', () => {
    it('should return successful response within timeout', async () => {
      const mockResponse = new Response(JSON.stringify({ advice: 'APPROVE' }), { status: 200 });
      const fetchPromise = () => Promise.resolve(mockResponse);

      const result = await handleFailOpen(fetchPromise, 500, mockEnv);

      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ advice: 'APPROVE' });
    });

    it('should handle successful response with custom timeout', async () => {
      const mockResponse = new Response(JSON.stringify({ advice: 'REVIEW' }), { status: 200 });
      const fetchPromise = () => Promise.resolve(mockResponse);

      const result = await handleFailOpen(fetchPromise, 1000, mockEnv);

      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ advice: 'REVIEW' });
    });
  });

  describe('handleFailOpen - Timeout Case', () => {
    it('should return degraded response on timeout', async () => {
      const slowFetchPromise = () => new Promise<Response>((resolve) => {
        setTimeout(() => {
          resolve(new Response(JSON.stringify({ advice: 'APPROVE' }), { status: 200 }));
        }, 1000);
      });

      const resultPromise = handleFailOpen(slowFetchPromise, 500, mockEnv);
      
      // Fast-forward time to trigger timeout
      vi.advanceTimersByTime(600);
      
      const result = await resultPromise;

      expect(result.status).toBe(200); // Always 200 for fail-open
      const responseBody = await result.json();
      expect(responseBody.degraded).toBe(true);
      expect(responseBody.advice).toBe('APPROVE');
      expect(responseBody.reason).toContain('timeout');
      expect(responseBody.correlation_id).toBe('test-uuid-123');
    });

    it('should handle very short timeout', async () => {
      const slowFetchPromise = () => new Promise<Response>((resolve) => {
        setTimeout(() => {
          resolve(new Response(JSON.stringify({ advice: 'APPROVE' }), { status: 200 }));
        }, 100);
      });

      const resultPromise = handleFailOpen(slowFetchPromise, 50, mockEnv);
      
      // Fast-forward time to trigger timeout
      vi.advanceTimersByTime(60);
      
      const result = await resultPromise;

      expect(result.status).toBe(200);
      const responseBody = await result.json();
      expect(responseBody.degraded).toBe(true);
      expect(responseBody.reason).toContain('timeout after 50ms');
    });
  });

  describe('handleFailOpen - Error Case', () => {
    it('should return degraded response on fetch error', async () => {
      const errorFetchPromise = () => Promise.reject(new Error('Network error'));

      const result = await handleFailOpen(errorFetchPromise, 500, mockEnv);

      expect(result.status).toBe(200); // Always 200 for fail-open
      const responseBody = await result.json();
      expect(responseBody.degraded).toBe(true);
      expect(responseBody.advice).toBe('APPROVE');
      expect(responseBody.reason).toBe('Scoring API error - fail-open');
      expect(responseBody.correlation_id).toBe('test-uuid-123');
    });

    it('should handle different types of errors', async () => {
      const errorTypes = [
        new Error('Connection refused'),
        new TypeError('Invalid URL'),
        new RangeError('Invalid range value')
      ];

      for (const error of errorTypes) {
        const errorFetchPromise = () => Promise.reject(error);
        const result = await handleFailOpen(errorFetchPromise, 500, mockEnv);

        expect(result.status).toBe(200);
        const responseBody = await result.json();
        expect(responseBody.degraded).toBe(true);
        expect(responseBody.advice).toBe('APPROVE');
        // These errors don't contain 'timeout' so they should get the generic error message
        expect(responseBody.reason).toBe('Scoring API error - fail-open');
      }
    });
  });

  describe('handleFailOpen - Response Headers', () => {
    it('should include correct headers on degraded response', async () => {
      const errorFetchPromise = () => Promise.reject(new Error('Test error'));

      const result = await handleFailOpen(errorFetchPromise, 500, mockEnv);

      expect(result.headers.get('Content-Type')).toBe('application/json');
      expect(result.headers.get('X-Correlation-ID')).toBe('test-uuid-123');
      expect(result.headers.get('X-Degraded')).toBe('true');
      expect(result.headers.get('X-Processing-Time')).toMatch(/\d+ms/);
    });

    it('should include processing time header', async () => {
      const errorFetchPromise = () => Promise.reject(new Error('Test error'));

      const result = await handleFailOpen(errorFetchPromise, 500, mockEnv);

      const processingTime = result.headers.get('X-Processing-Time');
      expect(processingTime).toMatch(/^\d+ms$/);
      
      const timeValue = parseInt(processingTime!.replace('ms', ''));
      expect(timeValue).toBeGreaterThanOrEqual(0);
      expect(timeValue).toBeLessThan(100); // Should be very fast for immediate rejection
    });
  });

  describe('handleFailOpen - KV Storage', () => {
    it('should store degraded request in KV', async () => {
      const errorFetchPromise = () => Promise.reject(new Error('Test error'));

      await handleFailOpen(errorFetchPromise, 500, mockEnv);

      expect(mockEnv.DEGRADED_REQUESTS.put).toHaveBeenCalledWith(
        'degraded:test-uuid-123',
        expect.stringContaining('"degraded":true'),
        { expirationTtl: 86400 * 7 }
      );
    });

    it('should handle KV storage errors gracefully', async () => {
      mockEnv.DEGRADED_REQUESTS.put.mockRejectedValue(new Error('KV storage error'));

      const errorFetchPromise = () => Promise.reject(new Error('Test error'));

      // Should not throw error, should still return degraded response
      const result = await handleFailOpen(errorFetchPromise, 500, mockEnv);

      expect(result.status).toBe(200);
      const responseBody = await result.json();
      expect(responseBody.degraded).toBe(true);
    });
  });

  describe('Performance and Timing', () => {
    it('should complete quickly for immediate errors', async () => {
      const startTime = Date.now();
      const errorFetchPromise = () => Promise.reject(new Error('Immediate error'));

      await handleFailOpen(errorFetchPromise, 500, mockEnv);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in under 100ms for immediate errors
      expect(duration).toBeLessThan(100);
    });

    it('should respect timeout values', async () => {
      const timeouts = [100, 250, 500, 1000];

      for (const timeout of timeouts) {
        const slowFetchPromise = () => new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(new Response(JSON.stringify({ advice: 'APPROVE' }), { status: 200 }));
          }, timeout + 100); // Longer than timeout
        });

        const resultPromise = handleFailOpen(slowFetchPromise, timeout, mockEnv);
        
        // Fast-forward to just before timeout
        vi.advanceTimersByTime(timeout - 1);
        
        // Should still be pending
        expect(resultPromise).toBeInstanceOf(Promise);
        
        // Fast-forward past timeout
        vi.advanceTimersByTime(2);
        
        const result = await resultPromise;
        expect(result.status).toBe(200);
        const responseBody = await result.json();
        expect(responseBody.degraded).toBe(true);
        expect(responseBody.reason).toContain(`timeout after ${timeout}ms`);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero timeout', async () => {
      const slowFetchPromise = () => new Promise<Response>((resolve) => {
        setTimeout(() => {
          resolve(new Response(JSON.stringify({ advice: 'APPROVE' }), { status: 200 }));
        }, 100);
      });

      const resultPromise = handleFailOpen(slowFetchPromise, 0, mockEnv);
      
      // Should timeout immediately
      vi.advanceTimersByTime(1);
      
      const result = await resultPromise;

      expect(result.status).toBe(200);
      const responseBody = await result.json();
      expect(responseBody.degraded).toBe(true);
      expect(responseBody.reason).toContain('timeout after 0ms');
    });

    it('should handle very long timeout', async () => {
      const mockResponse = new Response(JSON.stringify({ advice: 'APPROVE' }), { status: 200 });
      const fetchPromise = () => Promise.resolve(mockResponse);

      const result = await handleFailOpen(fetchPromise, 30000, mockEnv); // 30 seconds

      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ advice: 'APPROVE' });
    });

    it('should handle fetch promise that never resolves', async () => {
      const neverResolvingPromise = () => new Promise<Response>(() => {
        // Never resolve or reject
      });

      const resultPromise = handleFailOpen(neverResolvingPromise, 100, mockEnv);
      
      // Fast-forward past timeout
      vi.advanceTimersByTime(150);
      
      const result = await resultPromise;

      expect(result.status).toBe(200);
      const responseBody = await result.json();
      expect(responseBody.degraded).toBe(true);
      expect(responseBody.reason).toContain('timeout after 100ms');
    });
  });
});
