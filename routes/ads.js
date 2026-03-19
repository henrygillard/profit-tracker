// routes/ads.js
// JWT-protected ad spend API routes. Mounted under /api/ads in server.js.
// Requires req.shopDomain set by verifySessionToken middleware.

'use strict';

const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma');

/**
 * GET /api/ads/spend?from=&to=
 *
 * Returns blended ad spend summary for the date range (all platforms combined):
 *   { total: number, revenueNet: number, roas: number|null }
 *
 * - total: sum of AdSpend rows for shop + date range across all platforms (Blended ROAS)
 * - revenueNet: sum of orderProfit.revenueNet (for ADS-07 Blended ROAS)
 * - roas: revenueNet / total, or null when total = 0 (no division by zero)
 * - Returns { total: 0, revenueNet: 0, roas: null } when no rows
 */
router.get('/spend', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
  const shop = req.shopDomain;

  try {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    // Sum spend by platform for the date range
    const rows = await prisma.adSpend.groupBy({
      by: ['platform'],
      where: {
        shop,
        date: { gte: fromDate, lte: toDate },
      },
      _sum: { spend: true },
    });

    // Blended total: sum ALL platforms (meta + google + any future)
    const total = rows.reduce((s, r) => s + Number(r._sum.spend || 0), 0);

    // Also return revenueNet so AdsView can compute Blended ROAS without a separate fetch (ADS-07)
    const revenueAgg = await prisma.orderProfit.aggregate({
      where: { shop, order: { processedAt: { gte: fromDate, lte: toDate } } },
      _sum: { revenueNet: true },
    });
    const revenueNet = Number(revenueAgg._sum.revenueNet || 0);

    // Blended ROAS: revenueNet / total (null when no spend to avoid division by zero)
    const roas = total > 0 ? revenueNet / total : null;

    return res.json({ total, revenueNet, roas });
  } catch (err) {
    console.error('GET /api/ads/spend error:', err);
    return res.status(500).json({ error: 'Failed to fetch ad spend' });
  }
});

/**
 * GET /api/ads/campaigns?from=&to=
 *
 * Returns per-campaign spend breakdown for the date range, sorted by spend DESC:
 *   [{ campaignId, campaignName, spend, platform }]
 *
 * Uses groupBy to aggregate spend across days per campaign.
 */
router.get('/campaigns', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });
  const shop = req.shopDomain;

  try {
    const rows = await prisma.adSpend.groupBy({
      by: ['campaignId', 'campaignName', 'platform'],
      where: {
        shop,
        date: { gte: new Date(from), lte: new Date(to) },
      },
      _sum: { spend: true },
      orderBy: { _sum: { spend: 'desc' } },
    });

    const campaigns = rows.map(r => ({
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      platform: r.platform,
      spend: Number(r._sum.spend || 0),
    }));

    return res.json(campaigns);
  } catch (err) {
    console.error('GET /api/ads/campaigns error:', err);
    return res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

/**
 * DELETE /api/ads/disconnect?platform=meta|google — Remove Ad connection for the authenticated shop
 *
 * Query params:
 *   platform: 'meta' | 'google' (required)
 *
 * Returns: 200 { ok: true }
 */
router.delete('/disconnect', async (req, res) => {
  const { platform } = req.query;
  if (!platform || !['meta', 'google'].includes(platform)) {
    return res.status(400).json({ error: 'platform query param required: meta or google' });
  }

  try {
    await prisma.adConnection.deleteMany({
      where: { shop: req.shopDomain, platform },
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/ads/disconnect error:', err);
    return res.status(500).json({ error: 'Failed to disconnect' });
  }
});

module.exports = router;
