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

module.exports = router;
