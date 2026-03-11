// lib/verifySessionToken.js
// Verifies Shopify App Bridge session tokens (HS256 JWT).
// Source: https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens
const jwt = require('jsonwebtoken');

function verifySessionToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing session token' });
  }

  const token = authHeader.slice(7);
  let payload;
  try {
    // MUST specify algorithms to prevent algorithm confusion attacks.
    // jsonwebtoken checks exp and nbf automatically when present.
    payload = jwt.verify(token, process.env.SHOPIFY_API_SECRET, {
      algorithms: ['HS256'],
    });
  } catch (err) {
    // Covers: TokenExpiredError, JsonWebTokenError, NotBeforeError
    return res.status(401).json({ error: 'Invalid session token' });
  }

  // Shopify-specific: aud must equal our app's client ID (SHOPIFY_API_KEY)
  if (payload.aud !== process.env.SHOPIFY_API_KEY) {
    return res.status(401).json({ error: 'Token audience mismatch' });
  }

  // Shopify-specific: iss and dest must share the same hostname
  try {
    const issDomain = new URL(payload.iss).hostname;
    const destDomain = new URL(payload.dest).hostname;
    if (issDomain !== destDomain) {
      return res.status(401).json({ error: 'Token domain mismatch' });
    }
    // Shop identity from dest — never trust req.query.shop (attacker-controlled)
    req.shopDomain = destDomain; // e.g. "mystore.myshopify.com"
  } catch (_) {
    return res.status(401).json({ error: 'Invalid token claims' });
  }

  next();
}

// Export as both the function itself (for test compatibility) and named export (for server.js)
module.exports = verifySessionToken;
module.exports.verifySessionToken = verifySessionToken;
