/**
 * Simple rate limiting for Shopify webhooks
 * Enforces per-shop rate limits using token bucket algorithm
 */

export interface Env { 
  IDEMPO_KV: KVNamespace; 
}

type Rec = { t: number; tokens: number }

/**
 * Checks if a shop is allowed to make a request
 * @param env - Environment variables containing KV namespaces
 * @param shop - The shop domain
 * @param burst - Maximum burst requests (default: 30)
 * @param refillPerSec - Tokens refilled per second (default: 2)
 * @param ttlSeconds - TTL for KV entries (default: 3600)
 * @returns true if allowed, false if rate limited
 */
export async function allowShop(
  env: Env,
  shop: string,
  burst = 30,
  refillPerSec = 2,
  ttlSeconds = 3600
): Promise<boolean> {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const key = `rl:${shop}`;

    // KV.get returns string | null; handle both
    const raw = await env.IDEMPO_KV.get(key); // text default
    let rec: Rec = raw ? JSON.parse(raw) as Rec : { t: nowSec, tokens: burst };

    // Refill
    const elapsed = Math.max(0, nowSec - (rec.t ?? 0));
    const tokens = Math.min(burst, (rec.tokens ?? burst) + elapsed * refillPerSec);

    // Consume if possible
    const allowed = tokens >= 1;
    const newTokens = allowed ? tokens - 1 : tokens;

    // Always persist the new state (first call needs a put!)
    const next: Rec = { t: nowSec, tokens: newTokens };
    await env.IDEMPO_KV.put(key, JSON.stringify(next), { expirationTtl: ttlSeconds });

    return allowed;
  } catch (error) {
    console.error(`Rate limit check error for shop ${shop}:`, error);
    // Fail-open: allow request if rate limiting fails
    return true;
  }
}
