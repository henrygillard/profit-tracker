#!/usr/bin/env node
/**
 * scripts/seed-shopify.js
 *
 * Creates real products and orders in a Shopify dev store via the Admin API,
 * then syncs them into the profit-tracker database.
 *
 * Prerequisites:
 *   1. Create a custom app in the Shopify Partners dashboard for your dev store
 *   2. Add scopes: write_products, write_orders, read_orders, read_products,
 *      read_inventory, read_shopify_payments_payouts
 *   3. Install the app on the dev store and copy the access token
 *
 * Usage:
 *   node scripts/seed-shopify.js <shop> <access-token>
 *
 * Example:
 *   node scripts/seed-shopify.js henry-test-1.myshopify.com shpat_xxxx
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { shopifyGraphQL } = require('../lib/shopifyClient');
const { syncIncrementalOrders } = require('../lib/syncOrders');

const prisma = new PrismaClient();

const API_VERSION = '2025-10';

// ─── Product catalog to create ───────────────────────────────────────────────

const PRODUCTS = [
  {
    title: 'Classic White Tee',
    variants: [
      { sku: 'CWT-S',  price: '35.00', option1: 'S'  },
      { sku: 'CWT-M',  price: '35.00', option1: 'M'  },
      { sku: 'CWT-L',  price: '35.00', option1: 'L'  },
      { sku: 'CWT-XL', price: '35.00', option1: 'XL' },
    ],
  },
  {
    title: 'High-Waist Denim Jeans',
    variants: [
      { sku: 'HWJ-26', price: '95.00', option1: '26' },
      { sku: 'HWJ-28', price: '95.00', option1: '28' },
      { sku: 'HWJ-30', price: '95.00', option1: '30' },
    ],
  },
  {
    title: 'Linen Blazer',
    variants: [
      { sku: 'LBL-S', price: '165.00', option1: 'S' },
      { sku: 'LBL-M', price: '165.00', option1: 'M' },
      { sku: 'LBL-L', price: '165.00', option1: 'L' },
    ],
  },
  {
    title: 'Silk Slip Dress',
    variants: [
      { sku: 'SSD-XS', price: '128.00', option1: 'XS' },
      { sku: 'SSD-S',  price: '128.00', option1: 'S'  },
      { sku: 'SSD-M',  price: '128.00', option1: 'M'  },
    ],
  },
  {
    title: 'Cozy Knit Sweater',
    variants: [
      { sku: 'CKS-S',  price: '88.00', option1: 'S'  },
      { sku: 'CKS-M',  price: '88.00', option1: 'M'  },
      { sku: 'CKS-L',  price: '88.00', option1: 'L'  },
      { sku: 'CKS-XL', price: '88.00', option1: 'XL' },
    ],
  },
  {
    title: 'Canvas High-Top Sneakers',
    variants: [
      { sku: 'CHS-7',  price: '75.00', option1: '7'  },
      { sku: 'CHS-8',  price: '75.00', option1: '8'  },
      { sku: 'CHS-9',  price: '75.00', option1: '9'  },
      { sku: 'CHS-10', price: '75.00', option1: '10' },
    ],
  },
  {
    title: 'Statement Gold Earrings',
    variants: [
      { sku: 'SGE-SM', price: '42.00', option1: 'Small' },
      { sku: 'SGE-LG', price: '42.00', option1: 'Large' },
    ],
  },
  {
    title: 'Ribbed Tank Top',
    variants: [
      { sku: 'RTT-XS', price: '28.00', option1: 'XS' },
      { sku: 'RTT-S',  price: '28.00', option1: 'S'  },
      { sku: 'RTT-M',  price: '28.00', option1: 'M'  },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// REST API helper (for order creation — simpler payload than GraphQL orderCreate)
async function shopifyREST(shop, accessToken, method, path, body) {
  const url = `https://${shop}/admin/api/${API_VERSION}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify REST ${res.status} ${method} ${path}: ${text}`);
  }

  return res.json();
}

// ─── Step 1: Create products ──────────────────────────────────────────────────

const PRODUCT_SET = `
  mutation productSet($input: ProductSetInput!, $synchronous: Boolean!) {
    productSet(input: $input, synchronous: $synchronous) {
      product {
        id
        title
        variants(first: 20) {
          nodes { id sku }
        }
      }
      userErrors { field message }
    }
  }
`;

async function createProducts(shop, accessToken) {
  console.log('\nCreating products...');
  const created = [];

  for (const p of PRODUCTS) {
    const data = await shopifyGraphQL(shop, accessToken, PRODUCT_SET, {
      synchronous: true,
      input: {
        title: p.title,
        productOptions: [
          {
            name: 'Size',
            values: p.variants.map(v => ({ name: v.option1 })),
          },
        ],
        variants: p.variants.map(v => ({
          sku: v.sku,
          price: v.price,
          optionValues: [{ optionName: 'Size', name: v.option1 }],
        })),
      },
    });

    if (data.productSet.userErrors.length > 0) {
      throw new Error(`productSet failed for "${p.title}": ${JSON.stringify(data.productSet.userErrors)}`);
    }

    const product = data.productSet.product;
    const variantsBySku = {};
    for (const v of product.variants.nodes) {
      variantsBySku[v.sku] = v.id;
    }

    created.push({
      productId: product.id,
      title: product.title,
      variants: p.variants.map(v => ({
        variantId: variantsBySku[v.sku],
        sku: v.sku,
        price: parseFloat(v.price),
      })),
    });

    console.log(`  ✓ ${product.title} (${product.variants.nodes.length} variants)`);
  }

  return created;
}

// ─── Step 2: Create orders ────────────────────────────────────────────────────

async function createOrders(shop, accessToken, products, count = 30) {
  console.log(`\nCreating ${count} orders...`);

  // Flat list of all variants for random selection
  const allVariants = products.flatMap(p =>
    p.variants.map(v => ({ ...v, productTitle: p.title }))
  );

  const gateways = [
    { name: 'shopify_payments', weight: 70 },
    { name: 'paypal',           weight: 20 },
    { name: 'stripe',           weight: 10 },
  ];

  function pickGateway() {
    const r = Math.random() * 100;
    let acc = 0;
    for (const g of gateways) {
      acc += g.weight;
      if (r < acc) return g.name;
    }
    return 'shopify_payments';
  }

  let created = 0;

  for (let i = 0; i < count; i++) {
    // Pick 1–3 random variants (no duplicates)
    const numItems = Math.random() < 0.55 ? 1 : Math.random() < 0.75 ? 2 : 3;
    const picked = [];
    const usedIds = new Set();
    for (let j = 0; j < numItems; j++) {
      let v;
      let tries = 0;
      do { v = randChoice(allVariants); tries++; } while (usedIds.has(v.variantId) && tries < 20);
      usedIds.add(v.variantId);
      picked.push(v);
    }

    const lineItems = picked.map(v => ({
      variant_id: v.variantId.split('/').pop(), // REST API needs numeric ID
      quantity: Math.random() < 0.85 ? 1 : 2,
      price: v.price.toFixed(2),
      title: v.productTitle,
      sku: v.sku,
    }));

    const gateway = pickGateway();

    // Spread orders over the past 60 days
    const daysAgo = randInt(0, 59);
    const processedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    processedAt.setUTCHours(randInt(8, 22), randInt(0, 59), 0, 0);

    try {
      await shopifyREST(shop, accessToken, 'POST', '/orders.json', {
        order: {
          line_items: lineItems,
          financial_status: 'paid',
          gateway,
          processed_at: processedAt.toISOString(),
          send_receipt: false,
          send_fulfillment_receipt: false,
          test: true,
          customer: { first_name: 'Test', last_name: `Customer ${i + 1}` },
        },
      });

      created++;
      process.stdout.write(`\r  ${created} / ${count}`);

      // Dev store trial plan: ~4 orders/min rate limit. Pause every 4 orders.
      if (created % 4 === 0 && created < count) {
        process.stdout.write(' (rate limit pause 65s...)');
        await new Promise(r => setTimeout(r, 65000));
      }
    } catch (err) {
      console.error(`\n  Order ${i + 1} failed: ${err.message}`);
    }
  }

  console.log(`\n  ✓ ${created} orders created`);
  return created;
}

// ─── Step 3: Upsert shop session + config ─────────────────────────────────────

async function upsertShopSession(shop, accessToken) {
  console.log('\nUpserting shop session...');

  await prisma.shopSession.upsert({
    where: { shop },
    create: {
      id: `offline_${shop}`,
      shop,
      accessToken,
      scope: 'write_products,write_orders,read_orders,read_products,read_inventory,read_shopify_payments_payouts',
      isOnline: false,
      billingStatus: 'ACTIVE',
      subscriptionId: 'gid://shopify/AppSubscription/9900000002',
    },
    update: {
      accessToken,
      scope: 'write_products,write_orders,read_orders,read_products,read_inventory,read_shopify_payments_payouts',
      billingStatus: 'ACTIVE',
    },
  });

  await prisma.shopConfig.upsert({
    where: { shop },
    create: { shop, shopifyPlan: 'Grow', thirdPartyFeeRate: 0.01 },
    update: { shopifyPlan: 'Grow', thirdPartyFeeRate: 0.01, lastOrderSyncedAt: null },
  });

  console.log('  ✓ Session and config ready');
}

// ─── Step 4: Sync orders into the DB ─────────────────────────────────────────

async function syncOrders(shop, accessToken) {
  console.log('\nSyncing orders into database...');
  await syncIncrementalOrders(prisma, shop, accessToken);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const shop = process.argv[2];
  const accessToken = process.argv[3];
  const orderCount = parseInt(process.argv[4] || '30', 10);

  if (!shop || !accessToken) {
    console.error('Usage: node scripts/seed-shopify.js <shop> <access-token> [order-count]');
    console.error('Example: node scripts/seed-shopify.js henry-test-1.myshopify.com shpat_xxxx 30');
    process.exit(1);
  }

  console.log(`\nSeeding ${shop} with real Shopify data...`);

  const products = await createProducts(shop, accessToken);
  await createOrders(shop, accessToken, products, orderCount);
  await upsertShopSession(shop, accessToken);
  await syncOrders(shop, accessToken);

  const orderCount2 = await prisma.order.count({ where: { shop } });
  console.log(`\n✓ Done — ${orderCount2} orders now in database for ${shop}`);
  console.log('  Product and order links will work in the app.\n');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
