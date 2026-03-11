// routes/api.js
// Protected API routes — all routes here require a valid Shopify session token.
// JWT middleware is mounted in server.js before this router.
const express = require('express');
const router = express.Router();

/**
 * GET /api/health — Authenticated liveness check.
 * Returns the shop domain extracted from the session token.
 */
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', shop: req.shopDomain });
});

module.exports = router;
