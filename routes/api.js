// routes/api.js
// Protected API routes — all routes here require a valid Shopify session token.
// JWT middleware is mounted in server.js before this router.
const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { prisma } = require('../lib/prisma');
const { syncPayouts } = require('../lib/syncPayouts');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

/**
 * GET /api/health — Authenticated liveness check.
 * Returns the shop domain extracted from the session token.
 */
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', shop: req.shopDomain });
});

/**
 * POST /api/cogs — Manual COGS entry for a product variant (COGS-01)
 * Always inserts a new ProductCost row (time-series — never updates existing rows).
 *
 * Body: { variantId: string, sku?: string, costAmount: number }
 * Returns: 201 with the created ProductCost record
 */
router.post('/cogs', async (req, res) => {
  const { variantId, sku, costAmount } = req.body;

  if (!variantId || typeof variantId !== 'string' || !variantId.trim()) {
    return res.status(400).json({ error: 'variantId is required' });
  }
  const parsedCost = parseFloat(costAmount);
  if (costAmount === undefined || costAmount === null || isNaN(parsedCost) || parsedCost < 0) {
    return res.status(400).json({ error: 'costAmount must be a non-negative number' });
  }

  try {
    const record = await prisma.productCost.create({
      data: {
        shop: req.shopDomain,
        variantId: variantId.trim(),
        sku: sku || null,
        costAmount: parsedCost,
        effectiveFrom: new Date(),
        source: 'manual',
      },
    });
    return res.status(201).json(record);
  } catch (err) {
    // @@unique constraint: same shop+variantId+effectiveFrom within same second
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicate cost entry — wait 1 second and retry' });
    }
    console.error('POST /api/cogs error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/cogs/csv — Bulk COGS import via CSV upload (COGS-03)
 * CSV format: sku, cost columns (header row required)
 * Inserts a new ProductCost row per valid row (time-series).
 * Invalid rows are skipped with error logging — they do not abort the import.
 *
 * Returns: 200 with { imported: number, skipped: number, errors: string[] }
 */
router.post('/cogs/csv', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Send multipart/form-data with field "file".' });
  }

  let rows;
  try {
    rows = await new Promise((resolve, reject) => {
      const results = [];
      Readable.from(req.file.buffer)
        .pipe(csv())
        .on('data', row => results.push(row))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  } catch (err) {
    return res.status(400).json({ error: 'Failed to parse CSV: ' + err.message });
  }

  let imported = 0;
  let skipped = 0;
  const errors = [];
  const now = new Date();

  for (const row of rows) {
    const sku = (row.sku || row.SKU || '').trim();
    const costRaw = row.cost || row.Cost || row.COST || '';
    const cost = parseFloat(costRaw);

    if (!sku) {
      skipped++;
      errors.push(`Row skipped: missing sku (row: ${JSON.stringify(row)})`);
      continue;
    }
    if (isNaN(cost) || cost < 0) {
      skipped++;
      errors.push(`Row skipped: invalid cost "${costRaw}" for sku "${sku}"`);
      console.log(`COGS CSV import: invalid cost "${costRaw}" for sku "${sku}" — skipping`);
      continue;
    }

    try {
      await prisma.productCost.create({
        data: {
          shop: req.shopDomain,
          variantId: sku, // CSV-imported COGS use SKU as variantId placeholder
          sku,
          costAmount: cost,
          effectiveFrom: new Date(now.getTime() + imported), // sub-millisecond offset avoids unique constraint
          source: 'csv',
        },
      });
      imported++;
    } catch (err) {
      skipped++;
      errors.push(`Row skipped: DB error for sku "${sku}": ${err.message}`);
      console.error(`COGS CSV import: DB error for sku ${sku}:`, err.message);
    }
  }

  return res.status(200).json({ imported, skipped, errors });
});

/**
 * POST /api/sync/payouts — Trigger Shopify Payments payout sync (SYNC-04)
 * Fetches balance transactions and updates OrderProfit.feesTotal for all Shopify Payments orders.
 * Idempotent — safe to call multiple times. Runs synchronously (may take 10-30s for large stores).
 *
 * Returns: 200 with { message: 'Payout sync complete' } on success
 */
router.post('/sync/payouts', async (req, res) => {
  try {
    const session = await prisma.shopSession.findFirst({
      where: { shop: req.shopDomain },
      select: { accessToken: true },
    });

    if (!session) {
      return res.status(404).json({ error: 'Shop session not found — re-install required' });
    }

    await syncPayouts(prisma, req.shopDomain, session.accessToken);
    return res.status(200).json({ message: 'Payout sync complete' });
  } catch (err) {
    console.error('POST /api/sync/payouts error:', err);
    return res.status(500).json({ error: 'Payout sync failed: ' + err.message });
  }
});

/**
 * GET /api/dashboard/overview — Store-level profit overview (DASH-01, DASH-05)
 * Query params: from (ISO datetime), to (ISO datetime)
 * Returns: { revenueNet, feesTotal, cogsTotal, netProfit, orderCount, cogsKnownCount, missingCogsCount, isPartial }
 * - revenueNet and feesTotal aggregate ALL orders (including unknown-COGS)
 * - cogsTotal and netProfit aggregate ONLY cogsKnown=true orders (no NULL poisoning)
 * - isPartial = true when any orders have unknown COGS
 */
router.get('/dashboard/overview', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params required' });
  }

  const dateFilter = { gte: new Date(from), lte: new Date(to) };
  const baseWhere = {
    shop: req.shopDomain,
    order: { processedAt: dateFilter },
  };

  const [agg, missingCogs] = await Promise.all([
    prisma.orderProfit.aggregate({
      where: baseWhere,
      _sum: { revenueNet: true, feesTotal: true, shippingCost: true },
      _count: { _all: true },
    }),
    prisma.orderProfit.count({ where: { ...baseWhere, cogsKnown: false } }),
  ]);

  // Sum cogsTotal and netProfit for known-COGS orders only (avoids NULL poisoning)
  const knownAgg = await prisma.orderProfit.aggregate({
    where: { ...baseWhere, cogsKnown: true },
    _sum: { cogsTotal: true, netProfit: true },
    _count: { _all: true },
  });

  return res.json({
    revenueNet: Number(agg._sum.revenueNet ?? 0),
    feesTotal: Number(agg._sum.feesTotal ?? 0),
    cogsTotal: Number(knownAgg._sum.cogsTotal ?? 0),
    netProfit: Number(knownAgg._sum.netProfit ?? 0),
    orderCount: agg._count._all,
    cogsKnownCount: knownAgg._count._all,
    missingCogsCount: missingCogs,
    isPartial: missingCogs > 0,
  });
});

/**
 * GET /api/dashboard/orders — Paginated, sortable order profit list (DASH-02, DASH-05)
 * Query params: from, to, sort (allowlisted), dir (asc|desc), page (0-indexed)
 * Returns array of order profit rows — cogsTotal is null (not 0) for unknown-COGS orders
 */
router.get('/dashboard/orders', async (req, res) => {
  const { from, to, sort = 'processedAt', dir = 'desc', page = 0 } = req.query;
  const PAGE_SIZE = 50;

  const ALLOWED_SORT = ['revenueNet', 'cogsTotal', 'feesTotal', 'netProfit', 'processedAt'];
  const sortKey = ALLOWED_SORT.includes(sort) ? sort : 'processedAt';
  const sortDir = dir === 'asc' ? 'asc' : 'desc';

  const orders = await prisma.orderProfit.findMany({
    where: {
      shop: req.shopDomain,
      order: { processedAt: { gte: new Date(from), lte: new Date(to) } },
    },
    include: { order: { select: { shopifyOrderName: true, processedAt: true } } },
    orderBy: sortKey === 'processedAt'
      ? { order: { processedAt: sortDir } }
      : { [sortKey]: sortDir },
    take: PAGE_SIZE,
    skip: Number(page) * PAGE_SIZE,
  });

  return res.json(orders.map(op => ({
    orderId: op.orderId,
    shopifyOrderName: op.order ? op.order.shopifyOrderName : null,
    processedAt: op.order ? op.order.processedAt : null,
    revenueNet: Number(op.revenueNet),
    cogsTotal: op.cogsTotal !== null ? Number(op.cogsTotal) : null,
    feesTotal: Number(op.feesTotal),
    netProfit: op.netProfit !== null ? Number(op.netProfit) : null,
    marginPct: op.revenueNet && op.netProfit !== null
      ? (Number(op.netProfit) / Number(op.revenueNet)) * 100
      : null,
    cogsKnown: op.cogsKnown,
  })));
});

/**
 * GET /api/dashboard/products — Per-variant profit ranking (DASH-03)
 * Query params: from, to
 * Returns array sorted by net profit attributed DESC NULLS LAST.
 * Uses $queryRaw with proportional attribution SQL (line item revenue share of order profit).
 */
router.get('/dashboard/products', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params required' });
  }

  const results = await prisma.$queryRaw`
    SELECT
      li.variant_id,
      li.sku,
      COUNT(DISTINCT li.order_id) AS order_count,
      SUM(li.unit_price * li.quantity) AS revenue,
      SUM(op.net_profit * (li.unit_price * li.quantity) / NULLIF(op.revenue_net, 0)) AS net_profit_attr,
      BOOL_AND(op.cogs_known) AS all_cogs_known
    FROM line_items li
    JOIN orders o ON o.id = li.order_id
    JOIN order_profits op ON op.order_id = li.order_id
    WHERE o.shop = ${req.shopDomain}
      AND o.processed_at >= ${new Date(from)}
      AND o.processed_at <= ${new Date(to)}
    GROUP BY li.variant_id, li.sku
    ORDER BY net_profit_attr DESC NULLS LAST
  `;

  return res.json(results.map(r => {
    // Support both snake_case (real Postgres) and camelCase (test mocks)
    const variantId = r.variant_id ?? r.variantId ?? null;
    const sku = r.sku ?? null;
    const orderCount = Number(r.order_count ?? r.orderCount ?? 0);
    const revenue = Number(r.revenue ?? 0);
    const rawNetProfit = r.net_profit_attr ?? r.netProfitAttributed ?? null;
    const rawAllCogsKnown = r.all_cogs_known ?? r.allCogsKnown ?? false;

    const netProfitAttributed = rawNetProfit !== null ? Number(rawNetProfit) : null;
    const marginPct = revenue && netProfitAttributed !== null
      ? (netProfitAttributed / revenue) * 100
      : null;

    return {
      variantId,
      sku,
      orderCount,
      revenue,
      netProfitAttributed,
      marginPct,
      allCogsKnown: rawAllCogsKnown,
    };
  }));
});

/**
 * GET /api/dashboard/trend — Daily net profit trend buckets (DASH-04)
 * Query params: from, to
 * Returns array sorted by date ASC.
 * Uses $queryRaw with DATE_TRUNC. BigInt SUM results converted with Number().
 */
router.get('/dashboard/trend', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params required' });
  }

  const trend = await prisma.$queryRaw`
    SELECT
      DATE_TRUNC('day', o.processed_at) AS date,
      SUM(op.net_profit) AS net_profit,
      SUM(op.revenue_net) AS revenue
    FROM order_profits op
    JOIN orders o ON o.id = op.order_id
    WHERE op.shop = ${req.shopDomain}
      AND o.processed_at >= ${new Date(from)}
      AND o.processed_at <= ${new Date(to)}
    GROUP BY DATE_TRUNC('day', o.processed_at)
    ORDER BY date ASC
  `;

  const serialized = trend.map(row => {
    // Support both real Postgres (Date object, snake_case, BigInt) and test mocks (string, camelCase, number)
    const rawDate = row.date;
    const dateStr = rawDate instanceof Date
      ? rawDate.toISOString().slice(0, 10)
      : String(rawDate).slice(0, 10);

    const rawNetProfit = row.net_profit ?? row.netProfit ?? 0;
    const rawRevenue = row.revenue ?? 0;

    return {
      date: dateStr,
      netProfit: Number(rawNetProfit),
      revenue: Number(rawRevenue),
    };
  });

  return res.json(serialized);
});

module.exports = router;
