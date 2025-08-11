/**
 * HMAC verification for Shopify webhooks
 * Uses constant-time comparison to prevent timing attacks
 * Processes raw body bytes directly without JSON decoding
 */

/**
 * Verifies Shopify HMAC signature using raw body bytes and constant-time comparison
 * @param rawBody - The raw request body as ArrayBuffer
 * @param headerB64 - The HMAC signature from X-Shopify-Hmac-Sha256 header (base64)
 * @param secret - The webhook secret from Shopify app settings
 * @returns true if HMAC matches, false otherwise
 */
export async function verifyShopifyHmacRaw(
  rawBody: ArrayBuffer,
  headerB64: string,
  secret: string
): Promise<boolean> {
  if (!headerB64 || !secret || rawBody.byteLength === 0) return false;

  try {
    // Import HMAC key
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Sign RAW bytes (do NOT decode JSON before this)
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));

    // Decode header base64 to bytes
    const hdr = base64ToBytes(headerB64);

    // Constant-time compare
    if (hdr.byteLength !== sig.byteLength) return false;
    let diff = 0;
    for (let i = 0; i < sig.byteLength; i++) diff |= sig[i] ^ hdr[i];
    return diff === 0;
  } catch (error) {
    console.error('HMAC verification error:', error);
    return false;
  }
}

/**
 * Converts base64 string to Uint8Array
 * @param b64 - Base64 encoded string
 * @returns Uint8Array of decoded bytes
 */
function base64ToBytes(b64: string): Uint8Array {
  try {
    const binStr = atob(b64);
    const out = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) out[i] = binStr.charCodeAt(i);
    return out;
  } catch (error) {
    // Return empty array for invalid base64
    return new Uint8Array(0);
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use verifyShopifyHmacRaw instead
 */
export function verifyHmac(rawBody: string, expectedHmac: string, secret: string): boolean {
  // This function should be synchronous, but we can't make crypto.subtle synchronous
  // For legacy compatibility, we'll return false and log a warning
  console.warn('verifyHmac is deprecated and will always return false. Use verifyHmacAsync instead.');
  return false;
}

/**
 * Legacy async function for backward compatibility
 * @deprecated Use verifyShopifyHmacRaw instead
 */
export async function verifyHmacAsync(rawBody: string, expectedHmac: string, secret: string): Promise<boolean> {
  if (!rawBody || !expectedHmac || !secret) return false;
  
  const encoder = new TextEncoder();
  const bodyBuffer = encoder.encode(rawBody);
  
  // For legacy support, we need to handle both hex and base64 HMAC formats
  let base64Hmac: string;
  
  if (expectedHmac.length === 64 && /^[0-9a-fA-F]+$/.test(expectedHmac)) {
    // Convert hex to base64
    const hexToBase64 = (hex: string) => {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
      }
      return btoa(String.fromCharCode(...bytes));
    };
    base64Hmac = hexToBase64(expectedHmac);
  } else {
    // Assume it's already base64
    base64Hmac = expectedHmac;
  }
  
  return verifyShopifyHmacRaw(bodyBuffer, base64Hmac, secret);
}
