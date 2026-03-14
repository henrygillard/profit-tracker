# Shopify Profit Analytics App — Product Brief

## Overview

A Shopify-native profit clarity dashboard that shows merchants their **actual profit margins** — not just revenue — by automatically factoring in COGS, Shopify fees, shipping costs, and ad spend. Simple, affordable, and focused.

**Core value prop:** _"See what you actually kept, not just what came in."_

---

## The Problem

Shopify's built-in analytics is strong on revenue reporting but blind to true profitability. Merchants have no easy way to answer:

- Did I actually make money on that order?
- Which products are carrying my store vs. dragging it down?
- Is my ad spend profitable after fees and COGS?
- What does my margin look like per SKU over time?

### Why existing solutions fall short

| Tool                         | Problem                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| **Triple Whale**             | Starts at ~$129/month, focused on ad attribution over margin clarity |
| **Brightpearl**              | Enterprise-grade complexity, setup isn't trivial                     |
| **Inventory Planner**        | Inventory-focused, not a profit dashboard                            |
| **BeProfit / Peel Insights** | Closer to the mark but reviews cite UX issues and pricing            |
| **Shopify native reports**   | Revenue only — no COGS, no fee deduction, no ad spend                |
| **SellerBoard**              | Fragmented across platforms, not Shopify-native                      |

### What merchants are actually saying (from Reddit research)

- _"I want to look at a single SKU and know if it's profitable for my company overall."_
- _"Triple Whale is deceptive — I don't find the data actionable."_
- _"Most affordable platforms have gaps. You're dealing with the tradeoff between cost and integration depth."_
- _"The setup isn't trivial."_ — common complaint about comprehensive tools

**The gap:** An affordable, clean, no-fluff profit dashboard built specifically for Shopify merchants.

---

## Target Merchant

- Shopify stores doing **$10K–$200K/month**
- Selling on Shopify as primary or only channel
- Running paid ads on Meta and/or Google
- Frustrated by the gap between their revenue numbers and what they actually take home
- Not technical enough to build custom reports, not large enough to justify enterprise tools

---

## Market Needs

### 1. True profit per order

Merchants need to see each order's actual margin after:

- Cost of goods sold (COGS)
- Shopify transaction fees
- Payment processing fees
- Shipping cost (label cost, not charged amount)
- Proportional ad spend attribution

### 2. SKU-level profitability over time

- Which products are consistently profitable?
- Which have margin erosion over time (rising COGS, increased returns)?
- Which SKUs to double down on vs. discontinue?

### 3. Cohort-based customer LTV

- Customers who bought Product X in Month 1 — how much did they spend over 12 months?
- Which acquisition channels produce the highest LTV customers?
- Useful for making informed ad spend decisions

### 4. Ad spend vs. actual profit

- Connect Meta/Google spend to Shopify orders
- Show whether campaigns are profitable **after COGS and fees** — not just ROAS
- ROAS is a vanity metric; profit per campaign is what matters

---

## MVP Feature Set

### Phase 1 — Core Dashboard

**COGS Management**

- Manual COGS input per SKU
- Bulk CSV import for COGS data
- Variant-level COGS support

**Automatic Fee Calculation**

- Shopify transaction fee deduction (based on merchant's plan)
- Stripe/payment processor fee deduction
- Shipping label cost input (manual or Shopify Shipping pull)

**Profit Dashboard**

- Store-level profit overview (daily / weekly / monthly / custom range)
- Profit per order view
- Profit per product / SKU view
- Margin % per product
- Best and worst performing products by margin

### Phase 2 — Ad Integration

**Ad Account Connection**

- Meta Ads integration
- Google Ads integration
- Ad spend attribution per order / per product (last-click to start)
- True profit after ad spend per campaign

### Phase 3 — Advanced Analytics

**Cohort LTV**

- Customer cohort builder by first purchase date, product, or channel
- LTV curves over 30 / 60 / 90 / 180 / 365 days

**Trend Analysis**

- Margin trend per SKU over time
- Flag products with deteriorating margins
- Seasonal profitability patterns

---

## Differentiation Strategy

| Principle              | Detail                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **Simple first**       | No onboarding overwhelm. Merchants enter COGS, connect Shopify, see profit immediately |
| **Affordable**         | Target $19–$49/month to undercut Triple Whale significantly                            |
| **Shopify-native**     | One platform, one API, no multi-channel complexity                                     |
| **Honest metrics**     | No inflated ROAS. Show margin, not revenue theater                                     |
| **Fast time-to-value** | Merchant should see meaningful data within 10 minutes of install                       |

---

## Technical Architecture (High Level)

- **Backend:** Node.js / Express (consistent with your existing Shopify app stack)
- **Shopify Integration:** Admin REST API + GraphQL for orders, products, payouts
- **Database:** PostgreSQL — store COGS, computed margins, cached order data
- **Ad Integrations:** Meta Marketing API, Google Ads API (Phase 2)
- **Frontend:** React dashboard, likely embedded in Shopify Admin via App Bridge
- **Hosting:** Railway (consistent with Promify infrastructure)
- **Billing:** Shopify Billing API — usage-based or tiered subscription

---

## App Store Positioning

**App name ideas (TBD):** Margify, Clearmargin, Profitly, Netly

**Headline:** See your real profit — not just your revenue.

**Subhead:** Connect your COGS, fees, and ad spend to finally know which products and orders are actually making you money.

**Key App Store bullets:**

- True profit per order after fees, COGS, and shipping
- SKU-level margin breakdown — know your winners and dead weight
- Connect Meta and Google to see profit per campaign, not just ROAS
- Up and running in under 10 minutes

---

## Open Questions / To Validate

- [ ] Audit BeProfit and Peel Insights App Store reviews — what do merchants complain about most?
- [ ] Determine if Shopify Shipping API provides label costs or if manual input is needed at MVP
- [ ] Decide whether to build Phase 2 (ad integration) pre-launch or post-traction
- [ ] Validate pricing sensitivity — survey potential users on $19 vs $29 vs $49/month
- [ ] Decide on brand — standalone product or part of existing app portfolio?

---

_Brief created: March 2026_
