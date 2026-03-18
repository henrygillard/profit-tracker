// lib/syncPayouts.js
// SYNC-04: Sync Shopify Payments payout data to obtain exact transaction fees per order.
// Requires read_shopify_payments_payouts scope in shopify.app.toml.
const { shopifyGraphQL } = require('./shopifyClient');

const BALANCE_TRANSACTIONS_QUERY = `
  query($after: String) {
    shopifyPaymentsAccount {
      balanceTransactions(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          type
          fee { amount }
          associatedOrder { id }
        }
      }
    }
  }
`;

/**
 * syncPayouts — fetches Shopify Payments balance transactions and writes
 * the exact processing fee amount to OrderProfit.feesTotal for each matched order.
 * Sets feeSource: 'verified' on updated OrderProfit records.
 *
 * Idempotent: calling multiple times overwrites feesTotal with the same value.
 * Only processes CHARGE type transactions (not REFUND, ADJUSTMENT, PAYOUT, etc.).
 * Multiple CHARGE transactions for the same order are summed.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} shop - e.g. 'store.myshopify.com'
 * @param {string} accessToken
 */
async function syncPayouts(prisma, shop, accessToken) {
  // Accumulate fees per order across all pages: { orderGid → totalFee }
  const feesByOrder = new Map();

  let cursor = null;
  let pageCount = 0;

  do {
    const variables = cursor ? { after: cursor } : {};
    let data;
    try {
      data = await shopifyGraphQL(shop, accessToken, BALANCE_TRANSACTIONS_QUERY, variables);
    } catch (err) {
      console.error(`syncPayouts: GraphQL error for ${shop} (page ${pageCount + 1}):`, err.message);
      throw err;
    }

    const balancePage = data?.shopifyPaymentsAccount?.balanceTransactions;
    if (!balancePage) {
      console.log(`syncPayouts: shopifyPaymentsAccount not available for ${shop} — store may not use Shopify Payments`);
      return;
    }

    for (const txn of balancePage.nodes) {
      if (txn.type !== 'CHARGE') continue; // Only credit card processing fees
      const orderId = txn.associatedOrder?.id;
      if (!orderId) continue;

      const fee = parseFloat(txn.fee?.amount || 0);
      feesByOrder.set(orderId, (feesByOrder.get(orderId) || 0) + fee);
    }

    cursor = balancePage.pageInfo.hasNextPage ? balancePage.pageInfo.endCursor : null;
    pageCount++;
  } while (cursor);

  console.log(`syncPayouts: fetched ${pageCount} page(s), found fees for ${feesByOrder.size} orders in ${shop}`);

  // Write fees to OrderProfit records
  let updated = 0;
  let skipped = 0;

  for (const [orderId, totalFee] of feesByOrder) {
    try {
      await prisma.orderProfit.update({
        where: { orderId },
        data: { feesTotal: totalFee, feeSource: 'verified' },
      });
      updated++;
    } catch (err) {
      // P2025 = record not found — order not yet synced, skip
      if (err.code === 'P2025') {
        skipped++;
        console.log(`syncPayouts: no OrderProfit for ${orderId} — order not yet synced, skipping`);
      } else {
        console.error(`syncPayouts: failed to update feesTotal for ${orderId}:`, err.message);
      }
    }
  }

  console.log(`syncPayouts: complete for ${shop} — updated=${updated} skipped=${skipped}`);
}

module.exports = { syncPayouts };
