const crypto = require('crypto');

/**
 * Validate a Shopify shop domain against strict regex.
 * Accepts "store.myshopify.com" only — rejects bare slugs and arbitrary domains.
 */
function validateShop(shop) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.myshopify\.com$/i.test(shop);
}

/**
 * Timing-safe HMAC comparison.
 * @param {string} generated - hex or base64 digest you computed
 * @param {string} provided  - hex or base64 digest from the request
 */
function timingSafeEqual(generated, provided) {
  if (!generated || !provided) return false;
  const a = Buffer.from(generated);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { validateShop, timingSafeEqual };
