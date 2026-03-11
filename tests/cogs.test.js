// tests/cogs.test.js
// Test scaffolds for COGS-01 (manual entry), COGS-02 (auto-populate),
// COGS-03 (CSV import), COGS-04 (time-series lookup).

const request = require('supertest');

describe('manual COGS entry (COGS-01)', () => {
  test('POST /api/cogs with valid JWT upserts ProductCost and returns 200', async () => {
    // RED: /api/cogs endpoint not yet added to routes/api.js
    expect(false).toBe(true, 'add POST /api/cogs to routes/api.js');
  });
});

describe('auto-populate from Shopify unitCost (COGS-02)', () => {
  test('extractCOGS returns inventoryItem.unitCost.amount when present', () => {
    // RED: lib/syncOrders.js not yet created
    expect(false).toBe(true, 'implement extractCOGS in lib/syncOrders.js');
  });
});

describe('CSV import (COGS-03)', () => {
  test('POST /api/cogs/csv with valid CSV file upserts multiple ProductCost rows', async () => {
    // RED: /api/cogs/csv endpoint not yet added
    expect(false).toBe(true, 'add POST /api/cogs/csv to routes/api.js');
  });
  test('CSV row with non-numeric cost is skipped with error logged', () => {
    // RED: CSV parser not yet implemented
    expect(false).toBe(true, 'add CSV validation to /api/cogs/csv handler');
  });
});

describe('COGS time-series lookup (COGS-04)', () => {
  test('getCOGSAtTime returns cost effective at order.processedAt, not current cost', async () => {
    // RED: lib/profitEngine.js not yet created
    expect(false).toBe(true, 'implement getCOGSAtTime in lib/profitEngine.js');
  });
});
