// lib/profitEngine.js
// Pure profit calculation functions. No I/O except getCOGSAtTime (Prisma lookup).
// calculateOrderProfit is pure — receives cogs-resolved lineItems from sync code.

// Shopify third-party transaction fee rates by plan name.
// Source: https://www.shopify.com/pricing (verify before shipping)
const THIRD_PARTY_FEE_RATES = {
  'Basic':    0.02,
  'Grow':     0.01,
  'Advanced': 0.006,
  'Plus':     0.002,
};

/**
 * Return the third-party transaction fee rate for a Shopify plan.
 * Defaults to Basic rate (0.02) for unknown plans.
 * @param {string} planDisplayName - e.g. 'Basic', 'Grow', 'Advanced', 'Plus'
 * @returns {number} - decimal fee rate
 */
function getThirdPartyFeeRate(planDisplayName) {
  return THIRD_PARTY_FEE_RATES[planDisplayName] ?? 0.02;
}

/**
 * Look up the COGS for a variant as of a specific date (time-series pattern).
 * NEVER coerce null to 0 — null means unknown COGS.
 * @param {object} prisma - Prisma client instance
 * @param {string} shop - Shop domain
 * @param {string} variantId - Shopify variant GID
 * @param {Date} processedAt - Order processedAt date
 * @returns {Promise<number|null>} - cost as float, or null if no cost record found
 */
async function getCOGSAtTime(prisma, shop, variantId, processedAt) {
  const cost = await prisma.productCost.findFirst({
    where: {
      shop,
      variantId,
      effectiveFrom: { lte: processedAt },
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  if (!cost) {
    return null;
  }

  return parseFloat(cost.costAmount);
}

/**
 * Calculate profit for a single order. Pure function — no Prisma calls.
 * Caller is responsible for resolving cogs on each lineItem before calling.
 *
 * @param {object} order
 * @param {string} order.currentTotalPrice - Order total price (pre-refund gross)
 * @param {string|number} order.totalRefunded - Total amount refunded
 * @param {Array}  order.lineItems - [{ variantId, quantity, unitPrice, cogs }]
 *                                   cogs is null if unknown — NEVER coerce to 0
 * @param {string} order.paymentGateway - e.g. 'shopify_payments', 'manual'
 * @param {string|number} order.shippingCost - Shipping cost
 * @param {string|number|null} order.shopifyPaymentsFee - Actual fee from payout (Shopify Payments only)
 * @param {string} [order.planDisplayName] - Shopify plan name for third-party fee rate
 *
 * @returns {object} - { revenueNet, cogsTotal, feesTotal, shippingCost, netProfit, cogsKnown }
 *                     cogsTotal and netProfit are null when cogsKnown is false
 */
function calculateOrderProfit(order) {
  const {
    currentTotalPrice,
    totalRefunded,
    lineItems,
    paymentGateway,
    shippingCost: shippingCostRaw,
    shopifyPaymentsFee,
    planDisplayName,
  } = order;

  const totalPrice = parseFloat(currentTotalPrice);
  const refundedAmount = parseFloat(totalRefunded) || 0;
  const revenueNet = totalPrice - refundedAmount;
  const shippingCost = parseFloat(shippingCostRaw) || 0;

  // Determine if all COGS are known — null on any lineItem means unknown
  const cogsKnown = lineItems.every(li => li.cogs !== null && li.cogs !== undefined);

  let cogsTotal = null;
  if (cogsKnown) {
    // Sum raw COGS for all line items
    const rawCogsTotal = lineItems.reduce((sum, li) => sum + (li.quantity * li.cogs), 0);

    // Proportionally adjust COGS when there is a refund
    // refundRatio = revenueNet / sum(lineItems unitPrice * quantity)
    if (refundedAmount > 0) {
      const itemsTotal = lineItems.reduce((sum, li) => sum + (li.quantity * parseFloat(li.unitPrice)), 0);
      const retainedRatio = itemsTotal > 0 ? revenueNet / itemsTotal : 1;
      cogsTotal = rawCogsTotal * retainedRatio;
    } else {
      cogsTotal = rawCogsTotal;
    }
  }

  // Determine fees
  let feesTotal;
  if (paymentGateway && paymentGateway.includes('shopify_payments')) {
    // Use the actual payout fee from Shopify Payments
    feesTotal = parseFloat(shopifyPaymentsFee) || 0;
  } else {
    // Third-party gateway — apply plan rate to revenueNet
    feesTotal = getThirdPartyFeeRate(planDisplayName) * revenueNet;
  }

  // netProfit is null when COGS are unknown
  const netProfit = cogsKnown ? revenueNet - cogsTotal - feesTotal - shippingCost : null;

  return {
    revenueNet,
    cogsTotal,
    feesTotal,
    shippingCost,
    netProfit,
    cogsKnown,
  };
}

module.exports = { calculateOrderProfit, getCOGSAtTime, getThirdPartyFeeRate, THIRD_PARTY_FEE_RATES };
