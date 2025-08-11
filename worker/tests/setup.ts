// Test setup file for Vitest
import { vi } from 'vitest';

// Define Cloudflare Workers types for testing
declare global {
  interface KVNamespace {
    get(key: string, options?: KVNamespaceGetOptions<"text">): Promise<string | null>;
    put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult<unknown>>;
  }

  interface KVNamespaceGetOptions<T> {
    type?: T;
    cacheTtl?: number;
  }

  interface KVNamespacePutOptions {
    expirationTtl?: number;
    expiration?: number;
  }

  interface KVNamespaceListOptions {
    limit?: number;
    prefix?: string;
    cursor?: string;
  }

  interface KVNamespaceListResult<T> {
    keys: Array<{ name: string; expiration?: number; metadata?: T }>;
    list_complete: boolean;
    cursor?: string;
  }
}

// Mock Cloudflare Workers environment
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-123',
    subtle: {
      importKey: vi.fn(),
      sign: vi.fn()
    }
  }
});

// Mock fetch globally
global.fetch = vi.fn();

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn()
};

// Mock performance API
Object.defineProperty(global, 'performance', {
  value: {
    now: () => Date.now()
  }
});

// Mock setTimeout and clearTimeout for timer tests
global.setTimeout = vi.fn((callback, delay) => {
  return 12345; // Return a mock timer ID
});

global.clearTimeout = vi.fn((id) => {
  // Mock clearTimeout - do nothing
});

// Mock Date.now for consistent testing
const mockDate = new Date('2024-01-15T10:00:00Z');
vi.spyOn(Date, 'now').mockImplementation(() => mockDate.getTime());

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
