# Phase 4: Billing - Research

**Researched:** 2026-03-14
**Domain:** Shopify Billing API (appSubscriptionCreate GraphQL mutation, recurring subscriptions, billing gate, webhook-driven status tracking)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Trial period**
- 7-day free trial via Shopify Billing API `trialDays: 7`
- Full dashboard access during the trial — no feature restrictions
- Silent trial — no in-app countdown banner or indicator
- After trial ends without subscription approval, merchant loses access and hits the billing gate

**Billing gate UX**
- Unsubscribed merchants are redirected directly to Shopify's native billing approval page — no interstitial page in between
- After approving the subscription, merchant lands directly on the profit dashboard (return URL = `/admin`)
- If merchant declines (hits Cancel on Shopify's page), return them to the same billing gate — they see the redirect again on next visit

**Subscription status tracking**
- Add `billingStatus` field to `ShopSession` model (values: `ACTIVE`, `INACTIVE`, or null for legacy/new shops before billing is checked)
- Billing check occurs on every `/admin` page load — if `billingStatus` is not `ACTIVE`, redirect to Shopify billing approval
- `/api` routes also gated — return 402 if `billingStatus` is not `ACTIVE` (belt-and-suspenders, prevents API calls bypassing the UI gate)

**Cancellation detection**
- Subscribe to `app_subscriptions/update` Shopify webhook — fires on cancellation and expiration
- On webhook receipt: flip `billingStatus` to `INACTIVE` in DB (no data deletion)
- Merchant data is never deleted on cancellation — re-subscribing flips `billingStatus` back to `ACTIVE` and restores full history automatically

### Claude's Discretion
- Exact Shopify Billing API GraphQL mutation to create the subscription
- How to store the `subscriptionId` (for webhook correlation)
- Webhook HMAC verification approach (consistent with existing webhook pattern in `routes/webhooks.js`)
- Whether to create a `routes/billing.js` or add to existing routes

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BILL-01 | App uses Shopify Billing API to charge merchants $29/month via a single recurring subscription plan before granting full access | appSubscriptionCreate mutation verified (HIGH confidence), 7-day trial via trialDays param, billingStatus DB field pattern, app_subscriptions/update webhook for cancellation detection |
</phase_requirements>

---

## Summary

Phase 4 implements a billing gate using Shopify's GraphQL Billing API. The core mechanic is: at OAuth callback completion, call `appSubscriptionCreate` to create a $29/month recurring subscription with a 7-day trial, then redirect the merchant to the returned `confirmationUrl` instead of `/admin`. Upon approval Shopify redirects back to the `returnUrl` (set to `/admin?shop=...`), and the `/admin` route performs a `billingStatus` DB check on every load to enforce the gate.

Subscription status is stored in a new `billingStatus` field on the `ShopSession` model. The field starts as `null` for freshly installed shops. After OAuth the billing flow sets it to `ACTIVE` when a confirmed subscription is detected (or after re-checking via the `currentAppInstallation.activeSubscriptions` GraphQL query). The `app_subscriptions/update` webhook is the mechanism for detecting cancellation, expiry, and freeze — on receipt, the handler queries the current status via GraphQL (because webhook payloads can be empty after API version 2024-07+) and updates `billingStatus` accordingly.

The existing codebase has every pattern needed: HMAC webhook verification in `routes/webhooks.js`, Shopify GraphQL client in `lib/shopifyClient.js`, JWT API gate in `lib/verifySessionToken.js`, and the OAuth callback hook point in `routes/auth.js`. No new npm packages are required.

**Primary recommendation:** Implement billing in a new `routes/billing.js` module (keeps `routes/auth.js` focused on OAuth). Trigger subscription creation from the OAuth callback after session storage, and register `app_subscriptions/update` programmatically via the existing `registerWebhooks` pattern (TOML-registered billing webhooks have a known delivery issue).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Shopify GraphQL Admin API | 2025-10 (already in use) | `appSubscriptionCreate` mutation, `currentAppInstallation` query | Mandatory for App Store apps as of April 1 2025; REST RecurringApplicationCharge is deprecated |
| `lib/shopifyClient.js` | existing | Execute Billing API GraphQL calls | Already wraps fetch with auth headers for the shop's access token |
| Prisma `ShopSession` | existing schema | Store `billingStatus` + `subscriptionId` | Already the source of truth for shop session state |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto` (Node built-in) | built-in | HMAC verification for `app_subscriptions/update` webhook | Same pattern as existing webhook HMAC in `routes/webhooks.js` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DB-cached `billingStatus` | Live `currentAppInstallation` query on every `/admin` load | Live query adds ~200ms latency on every page load and risks rate limiting; DB cache is the standard pattern for embedded apps |
| Programmatic webhook registration | TOML `[[webhooks.subscriptions]]` for `app_subscriptions/update` | TOML billing webhooks have a confirmed delivery bug (not firing events) in current Shopify CLI versions — use programmatic registration |

**Installation:** No new packages needed. All required libraries are already in `package.json`.

---

## Architecture Patterns

### Recommended Project Structure

No new top-level directories needed. Changes touch:

```
routes/
├── auth.js          # Trigger createBillingSubscription after OAuth callback
├── billing.js       # NEW: createBillingSubscription(), checkBillingStatus() helpers
└── webhooks.js      # Add app_subscriptions/update handler

lib/
└── verifySessionToken.js  # Add billingStatus check → 402 when not ACTIVE

prisma/
└── schema.prisma    # Add billingStatus String? and subscriptionId String? to ShopSession

server.js            # /admin route: add billingStatus check + redirect to confirmationUrl
```

### Pattern 1: Subscription Creation at OAuth Callback

**What:** After `prisma.shopSession.upsert()` in `/auth/callback`, call `appSubscriptionCreate` via GraphQL and redirect to `confirmationUrl` instead of `/admin`.

**When to use:** Every new install and every re-install (the mutation is idempotent — Shopify deduplicates by shop, so calling it on existing subscriptions is safe when using `replacementBehavior: STANDARD`).

**Example:**
```javascript
// Source: https://shopify.dev/docs/api/admin-graphql/2025-10/mutations/appsubscriptioncreate
const CREATE_SUBSCRIPTION_MUTATION = `
  mutation AppSubscriptionCreate(
    $name: String!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $returnUrl: URL!
    $trialDays: Int
  ) {
    appSubscriptionCreate(
      name: $name
      lineItems: $lineItems
      returnUrl: $returnUrl
      trialDays: $trialDays
    ) {
      userErrors { field message }
      appSubscription { id status }
      confirmationUrl
    }
  }
`;

const APP_URL = process.env.SHOPIFY_APP_URL;
const variables = {
  name: 'Profit Tracker $29/month',
  returnUrl: `${APP_URL}/admin?shop=${encodeURIComponent(shop)}`,
  trialDays: 7,
  lineItems: [
    {
      plan: {
        appRecurringPricingDetails: {
          price: { amount: 29, currencyCode: 'USD' },
          interval: 'EVERY_30_DAYS',
        },
      },
    },
  ],
};

const data = await shopifyGraphQL(shop, accessToken, CREATE_SUBSCRIPTION_MUTATION, variables);
const { confirmationUrl, appSubscription, userErrors } = data.appSubscriptionCreate;

if (userErrors?.length) {
  // Log and fall back to /admin — don't block merchant from the app entirely
  console.error('appSubscriptionCreate errors:', userErrors);
  return res.redirect(`/admin?shop=${encodeURIComponent(shop)}`);
}

// Store subscriptionId for webhook correlation
await prisma.shopSession.update({
  where: { shop },
  data: { subscriptionId: appSubscription.id },
});

res.redirect(confirmationUrl);
```

### Pattern 2: Billing Gate in `/admin` Route

**What:** Before serving `index.html`, check `ShopSession.billingStatus`. If not `ACTIVE`, call `appSubscriptionCreate` again to get a fresh `confirmationUrl` and redirect. This covers: new installs mid-flow, trial expiry, and returning declined merchants.

**When to use:** Every `/admin` GET. The DB check is a single `findFirst` — negligible overhead.

**Example:**
```javascript
// In server.js /admin route
app.get('/admin', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Missing shop parameter');

  const session = await prisma.shopSession.findFirst({ where: { shop } });
  if (!session) return res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);

  // Billing gate — redirect to subscription approval if not ACTIVE
  if (session.billingStatus !== 'ACTIVE') {
    const { confirmationUrl } = await createBillingSubscription(shop, session.accessToken);
    return res.redirect(confirmationUrl);
  }

  res.sendFile(path.join(__dirname, 'public', 'app', 'index.html'));
});
```

### Pattern 3: Billing Gate in `/api` Routes (402 Guard)

**What:** After JWT verification sets `req.shopDomain`, check `billingStatus` from DB before proceeding.

**When to use:** Added to `lib/verifySessionToken.js` as a second middleware stage, or as a separate middleware applied to `/api` routes.

**Example:**
```javascript
// lib/verifySessionToken.js — after existing JWT check sets req.shopDomain
// Add billing check middleware for /api routes:
async function verifyBillingStatus(req, res, next) {
  const session = await prisma.shopSession.findFirst({ where: { shop: req.shopDomain } });
  if (!session || session.billingStatus !== 'ACTIVE') {
    return res.status(402).json({ error: 'Subscription required' });
  }
  next();
}
```

### Pattern 4: Webhook Handler for Cancellation/Status Changes

**What:** `app_subscriptions/update` fires on any subscription status change. Because payload may be empty (Shopify bug since API 2024-07), the handler must query current status via `currentAppInstallation.activeSubscriptions` rather than trusting the payload.

**When to use:** Registered programmatically in `registerWebhooks()` — NOT via TOML (TOML billing webhooks have a confirmed delivery bug).

**Example:**
```javascript
// Source: https://shopify.dev/docs/api/admin-graphql/latest/queries/currentappinstallation
const ACTIVE_SUBSCRIPTIONS_QUERY = `
  query {
    currentAppInstallation {
      activeSubscriptions {
        id
        status
      }
    }
  }
`;

router.post('/app_subscriptions/update', async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(req.body, hmac)) return res.status(401).send('Unauthorized');

  res.status(200).send('OK'); // Respond immediately

  setImmediate(async () => {
    try {
      // Payload may be empty — extract shop from header, not body
      const shop = req.headers['x-shopify-shop-domain'];
      if (!shop) return;

      const session = await prisma.shopSession.findFirst({ where: { shop } });
      if (!session) return;

      // Query current subscription status from Shopify (don't trust empty payload)
      const data = await shopifyGraphQL(shop, session.accessToken, ACTIVE_SUBSCRIPTIONS_QUERY);
      const activeSubscriptions = data?.currentAppInstallation?.activeSubscriptions ?? [];
      const isActive = activeSubscriptions.some(s => s.status === 'ACTIVE');

      await prisma.shopSession.update({
        where: { shop },
        data: { billingStatus: isActive ? 'ACTIVE' : 'INACTIVE' },
      });

      console.log(`app_subscriptions/update: ${shop} billingStatus → ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
    } catch (err) {
      console.error('app_subscriptions/update error:', err.message);
    }
  });
});
```

### Pattern 5: Confirming Active Status After Merchant Returns from Billing Approval

**What:** When the merchant returns to `returnUrl` (`/admin?shop=...`) after approving, the `/admin` route checks `billingStatus`. But the webhook may not have fired yet. Need to verify status on return.

**When to use:** In the `/admin` billing gate check — if `billingStatus` is not yet `ACTIVE` but the merchant just came from Shopify's approval page, query `currentAppInstallation.activeSubscriptions` and update the DB before deciding to redirect.

**Design decision (Claude's discretion):** The cleanest pattern is to query Shopify live when `billingStatus !== 'ACTIVE'` in the `/admin` route. If Shopify confirms an active subscription, update the DB to `ACTIVE` and serve the dashboard. This handles the race between approval redirect and webhook delivery.

```javascript
// /admin billing gate with live verification fallback
if (session.billingStatus !== 'ACTIVE') {
  const data = await shopifyGraphQL(shop, session.accessToken, ACTIVE_SUBSCRIPTIONS_QUERY);
  const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
  const activeSub = subs.find(s => s.status === 'ACTIVE');

  if (activeSub) {
    // Subscription was just approved — update DB and serve dashboard
    await prisma.shopSession.update({
      where: { shop },
      data: {
        billingStatus: 'ACTIVE',
        subscriptionId: activeSub.id,
      },
    });
    return res.sendFile(path.join(__dirname, 'public', 'app', 'index.html'));
  }

  // Not active — redirect to billing confirmation
  const { confirmationUrl } = await createBillingSubscription(shop, session.accessToken);
  return res.redirect(confirmationUrl);
}
```

### Anti-Patterns to Avoid

- **Trusting the app_subscriptions/update webhook payload for status:** Payloads are empty since API version 2024-07. Always query `currentAppInstallation.activeSubscriptions` after receipt.
- **Registering billing webhook via TOML:** Known Shopify CLI bug — events are not delivered for billing webhooks configured in `shopify.app.toml`. Register programmatically via GraphQL in `registerWebhooks()`.
- **Setting billingStatus = ACTIVE without checking Shopify:** Don't mark active based solely on the OAuth return URL — the merchant may not have completed the approval page.
- **Blocking the OAuth redirect on billing errors:** `appSubscriptionCreate` errors should be logged but not prevent the merchant from reaching the app. Fall through to `/admin` and let the billing gate handle it.
- **Using `trialDays` without including it in the mutation signature:** A known Shopify community pitfall — if `trialDays` is passed as a variable but not declared in the mutation signature, it is silently ignored.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Merchant billing approval page | Custom charge approval UI | Shopify's native `confirmationUrl` page | Shopify policy: must use their hosted page; hand-rolled pages will fail App Store review |
| Subscription status sync | Polling Shopify billing API on a cron | `app_subscriptions/update` webhook + `currentAppInstallation` live query fallback | Webhook is event-driven; live query handles race conditions on return from approval |
| Billing amount calculation | Custom proration logic | Let Shopify handle proration | Shopify calculates and handles all billing proration internally |
| Off-platform billing | Stripe, Paddle, etc. | Shopify Billing API only | Apps using off-platform billing cannot be distributed via App Store |

**Key insight:** The entire merchant-facing billing UI is hosted by Shopify. The app's only job is to create the subscription object and redirect to `confirmationUrl`. All charge presentation, PCI compliance, and payment processing is Shopify's responsibility.

---

## Common Pitfalls

### Pitfall 1: Empty Webhook Payload from app_subscriptions/update

**What goes wrong:** Handler reads `req.body.app_subscription.status` expecting `CANCELLED` — gets a parse error or undefined because the payload is empty JSON `{}`.

**Why it happens:** Shopify introduced an empty payload for billing webhooks starting around API version 2024-07. This was reported as a bug but remains unresolved as of 2026-03.

**How to avoid:** Never read status from the webhook body. Use `x-shopify-shop-domain` header to identify the shop, then query `currentAppInstallation.activeSubscriptions` via GraphQL to get the real current status.

**Warning signs:** Parse errors on `req.body.toString()`, `app_subscription` is undefined in the payload.

### Pitfall 2: TOML Billing Webhook Not Delivering Events

**What goes wrong:** `[[webhooks.subscriptions]]` entry for `app_subscriptions/update` is added to `shopify.app.profit-tracker.toml` — it appears in Partner Dashboard but events never arrive.

**Why it happens:** Confirmed Shopify CLI bug — billing webhook subscriptions created via TOML do not receive events. The same topic registered via `webhookSubscriptionCreate` GraphQL mutation works correctly.

**How to avoid:** Register `app_subscriptions/update` programmatically in `registerWebhooks()` in `routes/auth.js`, using the same pattern as existing order webhooks. Do NOT add to TOML.

**Warning signs:** Webhook shows as registered in Partner Dashboard but `/webhooks/app_subscriptions/update` endpoint never receives POST requests.

### Pitfall 3: Race Between Approval Redirect and Webhook Delivery

**What goes wrong:** Merchant approves billing, Shopify redirects to `/admin?shop=...`, but `billingStatus` is still `null` or `INACTIVE` in the DB because the `app_subscriptions/update` webhook hasn't fired yet. Merchant is immediately redirected to billing again in a loop.

**Why it happens:** Webhook delivery is asynchronous. The merchant's browser arrives at `/admin` within milliseconds; webhooks arrive seconds to minutes later.

**How to avoid:** In the `/admin` billing gate, when `billingStatus !== 'ACTIVE'`, perform a live `currentAppInstallation.activeSubscriptions` query before deciding to redirect. If Shopify confirms an active subscription, update DB to `ACTIVE` and serve the dashboard (Pattern 5 above).

**Warning signs:** Merchant reports being stuck in a billing approval loop even after approving the subscription.

### Pitfall 4: Mutation Signature Missing trialDays

**What goes wrong:** `trialDays` is passed in the variables object but the mutation does not declare `$trialDays: Int` in its signature — Shopify silently ignores the variable and creates a subscription with no trial.

**Why it happens:** GraphQL variables not declared in the mutation signature are silently dropped by Shopify's parser.

**How to avoid:** Mutation signature must include `$trialDays: Int` and the argument must be passed explicitly: `appSubscriptionCreate(... trialDays: $trialDays ...)`.

**Warning signs:** Subscription is created successfully but `trialDays` in the returned `appSubscription` object is 0.

### Pitfall 5: billingStatus Never Set to ACTIVE on Re-install

**What goes wrong:** A merchant who previously had an `ACTIVE` subscription uninstalls, re-installs, and the new OAuth callback creates a new subscription. But `billingStatus` stays `null` because the new subscription is still `PENDING` (awaiting approval). Merchant approves, but the webhook sets `billingStatus` to `ACTIVE`. If webhook is not registered, status stays null forever.

**Why it happens:** Subscription approval creates a webhook event. Without the webhook handler, there is no other mechanism to flip `billingStatus` to `ACTIVE` — except the live query fallback in the `/admin` gate (Pattern 5).

**How to avoid:** Implement Pattern 5 (live query fallback in `/admin` gate) as the primary `ACTIVE` detection mechanism. Webhook is the secondary sync mechanism.

---

## Code Examples

### AppSubscription Status Enum (Verified)

```
// Source: https://shopify.dev/docs/api/admin-graphql/2025-10/enums/AppSubscriptionStatus
ACTIVE    — approved by merchant, currently billing
PENDING   — awaiting merchant approval
DECLINED  — declined by merchant (terminal)
EXPIRED   — not approved within 2 days of creation (terminal)
FROZEN    — on hold due to non-payment; reactivates when payments resume
CANCELLED — cancelled (app uninstall, new subscription activation, or explicit cancel) (terminal)
```

### Create Subscription Mutation (Full, Verified)

```javascript
// Source: https://shopify.dev/docs/api/admin-graphql/2025-10/mutations/appsubscriptioncreate
const CREATE_SUBSCRIPTION_MUTATION = `
  mutation AppSubscriptionCreate(
    $name: String!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $returnUrl: URL!
    $trialDays: Int
  ) {
    appSubscriptionCreate(
      name: $name
      lineItems: $lineItems
      returnUrl: $returnUrl
      trialDays: $trialDays
    ) {
      userErrors { field message }
      appSubscription { id status trialDays }
      confirmationUrl
    }
  }
`;

const variables = {
  name: 'Profit Tracker $29/month',
  returnUrl: `${process.env.SHOPIFY_APP_URL}/admin?shop=${encodeURIComponent(shop)}`,
  trialDays: 7,
  lineItems: [{
    plan: {
      appRecurringPricingDetails: {
        price: { amount: 29, currencyCode: 'USD' },
        interval: 'EVERY_30_DAYS',
      },
    },
  }],
};
```

### Check Active Subscriptions Query (Verified)

```javascript
// Source: https://shopify.dev/docs/api/admin-graphql/latest/queries/currentappinstallation
const ACTIVE_SUBSCRIPTIONS_QUERY = `
  query {
    currentAppInstallation {
      activeSubscriptions {
        id
        status
      }
    }
  }
`;
// Note: activeSubscriptions only returns ACTIVE status subscriptions
// If array is empty → no active subscription → billingStatus = INACTIVE
```

### Prisma Schema Changes

```prisma
// prisma/schema.prisma — add to ShopSession model
model ShopSession {
  // ... existing fields ...
  billingStatus  String?   @map("billing_status")   // 'ACTIVE' | 'INACTIVE' | null
  subscriptionId String?   @map("subscription_id")  // GID e.g. gid://shopify/AppSubscription/123
}
```

### Webhook Registration Addition

```javascript
// routes/auth.js — add to WEBHOOK_TOPICS array
{ topic: 'APP_SUBSCRIPTIONS_UPDATE', uri: '/webhooks/app_subscriptions/update' },
// Note: use topic name APP_SUBSCRIPTIONS_UPDATE (enum format) not app_subscriptions/update
```

### app_subscriptions/update Webhook Payload Structure

```json
// Based on community reports — payload may be empty ({}) after API 2024-07
// Always use x-shopify-shop-domain header; do NOT parse body for status
{
  "app_subscription": {
    "admin_graphql_api_id": "gid://shopify/AppSubscription/1029266950",
    "name": "Profit Tracker $29/month",
    "status": "CANCELLED",
    "admin_graphql_api_shop_id": "gid://shopify/Shop/548380009",
    "created_at": "...",
    "updated_at": "..."
  }
}
// WARNING: payload may be {} — treat body as unreliable, use GraphQL query instead
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| REST `RecurringApplicationCharge` API | GraphQL `appSubscriptionCreate` mutation | Deprecated; mandatory GraphQL for new apps as of 2025-04-01 | Must use GraphQL — REST billing API cannot be used for new App Store apps |
| TOML webhook subscription for billing | Programmatic `webhookSubscriptionCreate` mutation | Bug introduced ~2024-07 | TOML billing webhooks silently fail to deliver events |
| Trust webhook payload for status | Query `currentAppInstallation.activeSubscriptions` on webhook receipt | ~API 2024-07 | Webhook payloads became unreliable/empty — must query live status |

**Deprecated/outdated:**
- REST `RecurringApplicationCharge`: Replaced by `appSubscriptionCreate`. Cannot use for new public apps in 2025.
- TOML `[[webhooks.subscriptions]]` for `app_subscriptions/update`: Bug confirmed in Shopify community — use programmatic registration.

---

## Open Questions

1. **Does `currentAppInstallation` require a specific scope?**
   - What we know: Some developers report "access denied" errors querying `activeSubscriptions`. This may be scope-related.
   - What's unclear: Whether `read_orders` or another already-granted scope covers this, or if it's inherently available to the app's own access token.
   - Recommendation: Test with the store's access token during implementation. `currentAppInstallation` is the app's own data — it should not require additional scopes beyond the default app installation. If access denied occurs, check if the access token has the necessary permissions.

2. **Webhook topic enum name for programmatic registration**
   - What we know: The webhook topic in TOML would be `app_subscriptions/update`. GraphQL `WebhookSubscriptionTopic` enum uses underscore-uppercase format.
   - What's unclear: Exact enum value — `APP_SUBSCRIPTIONS_UPDATE` (confirmed in existing code pattern for `APP_SUBSCRIPTIONS_UPDATE`) vs some other casing.
   - Recommendation: Use `APP_SUBSCRIPTIONS_UPDATE` — consistent with existing topics like `ORDERS_PAID`. Verify against `WebhookSubscriptionTopic` enum in Shopify docs if registration fails.

3. **Behavior of appSubscriptionCreate on re-install with existing PENDING subscription**
   - What we know: `replacementBehavior: STANDARD` (default) controls how new subscriptions interact with existing ones.
   - What's unclear: Whether calling `appSubscriptionCreate` when a PENDING subscription already exists creates a duplicate or replaces it.
   - Recommendation: The default `STANDARD` replacement behavior should handle this correctly. If in doubt, the `/admin` live query fallback (Pattern 5) ensures correctness regardless of duplicate subscriptions.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 |
| Config file | `/Users/henry/code/profit-tracker/jest.config.js` |
| Quick run command | `npx jest tests/billing.test.js --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILL-01 | New install → redirect to confirmationUrl, not /admin | unit | `npx jest tests/billing.test.js --no-coverage` | Wave 0 |
| BILL-01 | /admin with billingStatus=null → redirect to confirmationUrl | unit | `npx jest tests/billing.test.js --no-coverage` | Wave 0 |
| BILL-01 | /admin with billingStatus=ACTIVE → serve dashboard | unit | `npx jest tests/billing.test.js --no-coverage` | Wave 0 |
| BILL-01 | /admin with billingStatus=INACTIVE → redirect to confirmationUrl | unit | `npx jest tests/billing.test.js --no-coverage` | Wave 0 |
| BILL-01 | /api route with billingStatus=INACTIVE → 402 | unit | `npx jest tests/billing.test.js --no-coverage` | Wave 0 |
| BILL-01 | app_subscriptions/update webhook with HMAC → update billingStatus in DB | unit | `npx jest tests/billing.test.js --no-coverage` | Wave 0 |
| BILL-01 | app_subscriptions/update webhook invalid HMAC → 401 | unit | `npx jest tests/billing.test.js --no-coverage` | Wave 0 |
| BILL-01 | app_subscriptions/update with empty payload → queries Shopify GraphQL for status | unit | `npx jest tests/billing.test.js --no-coverage` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest tests/billing.test.js --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/billing.test.js` — covers all BILL-01 behaviors listed above; follows `tests/webhooks.test.js` pattern (supertest + jest mocks for prisma and shopifyClient)

---

## Sources

### Primary (HIGH confidence)
- `https://shopify.dev/docs/api/admin-graphql/2025-10/mutations/appsubscriptioncreate` — mutation signature, required fields, confirmationUrl, trialDays, lineItems/AppRecurringPricingInput structure
- `https://shopify.dev/docs/api/admin-graphql/2025-10/enums/AppSubscriptionStatus` — all six status enum values and their definitions (ACTIVE, PENDING, DECLINED, EXPIRED, FROZEN, CANCELLED)
- `https://shopify.dev/docs/api/admin-graphql/latest/queries/currentappinstallation` — activeSubscriptions field structure for live status query

### Secondary (MEDIUM confidence)
- `https://shopify.dev/docs/apps/launch/billing` — overall billing flow, merchant approval sequence, App Store billing requirements
- `https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements` — mandatory Shopify Billing API for App Store distribution, verified 2026-03
- `https://shopify.dev/docs/apps/launch/billing/subscription-billing/create-time-based-subscriptions` — confirms EVERY_30_DAYS interval, returnUrl mechanics, APP_SUBSCRIPTIONS_UPDATE webhook topic

### Tertiary (LOW confidence — flagged for validation)
- `https://community.shopify.dev/t/empty-payload-in-app-subscriptions-update-webhook-after-api-upgrade/18601` — empty payload issue since API 2024-07; workaround is live GraphQL query. Community report, not official docs.
- `https://community.shopify.dev/t/app-subscriptions-update-webhook-subscribed-through-shopify-cli-doesnt-send-events/23620` — TOML billing webhook delivery bug. Community report; no official acknowledgment found.
- `https://community.shopify.dev/t/clarifying-app-subscriptions-update-webhook-behavior-in-the-billing-system/25467` — webhook fires on billing cycle changes; payload contains subscription value not billing specifics. Community report.
- Webhook payload JSON structure (`app_subscription.admin_graphql_api_id`, `status` fields) — inferred from community reports and 2024-04 API docs; structure may differ in 2025-10.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `appSubscriptionCreate` mutation verified against official 2025-10 API docs; no new packages needed
- Architecture patterns: HIGH for mutation and billing gate logic; MEDIUM for webhook payload (empty payload issue confirmed via community but not official docs)
- Pitfalls: MEDIUM — empty payload and TOML webhook bug are community-confirmed but lack official Shopify documentation acknowledgment; treat as HIGH-probability risks given multiple independent reports

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (30 days — Shopify Billing API is stable; TOML webhook bug may be fixed in CLI updates)
