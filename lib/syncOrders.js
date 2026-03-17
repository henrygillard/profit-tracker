// lib/syncOrders.js
// Order sync: bulk historical sync, JSONL streaming, incremental polling, order upsert.
// Implements SYNC-01, SYNC-02 (order ingestion side), SYNC-03.
//
// CRITICAL: These functions are async and can be awaited in non-webhook contexts.
// In webhook handlers, use setImmediate(() => upsertOrder(...)) AFTER res.status(200).send('OK')
// to avoid blocking the 5-second Shopify webhook response window. That is the handler's
// responsibility, not this module's.

const https = require('https');
const readline = require('readline');

const { shopifyGraphQL } = require('./shopifyClient');
const { calculateOrderProfit, getCOGSAtTime } = require('./profitEngine');

// ---------------------------------------------------------------------------
// GraphQL query strings
// ---------------------------------------------------------------------------

const BULK_ORDERS_QUERY = `
  mutation {
    bulkOperationRunQuery(query: """
      {
        orders {
          edges { node {
            id name processedAt displayFinancialStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            currentTotalPriceSet { shopMoney { amount } }
            totalRefundedSet { shopMoney { amount } }
            shippingLines { nodes { originalPriceSet { shopMoney { amount } } } }
            paymentGatewayNames
            lineItems { edges { node {
              id quantity title
              originalUnitPriceSet { shopMoney { amount } }
              variant { id sku product { id } inventoryItem { unitCost { amount } } }
            } } }
          } }
        }
      }
    """) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

const INCREMENTAL_ORDERS_QUERY = `
  query($query: String!, $after: String) {
    orders(first: 50, query: $query, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name processedAt updatedAt displayFinancialStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        currentTotalPriceSet { shopMoney { amount } }
        totalRefundedSet { shopMoney { amount } }
        shippingLines(first: 10) { nodes { originalPriceSet { shopMoney { amount } } } }
        paymentGatewayNames
        lineItems(first: 50) { nodes {
          id quantity title
          originalUnitPriceSet { shopMoney { amount } }
          variant { id sku product { id } inventoryItem { unitCost { amount } } }
        } }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// extractCOGS — pull unit cost from a Shopify lineItem object
// ---------------------------------------------------------------------------

/**
 * extractCOGS(lineItem) — extracts unit cost from a Shopify line item.
 * Returns the cost as a float, or null if unavailable.
 *
 * @param {object} lineItem - Shopify line item node
 * @returns {number|null}
 */
function extractCOGS(lineItem) {
  return lineItem?.variant?.inventoryItem?.unitCost?.amount
    ? parseFloat(lineItem.variant.inventoryItem.unitCost.amount)
    : null;
}

// ---------------------------------------------------------------------------
// parseOrderFromShopify — normalize a raw Shopify order into our internal shape
// ---------------------------------------------------------------------------

/**
 * parseOrderFromShopify(raw) — normalizes a Shopify order object from either
 * a webhook payload or incremental query response into the shape used by upsertOrder.
 *
 * @param {object} raw - Raw Shopify order object
 * @returns {object} Normalized order with id, shopifyOrderName, processedAt, lineItems, etc.
 */
function parseOrderFromShopify(raw) {
  const shippingLineNodes = raw.shippingLines?.nodes || raw.shippingLines || [];
  const shippingCost = shippingLineNodes.reduce((sum, sl) => {
    return sum + parseFloat(sl.originalPriceSet?.shopMoney?.amount || 0);
  }, 0);

  const paymentGateway = (raw.paymentGatewayNames || [])[0] || 'unknown';

  // Support both nodes (incremental query) and edges/node (bulk JSONL) formats
  const lineItems = (
    raw.lineItems?.nodes ||
    (raw.lineItems?.edges || []).map((e) => e.node) ||
    []
  ).map((li) => ({
    id: li.id,
    variantId: li.variant?.id || null,
    productId: li.variant?.product?.id || null,
    sku: li.variant?.sku || null,
    productName: li.title || null,
    quantity: li.quantity,
    unitPrice: parseFloat(li.originalUnitPriceSet?.shopMoney?.amount || 0),
    cogs: extractCOGS(li),
  }));

  return {
    id: raw.id,
    shopifyOrderName: raw.name,
    processedAt: new Date(raw.processedAt),
    financialStatus: raw.displayFinancialStatus || 'UNKNOWN',
    totalPrice: parseFloat(raw.totalPriceSet?.shopMoney?.amount || 0),
    currentTotalPrice: parseFloat(raw.currentTotalPriceSet?.shopMoney?.amount || 0),
    totalRefunded: parseFloat(raw.totalRefundedSet?.shopMoney?.amount || 0),
    shippingCost,
    paymentGateway,
    lineItems,
  };
}

// ---------------------------------------------------------------------------
// upsertOrder — atomically write Order, LineItems, and OrderProfit
// ---------------------------------------------------------------------------

/**
 * upsertOrder(prisma, shop, parsedOrder, shopifyPaymentsFee, shopPlan)
 * Writes Order, LineItems, and OrderProfit in a single Prisma transaction.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} shop - shop domain
 * @param {object} parsedOrder - result of parseOrderFromShopify
 * @param {number} [shopifyPaymentsFee=0] - Shopify Payments transaction fee (updated by syncPayouts later)
 * @param {string} [shopPlan] - Shopify plan name from ShopConfig.shopifyPlan
 * @returns {Promise<{orderId: string}>}
 */
async function upsertOrder(prisma, shop, parsedOrder, shopifyPaymentsFee = 0, shopPlan = null) {
  const {
    id,
    shopifyOrderName,
    processedAt,
    financialStatus,
    totalPrice,
    currentTotalPrice,
    totalRefunded,
    shippingCost,
    paymentGateway,
    lineItems,
  } = parsedOrder;

  // Compute profit — calculateOrderProfit is a pure function from profitEngine.js
  const profitResult = calculateOrderProfit(
    {
      currentTotalPrice,
      totalRefunded,
      shippingCost,
      paymentGateway,
      lineItems,
    },
    {
      shopifyPaymentsFee,
      shopPlan,
    }
  );

  // Execute atomically
  await prisma.$transaction([
    prisma.order.upsert({
      where: { id },
      create: {
        id,
        shop,
        shopifyOrderName,
        processedAt,
        financialStatus,
        totalPrice,
        currentTotalPrice,
        totalRefunded,
        shippingCost,
        paymentGateway,
      },
      update: {
        shopifyOrderName,
        processedAt,
        financialStatus,
        totalPrice,
        currentTotalPrice,
        totalRefunded,
        shippingCost,
        paymentGateway,
      },
    }),
    prisma.lineItem.deleteMany({ where: { orderId: id } }),
    prisma.lineItem.createMany({
      data: lineItems.map((li) => ({
        id: li.id,
        orderId: id,
        variantId: li.variantId || null,
        productId: li.productId || null,
        sku: li.sku || null,
        productName: li.productName || null,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
      })),
      skipDuplicates: true,
    }),
    prisma.orderProfit.upsert({
      where: { orderId: id },
      create: {
        orderId: id,
        shop,
        revenueNet: profitResult.revenueNet,
        cogsTotal: profitResult.cogsTotal,
        feesTotal: profitResult.feesTotal,
        shippingCost: profitResult.shippingCost,
        netProfit: profitResult.netProfit,
        cogsKnown: profitResult.cogsKnown,
      },
      update: {
        revenueNet: profitResult.revenueNet,
        cogsTotal: profitResult.cogsTotal,
        feesTotal: profitResult.feesTotal,
        shippingCost: profitResult.shippingCost,
        netProfit: profitResult.netProfit,
        cogsKnown: profitResult.cogsKnown,
        calculatedAt: new Date(),
      },
    }),
  ]);

  // Update lastOrderSyncedAt cursor (best-effort, outside transaction)
  try {
    const config = await prisma.shopConfig.findFirst({ where: { shop } });
    if (!config || !config.lastOrderSyncedAt || processedAt > config.lastOrderSyncedAt) {
      await prisma.shopConfig.upsert({
        where: { shop },
        create: { shop, lastOrderSyncedAt: processedAt },
        update: { lastOrderSyncedAt: processedAt },
      });
    }
  } catch (err) {
    // Non-fatal: cursor update failure doesn't break the order write
    console.error(`upsertOrder: failed to update lastOrderSyncedAt for ${shop}:`, err.message);
  }

  return { orderId: id };
}

// ---------------------------------------------------------------------------
// triggerBulkSync — start a Shopify Bulk Operation for historical order import
// ---------------------------------------------------------------------------

/**
 * triggerBulkSync(prisma, shop, accessToken)
 * Submits the bulkOperationRunQuery mutation to Shopify and stores the
 * resulting bulk operation ID in ShopConfig for tracking.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} shop
 * @param {string} accessToken
 */
async function triggerBulkSync(prisma, shop, accessToken) {
  const data = await shopifyGraphQL(shop, accessToken, BULK_ORDERS_QUERY, {});

  const { bulkOperation, userErrors } = data.bulkOperationRunQuery;

  if (userErrors && userErrors.length > 0) {
    throw new Error(`Bulk sync error for ${shop}: ${userErrors[0].message}`);
  }

  const bulkOpId = bulkOperation.id;

  await prisma.shopConfig.upsert({
    where: { shop },
    create: { shop, bulkOpId },
    update: { bulkOpId },
  });

  console.log(`Bulk sync triggered for ${shop}: ${bulkOpId}`);
}

// ---------------------------------------------------------------------------
// processBulkResult — stream-parse the JSONL file produced by a bulk operation
// ---------------------------------------------------------------------------

/**
 * processBulkResult(prisma, shop, accessToken, jsonlUrl)
 * Called by the bulk/finish webhook. Streams the JSONL URL, assembles order
 * objects with their child line items (via __parentId), and upserts each order.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} shop
 * @param {string} accessToken - not used for the JSONL download (public URL), kept for signature consistency
 * @param {string} jsonlUrl - Shopify-provided JSONL download URL
 */
async function processBulkResult(prisma, shop, accessToken, jsonlUrl) {
  return new Promise((resolve, reject) => {
    https.get(jsonlUrl, (response) => {
      const rl = readline.createInterface({ input: response, crlfDelay: Infinity });

      // Collect child nodes (lineItems) by their __parentId
      const childrenByParent = {};
      // Queue root order objects for processing
      const orders = [];

      rl.on('line', (line) => {
        if (!line.trim()) return;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          return; // skip malformed lines
        }

        if (obj.__parentId) {
          // Child node (line item from bulk JSONL)
          if (!childrenByParent[obj.__parentId]) {
            childrenByParent[obj.__parentId] = [];
          }
          childrenByParent[obj.__parentId].push(obj);
        } else {
          // Root order node
          orders.push(obj);
        }
      });

      rl.on('close', async () => {
        let count = 0;
        try {
          // Fetch ShopConfig once for fee rate / plan info
          let shopConfig = null;
          try {
            shopConfig = await prisma.shopConfig.findFirst({ where: { shop } });
          } catch {
            // ignore
          }

          for (const rawOrder of orders) {
            // Attach children (line items) to the order node
            const children = childrenByParent[rawOrder.id] || [];
            // Bulk JSONL exposes lineItems as edges/node or flat children with __parentId
            rawOrder.lineItems = { edges: children.map((c) => ({ node: c })) };

            const parsed = parseOrderFromShopify(rawOrder);
            await upsertOrder(
              prisma,
              shop,
              parsed,
              0,
              shopConfig?.shopifyPlan || null
            );

            count++;
            if (count % 100 === 0) {
              console.log(`Processed ${count} orders for ${shop}`);
            }
          }

          console.log(`Bulk sync complete for ${shop}: ${count} orders processed`);

          // Clear bulkOpId now that processing is done
          try {
            await prisma.shopConfig.upsert({
              where: { shop },
              create: { shop, bulkOpId: null },
              update: { bulkOpId: null },
            });
          } catch {
            // non-fatal
          }

          resolve(count);
        } catch (err) {
          reject(err);
        }
      });

      rl.on('error', reject);
      response.on('error', reject);
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// syncIncrementalOrders — paginated incremental sync from lastOrderSyncedAt cursor
// ---------------------------------------------------------------------------

/**
 * syncIncrementalOrders(prisma, shop, accessToken)
 * Fetches orders updated since lastOrderSyncedAt (or 60 days ago if unset),
 * paginates through all pages, and upserts each order.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} shop
 * @param {string} accessToken
 */
async function syncIncrementalOrders(prisma, shop, accessToken) {
  let shopConfig = null;
  try {
    shopConfig = await prisma.shopConfig.findFirst({ where: { shop } });
  } catch {
    // ignore — continue with defaults
  }

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const since = shopConfig?.lastOrderSyncedAt || sixtyDaysAgo;
  const sinceIso = since.toISOString();

  let cursor = null;
  let hasNextPage = true;
  let totalProcessed = 0;

  while (hasNextPage) {
    const data = await shopifyGraphQL(shop, accessToken, INCREMENTAL_ORDERS_QUERY, {
      query: `updated_at:>=${sinceIso}`,
      after: cursor,
    });

    const { pageInfo, nodes } = data.orders;

    for (const rawOrder of nodes) {
      const parsed = parseOrderFromShopify(rawOrder);
      await upsertOrder(prisma, shop, parsed, 0, shopConfig?.shopifyPlan || null);
      totalProcessed++;
    }

    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor || null;
  }

  // Update cursor to now
  try {
    await prisma.shopConfig.upsert({
      where: { shop },
      create: { shop, lastOrderSyncedAt: new Date() },
      update: { lastOrderSyncedAt: new Date() },
    });
  } catch (err) {
    console.error(`syncIncrementalOrders: failed to update cursor for ${shop}:`, err.message);
  }

  console.log(`Incremental sync complete for ${shop}: ${totalProcessed} orders`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  triggerBulkSync,
  processBulkResult,
  upsertOrder,
  syncIncrementalOrders,
  extractCOGS,
  parseOrderFromShopify,
};
