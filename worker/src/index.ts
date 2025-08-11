import { verifyShopifyHmacRaw } from './hmac';
import { allowShop } from './rateLimit';
import { handleFailOpen } from './failOpen';

interface ShopifyWebhook {
  shop: string;
  topic: string;
  webhook_id: string;
  api_version: string;
  triggered_at: string;
  order_id?: string;
  placed_at?: string;
  amount?: number;
  currency?: string;
  email_hash?: string;
  device_hash?: string;
  browser_ip?: string;
  billing_country?: string;
  shipping_country?: string;
  bin?: string;
  avs?: string;
  cvv?: string;
  line_count?: number;
}

interface ScoringRequest {
  shop: string;
  topic: string;
  webhook_id: string;
  api_version: string;
  triggered_at: string;
  correlation_id: string;
  order_id?: string;
  placed_at?: string;
  amount?: number;
  currency?: string;
  email_hash?: string;
  device_hash?: string;
  browser_ip?: string;
  billing_country?: string;
  shipping_country?: string;
  bin?: string;
  avs?: string;
  cvv?: string;
  line_count?: number;
}

interface ScoringResponse {
  risk: number;
  advice: string;
  psd2: {
    tra_candidate: boolean;
    why: string[];
  };
  reasons: string[];
  degraded: boolean;
  ts: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    const correlationId = crypto.randomUUID();
    
    try {
      // Only handle POST requests
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }

      // Extract Shopify headers
      const shop = request.headers.get('X-Shopify-Shop-Domain');
      const topic = request.headers.get('X-Shopify-Topic');
      const webhookId = request.headers.get('X-Shopify-Webhook-Id');
      const hmac = request.headers.get('X-Shopify-Hmac-Sha256');
      const apiVersion = request.headers.get('X-Shopify-API-Version');

      // Validate required headers
      if (!shop || !topic || !webhookId || !hmac || !apiVersion) {
        return new Response('Missing required headers', { status: 400 });
      }

      // Get raw body for HMAC verification (do NOT decode JSON before this)
      const rawBody = await request.arrayBuffer();
      
      // Verify HMAC using raw body bytes
      const hmacValid = await verifyShopifyHmacRaw(rawBody, hmac, env.APP_SECRET);
      if (!hmacValid) {
        return new Response('Unauthorized', { status: 401 });
      }

      // Handle app uninstall - disable ingest for this shop (after HMAC verification)
      if (topic === 'app/uninstalled') {
        // Store shop as disabled in KV with no TTL (or very long) - re-enable only on new OAuth install
        await env.UNINSTALLED_KV.put(shop, '1'/* no TTL */);
        return new Response('OK', { status: 200 });
      }

      // Check if shop is disabled (uninstalled)
      if (await env.UNINSTALLED_KV.get(shop)) {
        // Return 200-fast to Shopify for uninstalled shops
        return new Response('OK', { status: 200 });
      }

      // Check rate limit (2 rps sustained / 30 burst per shop)
      if (!(await allowShop(env, shop, 30, 2))) {
        return new Response('Rate limited', { status: 429 });
      }

      // Check idempotency with 72h TTL
      const idempotencyKey = `${shop}::${topic}::${webhookId}`;
      const existingResponse = await env.IDEMPO_KV.get(idempotencyKey);
      if (existingResponse) {
        // Return cached response for replay
        return new Response('OK', { 
          status: 200,
          headers: { 'X-Idempotency-Replay': 'true' }
        });
      }

      // Store idempotency key with 72h TTL
      await env.IDEMPO_KV.put(idempotencyKey, '1', { expirationTtl: 72 * 3600 });

      // Now safe to decode JSON after HMAC verification
      let webhookData: ShopifyWebhook;
      try {
        webhookData = JSON.parse(new TextDecoder().decode(new Uint8Array(rawBody)));
      } catch {
        return new Response('Invalid JSON', { status: 400 });
      }

      // Prepare scoring request
      const scoringRequest: ScoringRequest = {
        shop,
        topic,
        webhook_id: webhookId,
        api_version: apiVersion,
        triggered_at: new Date().toISOString(),
        correlation_id: correlationId,
        ...webhookData
      };

      // Use handleFailOpen for sophisticated fail-open mechanism
      const scoringResponse = await handleFailOpen(
        async () => {
          const forwardInit: RequestInit = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': correlationId,
              'X-Shopify-API-Version': apiVersion,
              'X-Shopify-Topic': topic,
              'X-Shop-Domain': shop
            },
            body: JSON.stringify(scoringRequest)
          };
          
          const response = await fetch(env.SCORING_API + '/score', forwardInit);
          
          // If successful, store response in idempotency ledger
          if (response.status === 200) {
            const responseBody = await response.text();
            await env.IDEMPOTENCY_LEDGER.put(idempotencyKey, responseBody, { expirationTtl: 72 * 3600 });
          }
          
          return response;
        },
        500, // 500ms timeout
        env
      );
      
      // Return the response (either successful or degraded)
      if (scoringResponse.status === 200) {
        const responseBody = await scoringResponse.text();
        return new Response(responseBody, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-ID': correlationId,
            'X-Processing-Time': `${Date.now() - startTime}ms`
          }
        });
      }
      
      // If we get here, it's a degraded response (fail-open)
      return scoringResponse;

    } catch (error) {
      // Fail-open: return 200 on any unexpected errors
      console.log(JSON.stringify({ 
        lvl: "error", 
        msg: "worker-error", 
        cid: correlationId, 
        degraded: true,
        error: error instanceof Error ? error.message : 'unknown'
      }));
      
      return new Response('OK', { status: 200 });
    }
  }
};

interface Env {
  APP_SECRET: string;
  SCORING_API: string;
  IDEMPO_KV: KVNamespace;      // KV for idempotency with 72h TTL
  UNINSTALLED_KV: KVNamespace; // KV of shops disabled
  IDEMPOTENCY_LEDGER: KVNamespace; // Legacy support
  SHOPIFY_WEBHOOK_SECRET: string; // Legacy support
  SCORING_API_URL: string; // Legacy support
  SCORING_API_SECRET: string; // Legacy support
  SHOP_STATUS: KVNamespace; // Legacy support
  DEGRADED_REQUESTS: KVNamespace; // KV for storing degraded request data
}
