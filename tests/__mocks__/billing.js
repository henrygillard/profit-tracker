// tests/__mocks__/billing.js
// Jest mock for routes/billing.js — createBillingSubscription and checkBillingStatus
// are jest.fn() so tests can mock their return values.
// billingWebhookRouter uses the real implementation (with its own mocked dependencies)
// so HMAC verification and webhook handler logic is fully exercised in tests.

const { billingWebhookRouter } = jest.requireActual('../../routes/billing');

const createBillingSubscription = jest.fn().mockResolvedValue({ confirmationUrl: null });
const checkBillingStatus = jest.fn().mockResolvedValue(false);

module.exports = { createBillingSubscription, checkBillingStatus, billingWebhookRouter };
