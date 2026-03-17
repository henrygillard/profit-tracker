#!/usr/bin/env node
/**
 * scripts/seed-demo.js
 *
 * Seeds henry-test-2.myshopify.com with 90 days of realistic fashion/apparel
 * demo data — what a merchant would expect to see before buying the app.
 *
 * Store profile:
 *   - Plan:      Grow (~$90–$110k/month revenue)
 *   - Products:  11 fashion products, ~35 variants
 *   - Orders:    ~2,400 over 90 days (Dec 15 2025 – Mar 14 2026)
 *   - AOV:       ~$115 (mix of single + multi-item)
 *   - Coverage:  9 products with known COGS, 2 without (shows partial-coverage UI)
 *
 * Usage: node scripts/seed-demo.js
 */

require('dotenv').config();
const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

// ─── Config ──────────────────────────────────────────────────────────────────

const SHOP = process.argv[2] || 'henry-test-2.myshopify.com';
// Derive a shop-specific numeric offset from the shop name to avoid ID collisions
const SHOP_NUM = parseInt(SHOP.match(/\d+/)?.[0] || '0', 10);
const PLAN = 'Grow';
const THIRD_PARTY_FEE_RATE = 0.01;    // Grow plan third-party gateway fee
const SP_RATE  = 0.025;               // Shopify Payments Grow: 2.5% + $0.30
const SP_FIXED = 0.30;

// Seed dates
const START_DATE = new Date('2025-12-15T00:00:00Z');
const END_DATE   = new Date('2026-03-14T23:59:59Z');
const TOTAL_DAYS = 90;

// ─── Product Catalog ─────────────────────────────────────────────────────────
// hasCogs: false → no ProductCost record → exercises "missing COGS" warning in UI

const PRODUCTS = [
  {
    name: 'Classic White Tee',
    hasCogs: true,
    weight: 18,   // relative order frequency
    variants: [
      { id: 'gid://shopify/ProductVariant/44000001001', sku: 'CWT-S',  price: 35.00, cost: 9.50  },
      { id: 'gid://shopify/ProductVariant/44000001002', sku: 'CWT-M',  price: 35.00, cost: 9.50  },
      { id: 'gid://shopify/ProductVariant/44000001003', sku: 'CWT-L',  price: 35.00, cost: 9.50  },
      { id: 'gid://shopify/ProductVariant/44000001004', sku: 'CWT-XL', price: 35.00, cost: 9.50  },
    ],
  },
  {
    name: 'High-Waist Denim Jeans',
    hasCogs: true,
    weight: 13,
    variants: [
      { id: 'gid://shopify/ProductVariant/44000002001', sku: 'HWJ-26', price: 95.00, cost: 28.00 },
      { id: 'gid://shopify/ProductVariant/44000002002', sku: 'HWJ-28', price: 95.00, cost: 28.00 },
      { id: 'gid://shopify/ProductVariant/44000002003', sku: 'HWJ-30', price: 95.00, cost: 28.00 },
      { id: 'gid://shopify/ProductVariant/44000002004', sku: 'HWJ-32', price: 95.00, cost: 28.00 },
    ],
  },
  {
    name: 'Linen Blazer',
    hasCogs: true,
    weight: 7,
    variants: [
      { id: 'gid://shopify/ProductVariant/44000003001', sku: 'LBL-S', price: 165.00, cost: 52.00 },
      { id: 'gid://shopify/ProductVariant/44000003002', sku: 'LBL-M', price: 165.00, cost: 52.00 },
      { id: 'gid://shopify/ProductVariant/44000003003', sku: 'LBL-L', price: 165.00, cost: 52.00 },
    ],
  },
  {
    name: 'Silk Slip Dress',
    hasCogs: true,
    weight: 10,
    variants: [
      { id: 'gid://shopify/ProductVariant/44000004001', sku: 'SSD-XS', price: 128.00, cost: 38.00 },
      { id: 'gid://shopify/ProductVariant/44000004002', sku: 'SSD-S',  price: 128.00, cost: 38.00 },
      { id: 'gid://shopify/ProductVariant/44000004003', sku: 'SSD-M',  price: 128.00, cost: 38.00 },
      { id: 'gid://shopify/ProductVariant/44000004004', sku: 'SSD-L',  price: 128.00, cost: 38.00 },
    ],
  },
  {
    name: 'Cozy Knit Sweater',
    hasCogs: true,
    weight: 14,
    variants: [
      { id: 'gid://shopify/ProductVariant/44000005001', sku: 'CKS-S',  price: 88.00, cost: 24.00 },
      { id: 'gid://shopify/ProductVariant/44000005002', sku: 'CKS-M',  price: 88.00, cost: 24.00 },
      { id: 'gid://shopify/ProductVariant/44000005003', sku: 'CKS-L',  price: 88.00, cost: 24.00 },
      { id: 'gid://shopify/ProductVariant/44000005004', sku: 'CKS-XL', price: 88.00, cost: 24.00 },
    ],
  },
  {
    name: 'Leather Crossbody Bag',
    hasCogs: true,
    weight: 9,
    variants: [
      { id: 'gid://shopify/ProductVariant/44000006001', sku: 'LCB-BK', price: 110.00, cost: 35.00 },
      { id: 'gid://shopify/ProductVariant/44000006002', sku: 'LCB-TN', price: 110.00, cost: 35.00 },
      { id: 'gid://shopify/ProductVariant/44000006003', sku: 'LCB-CR', price: 110.00, cost: 35.00 },
    ],
  },
  {
    name: 'Canvas High-Top Sneakers',
    hasCogs: true,
    weight: 11,
    variants: [
      { id: 'gid://shopify/ProductVariant/44000007001', sku: 'CHS-7',  price: 75.00, cost: 21.00 },
      { id: 'gid://shopify/ProductVariant/44000007002', sku: 'CHS-8',  price: 75.00, cost: 21.00 },
      { id: 'gid://shopify/ProductVariant/44000007003', sku: 'CHS-9',  price: 75.00, cost: 21.00 },
      { id: 'gid://shopify/ProductVariant/44000007004', sku: 'CHS-10', price: 75.00, cost: 21.00 },
      { id: 'gid://shopify/ProductVariant/44000007005', sku: 'CHS-11', price: 75.00, cost: 21.00 },
    ],
  },
  {
    name: 'Statement Gold Earrings',
    hasCogs: true,
    weight: 13,
    variants: [
      { id: 'gid://shopify/ProductVariant/44000008001', sku: 'SGE-SM', price: 42.00, cost: 7.50 },
      { id: 'gid://shopify/ProductVariant/44000008002', sku: 'SGE-LG', price: 42.00, cost: 7.50 },
    ],
  },
  {
    name: 'Ribbed Tank Top',
    hasCogs: true,
    weight: 16,
    variants: [
      { id: 'gid://shopify/ProductVariant/44000009001', sku: 'RTT-XS', price: 28.00, cost: 6.00 },
      { id: 'gid://shopify/ProductVariant/44000009002', sku: 'RTT-S',  price: 28.00, cost: 6.00 },
      { id: 'gid://shopify/ProductVariant/44000009003', sku: 'RTT-M',  price: 28.00, cost: 6.00 },
      { id: 'gid://shopify/ProductVariant/44000009004', sku: 'RTT-L',  price: 28.00, cost: 6.00 },
      { id: 'gid://shopify/ProductVariant/44000009005', sku: 'RTT-XL', price: 28.00, cost: 6.00 },
    ],
  },
  {
    // No COGS → exercises "missing COGS" warning + null netProfit in dashboard
    name: 'Minimalist Silver Watch',
    hasCogs: false,
    weight: 5,
    variants: [
      { id: 'gid://shopify/ProductVariant/44000010001', sku: 'MSW-BK', price: 195.00, cost: null },
      { id: 'gid://shopify/ProductVariant/44000010002', sku: 'MSW-SL', price: 195.00, cost: null },
    ],
  },
  {
    // No COGS → second product without cost data
    name: 'Printed Midi Skirt',
    hasCogs: false,
    weight: 4,
    variants: [
      { id: 'gid://shopify/ProductVariant/44000011001', sku: 'PMS-XS', price: 68.00, cost: null },
      { id: 'gid://shopify/ProductVariant/44000011002', sku: 'PMS-S',  price: 68.00, cost: null },
      { id: 'gid://shopify/ProductVariant/44000011003', sku: 'PMS-M',  price: 68.00, cost: null },
      { id: 'gid://shopify/ProductVariant/44000011004', sku: 'PMS-L',  price: 68.00, cost: null },
    ],
  },
];

// ─── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────
// Deterministic so the same data is produced on every run.

function makeRng(seed) {
  return function () {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(42);

function randInt(min, max)  { return Math.floor(rng() * (max - min + 1)) + min; }
function randChoice(arr)    { return arr[Math.floor(rng() * arr.length)]; }
function randWeighted(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const item of items) { r -= item.weight; if (r <= 0) return item; }
  return items[items.length - 1];
}
function round2(n) { return Math.round(n * 100) / 100; }

// ─── Build flat variant pool ──────────────────────────────────────────────────

const ALL_VARIANTS = [];
for (const product of PRODUCTS) {
  for (const v of product.variants) {
    ALL_VARIANTS.push({ ...v, productName: product.name, hasCogs: product.hasCogs, weight: product.weight });
  }
}

const GATEWAYS = [
  { gateway: 'shopify_payments', weight: 75 },
  { gateway: 'paypal',           weight: 18 },
  { gateway: 'stripe',           weight: 7  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSeeding demo data for ${SHOP}...\n`);

  // ── 1. Wipe existing shop data ──────────────────────────────────────────────
  console.log('  Clearing existing data...');
  await prisma.orderProfit.deleteMany({ where: { shop: SHOP } });
  await prisma.lineItem.deleteMany({ where: { order: { shop: SHOP } } });
  await prisma.order.deleteMany({ where: { shop: SHOP } });
  await prisma.productCost.deleteMany({ where: { shop: SHOP } });
  await prisma.shopConfig.deleteMany({ where: { shop: SHOP } });
  await prisma.shopSession.deleteMany({ where: { shop: SHOP } });

  // ── 2. Shop session (billing active) ───────────────────────────────────────
  console.log('  Creating shop session...');
  await prisma.shopSession.create({
    data: {
      id: `offline_${SHOP}`,
      shop: SHOP,
      accessToken: 'demo-access-token',
      scope: 'read_orders,read_products',
      isOnline: false,
      billingStatus: 'ACTIVE',
      subscriptionId: 'gid://shopify/AppSubscription/9900000001',
    },
  });

  // ── 3. Shop config ──────────────────────────────────────────────────────────
  console.log('  Creating shop config...');
  await prisma.shopConfig.create({
    data: {
      shop: SHOP,
      shopifyPlan: PLAN,
      thirdPartyFeeRate: new Prisma.Decimal(THIRD_PARTY_FEE_RATE),
      lastOrderSyncedAt: END_DATE,
    },
  });

  // ── 4. Product costs ────────────────────────────────────────────────────────
  // Use a date well before all orders so every order finds a valid COGS record.
  console.log('  Creating product costs...');
  const costDate = new Date('2025-09-01T00:00:00Z');
  const costRows = [];
  for (const product of PRODUCTS) {
    if (!product.hasCogs) continue;
    for (const v of product.variants) {
      costRows.push({
        shop: SHOP,
        variantId: v.id,
        sku: v.sku,
        costAmount: new Prisma.Decimal(v.cost),
        effectiveFrom: costDate,
        source: 'manual',
      });
    }
  }
  await prisma.productCost.createMany({ data: costRows });

  // ── 5. Generate orders ──────────────────────────────────────────────────────
  // Build all data in memory, then bulk-insert per table for performance.
  console.log('  Generating order data...\n');

  const orderRows      = [];
  const lineItemRows   = [];
  const orderProfitRows = [];

  let orderSeq    = 100000 + SHOP_NUM * 1000000;   // numeric suffix for order GIDs
  let lineItemSeq = 5000000 + SHOP_NUM * 10000000; // numeric suffix for line item GIDs
  let orderNum    = 1001;     // display order name (#1001, #1002, ...)

  for (let day = 0; day < TOTAL_DAYS; day++) {
    const date = new Date(START_DATE);
    date.setUTCDate(date.getUTCDate() + day);

    const month      = date.getUTCMonth() + 1;
    const dayOfMonth = date.getUTCDate();
    const dayOfWeek  = date.getUTCDay();   // 0=Sun

    // Trend: grow from ~24/day to ~30/day over 90 days
    const trendFactor    = 1 + (day / TOTAL_DAYS) * 0.25;
    const isWeekend      = dayOfWeek === 0 || dayOfWeek === 6;
    const isValentineWk  = month === 2 && dayOfMonth >= 8  && dayOfMonth <= 14;
    const isBlackFridayWk = false; // outside range

    let base = 24 * trendFactor;
    if (isWeekend)      base *= 1.30;
    if (isValentineWk)  base *= 1.85;

    const numOrders = Math.max(1, Math.round(base + (rng() - 0.5) * 6));

    for (let o = 0; o < numOrders; o++) {
      orderSeq++;
      const orderId    = `gid://shopify/Order/5500${String(orderSeq).padStart(6, '0')}`;
      const orderName  = `#${orderNum++}`;
      const gateway    = randWeighted(GATEWAYS).gateway;

      // Random time during business-ish hours
      const orderDate  = new Date(date);
      orderDate.setUTCHours(randInt(6, 23), randInt(0, 59), randInt(0, 59));

      // Financial status: 94% PAID, 6% PARTIALLY_REFUNDED
      const statusRoll       = rng();
      const financialStatus  = statusRoll < 0.94 ? 'PAID' : 'PARTIALLY_REFUNDED';

      // Line items: 55% single, 33% two items, 12% three items
      const numItems = rng() < 0.55 ? 1 : rng() < 0.75 ? 2 : 3;
      const usedVariants = new Set();
      const chosenVariants = [];

      for (let li = 0; li < numItems; li++) {
        let variant;
        let tries = 0;
        do {
          variant = randWeighted(ALL_VARIANTS);
          tries++;
        } while (usedVariants.has(variant.id) && tries < 30);
        usedVariants.add(variant.id);
        chosenVariants.push(variant);
      }

      // Build line items
      const items = chosenVariants.map(v => ({
        variantId:   v.id,
        sku:         v.sku,
        productName: v.productName,
        quantity:    rng() < 0.88 ? 1 : 2,
        unitPrice:   v.price,
        cost:        v.cost,
        hasCogs:     v.hasCogs,
      }));

      const itemsSubtotal = items.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
      const shippingCost  = itemsSubtotal >= 100 ? 0 : 8.99;
      const totalPrice    = round2(itemsSubtotal + shippingCost);

      // Refund: partially refund one item (first item, one unit)
      let totalRefunded   = 0;
      if (financialStatus === 'PARTIALLY_REFUNDED') {
        const refundItem  = items[0];
        totalRefunded     = round2(refundItem.unitPrice); // refund 1 unit
      }

      // revenueNet = what the merchant keeps (as profitEngine calculates it)
      const revenueNet = round2(totalPrice - totalRefunded);

      // Fees
      let feesTotal;
      if (gateway === 'shopify_payments') {
        feesTotal = revenueNet > 0 ? round2(SP_RATE * revenueNet + SP_FIXED) : 0;
      } else {
        feesTotal = round2(THIRD_PARTY_FEE_RATE * revenueNet);
      }

      // COGS — null when any item in the order lacks cost data
      const cogsKnown = items.every(li => li.hasCogs);
      let cogsTotal   = null;
      if (cogsKnown) {
        let rawCogs = items.reduce((s, li) => s + li.quantity * li.cost, 0);
        // Proportional adjustment for refunds (matches profitEngine logic)
        if (totalRefunded > 0 && itemsSubtotal > 0) {
          rawCogs = rawCogs * (revenueNet / itemsSubtotal);
        }
        cogsTotal = round2(rawCogs);
      }

      const netProfit = cogsKnown
        ? round2(revenueNet - cogsTotal - feesTotal - shippingCost)
        : null;

      // ── Accumulate rows ──
      orderRows.push({
        id:               orderId,
        shop:             SHOP,
        shopifyOrderName: orderName,
        processedAt:      orderDate,
        financialStatus,
        totalPrice:       new Prisma.Decimal(totalPrice),
        currentTotalPrice: new Prisma.Decimal(totalPrice),   // original gross total
        totalRefunded:    new Prisma.Decimal(totalRefunded),
        shippingCost:     new Prisma.Decimal(shippingCost),
        paymentGateway:   gateway,
      });

      for (const li of items) {
        lineItemSeq++;
        lineItemRows.push({
          id:          `gid://shopify/LineItem/${lineItemSeq}`,
          orderId:     orderId,
          variantId:   li.variantId,
          sku:         li.sku,
          productName: li.productName || null,
          quantity:    li.quantity,
          unitPrice:   new Prisma.Decimal(li.unitPrice),
        });
      }

      orderProfitRows.push({
        orderId:     orderId,
        shop:        SHOP,
        revenueNet:  new Prisma.Decimal(revenueNet),
        cogsTotal:   cogsTotal !== null ? new Prisma.Decimal(cogsTotal) : null,
        feesTotal:   new Prisma.Decimal(feesTotal),
        shippingCost: new Prisma.Decimal(shippingCost),
        netProfit:   netProfit !== null ? new Prisma.Decimal(netProfit) : null,
        cogsKnown,
        calculatedAt: orderDate,
      });
    }
  }

  // ── 6. Bulk insert ──────────────────────────────────────────────────────────
  const CHUNK = 500;

  console.log(`  Inserting ${orderRows.length} orders...`);
  for (let i = 0; i < orderRows.length; i += CHUNK) {
    await prisma.order.createMany({ data: orderRows.slice(i, i + CHUNK) });
    process.stdout.write(`\r    ${Math.min(i + CHUNK, orderRows.length)} / ${orderRows.length}`);
  }
  console.log();

  console.log(`  Inserting ${lineItemRows.length} line items...`);
  for (let i = 0; i < lineItemRows.length; i += CHUNK) {
    await prisma.lineItem.createMany({ data: lineItemRows.slice(i, i + CHUNK) });
    process.stdout.write(`\r    ${Math.min(i + CHUNK, lineItemRows.length)} / ${lineItemRows.length}`);
  }
  console.log();

  console.log(`  Inserting ${orderProfitRows.length} profit records...`);
  for (let i = 0; i < orderProfitRows.length; i += CHUNK) {
    await prisma.orderProfit.createMany({ data: orderProfitRows.slice(i, i + CHUNK) });
    process.stdout.write(`\r    ${Math.min(i + CHUNK, orderProfitRows.length)} / ${orderProfitRows.length}`);
  }
  console.log();

  // ── 7. Summary ──────────────────────────────────────────────────────────────
  const totalRevenue = orderProfitRows.reduce((s, r) => s + parseFloat(r.revenueNet), 0);
  const totalProfit  = orderProfitRows
    .filter(r => r.netProfit !== null)
    .reduce((s, r) => s + parseFloat(r.netProfit), 0);
  const cogsKnownCount   = orderProfitRows.filter(r => r.cogsKnown).length;
  const cogsUnknownCount = orderProfitRows.filter(r => !r.cogsKnown).length;

  const avgOrderValue   = totalRevenue / orderRows.length;
  const netMarginPct    = (totalProfit / totalRevenue * 100).toFixed(1);
  const monthlyRevenue  = totalRevenue / 3;

  console.log(`
─────────────────────────────────────────────
  Seed complete for ${SHOP}
─────────────────────────────────────────────
  Orders:          ${orderRows.length.toLocaleString()}
  Line items:      ${lineItemRows.length.toLocaleString()}
  Total revenue:   $${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
  Monthly revenue: ~$${monthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / month
  Avg order value: $${avgOrderValue.toFixed(2)}
  Net profit:      $${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (${netMarginPct}% margin)
  COGS known:      ${cogsKnownCount.toLocaleString()} orders
  COGS unknown:    ${cogsUnknownCount.toLocaleString()} orders (${PRODUCTS.filter(p => !p.hasCogs).map(p => p.name).join(', ')})
─────────────────────────────────────────────
`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
