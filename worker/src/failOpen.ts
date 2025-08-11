/**
 * Fail-open mechanism for the worker
 * Ensures the system degrades gracefully instead of failing completely
 */

interface FailOpenResponse {
  advice: string;
  degraded: boolean;
  reason: string;
  correlation_id: string;
  ts: string;
}

/**
 * Handles fail-open scenarios with timeout and error handling
 * @param fetchPromise - The fetch promise to execute
 * @param timeoutMs - Timeout in milliseconds (default: 500ms)
 * @param env - Environment variables
 * @returns Response from fetch or degraded response on timeout/error
 */
export async function handleFailOpen(
  fetchPromise: () => Promise<Response>,
  timeoutMs: number = 500,
  env: Env
): Promise<Response> {
  const correlationId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    // Create a timeout promise
    const timeoutPromise = new Promise<Response>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    // Race between the fetch and timeout
    const response = await Promise.race([
      fetchPromise(),
      timeoutPromise
    ]);

    // If we get here, the fetch succeeded within the timeout
    const processingTime = Date.now() - startTime;
    
    // Log successful request
    console.log(`Request completed successfully`, {
      correlation_id: correlationId,
      processing_time_ms: processingTime,
      status: response.status
    });

    return response;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    // Log the error
    console.error(`Request failed or timed out`, {
      correlation_id: correlationId,
      error: error instanceof Error ? error.message : String(error),
      processing_time_ms: processingTime,
      timeout_ms: timeoutMs
    });

    // Return degraded response (fail-open)
    const degradedResponse: FailOpenResponse = {
      advice: 'APPROVE',
      degraded: true,
      reason: error instanceof Error && error.message.includes('timeout') 
        ? `Scoring API timeout after ${timeoutMs}ms` 
        : 'Scoring API error - fail-open',
      correlation_id: correlationId,
      ts: new Date().toISOString()
    };

    // Store degraded response in KV for monitoring
    try {
      await env.DEGRADED_REQUESTS.put(
        `degraded:${correlationId}`,
        JSON.stringify({
          ...degradedResponse,
          processing_time_ms: processingTime,
          timeout_ms: timeoutMs,
          error: error instanceof Error ? error.message : String(error)
        }),
        { expirationTtl: 86400 * 7 } // 7 days
      );
    } catch (kvError) {
      console.error('Failed to store degraded request in KV:', kvError);
    }

    return new Response(JSON.stringify(degradedResponse), {
      status: 200, // Always return 200 for fail-open
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Degraded': 'true',
        'X-Processing-Time': `${processingTime}ms`
      }
    });
  }
}

/**
 * Gets statistics about degraded requests
 * @param env - Environment variables
 * @returns Count of degraded requests in the last 24 hours
 */
export async function getDegradedRequestStats(env: Env): Promise<{
  total_degraded: number;
  timeout_count: number;
  error_count: number;
  avg_processing_time: number;
}> {
  try {
    // This would require listing KV keys, which has limitations
    // For now, return placeholder stats
    return {
      total_degraded: 0,
      timeout_count: 0,
      error_count: 0,
      avg_processing_time: 0
    };
  } catch (error) {
    console.error('Failed to get degraded request stats:', error);
    return {
      total_degraded: 0,
      timeout_count: 0,
      error_count: 0,
      avg_processing_time: 0
    };
  }
}

/**
 * Checks if a request should be marked as degraded based on response time
 * @param processingTimeMs - Time taken to process the request
 * @param thresholdMs - Threshold above which to consider degraded (default: 300ms)
 * @returns true if request should be marked as degraded
 */
export function shouldMarkAsDegraded(processingTimeMs: number, thresholdMs: number = 300): boolean {
  return processingTimeMs > thresholdMs;
}

interface Env {
  DEGRADED_REQUESTS: KVNamespace;
}
