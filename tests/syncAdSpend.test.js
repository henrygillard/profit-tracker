// tests/syncAdSpend.test.js
// TDD RED phase — failing stubs for lib/syncAdSpend.js (Plan 08-03).
// Tests will pass GREEN once lib/syncAdSpend.js is implemented.
//
// Covers: ADS-02 backend sync (fetch Meta Insights, upsert AdSpend rows),
//         pagination loop, parseFloat(spend), error-190 no-throw behavior.

// Set required env vars before any module loads
process.env.ADS_ENCRYPTION_KEY = process.env.ADS_ENCRYPTION_KEY ||
  require('crypto').randomBytes(32).toString('base64');

// Mock encrypt/decrypt to return predictable values
// (lib/prisma is automatically mapped to __mocks__/prisma via jest.config.js moduleNameMapper)
jest.mock('../lib/encrypt', () => ({
  encrypt: jest.fn(t => `enc:${t}`),
  decrypt: jest.fn(enc => enc.replace(/^enc:/, '')),
}));

// Mock global fetch so we don't make real HTTP calls
global.fetch = jest.fn();

const { prisma } = require('../lib/prisma');

// Attempt to load syncAdSpend — fails RED until lib/syncAdSpend.js is implemented
let syncAdSpend = null;
try {
  ({ syncAdSpend } = require('../lib/syncAdSpend'));
} catch (e) {
  // File not yet implemented
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch.mockReset();
});

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

describe('syncAdSpend module', () => {
  test('exports syncAdSpend function', () => {
    if (!syncAdSpend) {
      expect(false).toBe(true); // RED until lib/syncAdSpend.js exists
      return;
    }
    expect(typeof syncAdSpend).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Happy path: fetches campaigns and upserts AdSpend rows
// ---------------------------------------------------------------------------

describe('syncAdSpend: happy path', () => {
  test('fetches Meta campaign insights and upserts AdSpend rows with parseFloat(spend)', async () => {
    if (!syncAdSpend) {
      expect(false).toBe(true);
      return;
    }

    const encryptedToken = 'enc:fake-token';
    prisma.adConnection.findFirst.mockResolvedValueOnce({
      shop: 'test-shop.myshopify.com',
      platform: 'meta',
      accountId: '1234567890',
      encryptedToken,
    });

    // Mock Meta Insights API response (single page, no pagination)
    global.fetch.mockResolvedValueOnce({
      json: async () => ({
        data: [
          { campaign_id: 'cmp_1', campaign_name: 'Summer Sale', spend: '150.75', date_start: '2024-01-01' },
          { campaign_id: 'cmp_2', campaign_name: 'Retargeting', spend: '89.25', date_start: '2024-01-01' },
        ],
        paging: { next: null },
      }),
    });

    prisma.adSpend.upsert.mockResolvedValue({});

    await syncAdSpend('test-shop.myshopify.com', 'meta');

    expect(prisma.adConnection.findFirst).toHaveBeenCalledWith({
      where: { shop: 'test-shop.myshopify.com', platform: 'meta' },
    });

    // Should upsert one row per campaign
    expect(prisma.adSpend.upsert).toHaveBeenCalledTimes(2);

    // Verify spend is stored as a number (parseFloat), not a string
    const firstCall = prisma.adSpend.upsert.mock.calls[0][0];
    expect(typeof firstCall.create.spend).toBe('number');
    expect(firstCall.create.spend).toBeCloseTo(150.75);
    expect(firstCall.create.campaignId).toBe('cmp_1');
  });
});

// ---------------------------------------------------------------------------
// Pagination: follows paging.next until null
// ---------------------------------------------------------------------------

describe('syncAdSpend: pagination', () => {
  test('follows paging.next links until exhausted', async () => {
    if (!syncAdSpend) {
      expect(false).toBe(true);
      return;
    }

    prisma.adConnection.findFirst.mockResolvedValueOnce({
      shop: 'test-shop.myshopify.com',
      platform: 'meta',
      accountId: '1234567890',
      encryptedToken: 'enc:fake-token',
    });

    // Page 1 returns next URL, page 2 has no next
    global.fetch
      .mockResolvedValueOnce({
        json: async () => ({
          data: [{ campaign_id: 'cmp_1', campaign_name: 'Campaign A', spend: '50.00', date_start: '2024-01-01' }],
          paging: { next: 'https://graph.facebook.com/v21.0/page2' },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          data: [{ campaign_id: 'cmp_2', campaign_name: 'Campaign B', spend: '75.00', date_start: '2024-01-01' }],
          paging: { next: null },
        }),
      });

    prisma.adSpend.upsert.mockResolvedValue({});

    await syncAdSpend('test-shop.myshopify.com', 'meta');

    // fetch called twice (two pages)
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // Both campaigns upserted
    expect(prisma.adSpend.upsert).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Error code 190: logs error but does NOT throw
// ---------------------------------------------------------------------------

describe('syncAdSpend: error code 190 handling', () => {
  test('does not throw on Meta error code 190 (expired token)', async () => {
    if (!syncAdSpend) {
      expect(false).toBe(true);
      return;
    }

    prisma.adConnection.findFirst.mockResolvedValueOnce({
      shop: 'test-shop.myshopify.com',
      platform: 'meta',
      accountId: '1234567890',
      encryptedToken: 'enc:fake-token',
    });

    global.fetch.mockResolvedValueOnce({
      json: async () => ({
        error: { code: 190, message: 'Invalid OAuth access token' },
      }),
    });

    // Should NOT throw — scheduler can continue for other shops
    await expect(syncAdSpend('test-shop.myshopify.com', 'meta')).resolves.not.toThrow();

    // No upserts should happen when token is expired
    expect(prisma.adSpend.upsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Other Meta API errors: throws so scheduler can catch and log
// ---------------------------------------------------------------------------

describe('syncAdSpend: other API errors', () => {
  test('throws on non-190 Meta API errors', async () => {
    if (!syncAdSpend) {
      expect(false).toBe(true);
      return;
    }

    prisma.adConnection.findFirst.mockResolvedValueOnce({
      shop: 'test-shop.myshopify.com',
      platform: 'meta',
      accountId: '1234567890',
      encryptedToken: 'enc:fake-token',
    });

    global.fetch.mockResolvedValueOnce({
      json: async () => ({
        error: { code: 4, message: 'Application request limit reached' },
      }),
    });

    await expect(syncAdSpend('test-shop.myshopify.com', 'meta')).rejects.toThrow('Meta API error');
  });
});

// ---------------------------------------------------------------------------
// No-op when AdConnection not found
// ---------------------------------------------------------------------------

describe('syncAdSpend: no connection', () => {
  test('returns without error when no AdConnection exists for shop+platform', async () => {
    if (!syncAdSpend) {
      expect(false).toBe(true);
      return;
    }

    prisma.adConnection.findFirst.mockResolvedValueOnce(null);

    await expect(syncAdSpend('test-shop.myshopify.com', 'meta')).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Unsupported platform
// ---------------------------------------------------------------------------

describe('syncAdSpend: unsupported platform', () => {
  test('throws for unsupported platform (e.g. google)', async () => {
    if (!syncAdSpend) {
      expect(false).toBe(true);
      return;
    }

    await expect(syncAdSpend('test-shop.myshopify.com', 'google')).rejects.toThrow('unsupported platform');
  });
});
