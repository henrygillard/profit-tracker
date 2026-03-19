require('dotenv').config({ path: require('path').join(process.cwd(), '.env') });

// Validate required env vars before anything else
const REQUIRED_ENV = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'SHOPIFY_APP_URL', 'DATABASE_URL', 'SHOPIFY_SCOPES'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { prisma } = require('./lib/prisma');
const { validateShop } = require('./lib/utils');
const { startScheduler } = require('./lib/scheduler');
const { syncIncrementalOrders } = require('./lib/syncOrders');
const { syncAdSpend } = require('./lib/syncAdSpend');
const { createBillingSubscription, checkBillingStatus } = require('./routes/billing');

const app = express();
const PORT = process.env.PORT || 3000;
const fs = require('fs');

const appHtmlPath = path.join(__dirname, 'public', 'app', 'index.html');
function sendAppHtml(res) {
  const html = fs.readFileSync(appHtmlPath, 'utf8').replace(
    '__SHOPIFY_API_KEY__',
    process.env.SHOPIFY_API_KEY
  );
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

// Trust proxy for Railway
app.set('trust proxy', 1);

// CSP frame-ancestors scoped per shop (required for Shopify embedded apps)
app.use((req, res, next) => {
  const shop = req.query.shop || '';
  const normalizedShop = shop.includes('.') ? shop : shop ? `${shop}.myshopify.com` : null;
  if (normalizedShop && validateShop(normalizedShop)) {
    res.setHeader(
      'Content-Security-Policy',
      `frame-ancestors https://${normalizedShop} https://admin.shopify.com`
    );
  } else {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  }
  next();
});

// Rate limiting for OAuth endpoints
const authLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/auth', authLimiter);

// CRITICAL: raw body for webhooks BEFORE json parser — do not change order
// Changing this order will silently break webhook HMAC verification.
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', require('./routes/auth'));
app.use('/ads', require('./routes/ads-auth'));
app.use('/webhooks', require('./routes/webhooks'));

// JWT-protected API routes — shop identity from token, not query string
const { verifySessionToken } = require('./lib/verifySessionToken');
app.use('/api', verifySessionToken);
app.use('/api', require('./routes/api'));

/**
 * GET /health — Liveness probe for Railway / uptime monitors
 */
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

/**
 * GET /admin — Main embedded admin UI
 * Shopify opens this in an iframe inside the admin after OAuth.
 */
app.get('/admin', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send('Missing shop parameter');

  const session = await prisma.shopSession.findFirst({ where: { shop } });
  if (!session) {
    return res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
  }

  // Billing gate with Pattern 5 live verification fallback
  if (session.billingStatus !== 'ACTIVE') {
    // Race condition: merchant just approved but webhook not yet fired
    const isActive = await checkBillingStatus(shop, session.accessToken);
    if (isActive) {
      await prisma.shopSession.update({ where: { shop }, data: { billingStatus: 'ACTIVE' } });
      return sendAppHtml(res);
    }
    const billing = await createBillingSubscription(shop, session.accessToken);
    if (billing.confirmationUrl) {
      const url = billing.confirmationUrl;
      const apiKey = process.env.SHOPIFY_API_KEY;
      return res.send(`<!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <meta name="shopify-api-key" content="${apiKey}" />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
        <style>
          body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f6f6f7}
          .card{background:#fff;padding:2rem 2.5rem;border-radius:12px;text-align:center;max-width:420px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
          h2{margin:0 0 .75rem;font-size:1.25rem;color:#202223}
          p{margin:0 0 1.5rem;color:#6d7175;line-height:1.5}
          a{display:inline-block;background:#008060;color:#fff;padding:.75rem 1.5rem;border-radius:6px;text-decoration:none;font-weight:600;font-size:.9rem}
        </style>
      </head><body>
        <div class="card">
          <h2>Subscription required</h2>
          <p>Profit Tracker is $29/month. Start with a 7-day free trial — no charge until your trial ends.</p>
          <a href="${url}" target="_top">Start free trial &rarr;</a>
        </div>
      </body></html>`);
    }
    // Billing error fallthrough — serve app (don't block merchant indefinitely)
    return sendAppHtml(res);
  }

  sendAppHtml(res);
});

// Root redirect: if shop param present, go to /admin; else show install prompt
app.get('/', (req, res) => {
  const shop = req.query.shop;
  if (shop) return res.redirect(`/admin?shop=${encodeURIComponent(shop)}`);
  res.send(`<!DOCTYPE html>
<html><head><title>profit tracker</title></head>
<body style="font-family:sans-serif;padding:40px;text-align:center">
  <h1>profit tracker</h1>
  <p>Install this app from the Shopify App Store.</p>
</body></html>`);
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error({ message: err.message, stack: err.stack, shop: req.query.shop });
  res.status(500).send('Internal server error');
});

// Start 15-minute polling backstop for missed webhooks (SYNC-03)
// and 6-hour ad spend sync for all AdConnections (ADS-02).
// Must be called after all routes are mounted so it runs in production
startScheduler(prisma, syncIncrementalOrders, syncAdSpend);

// Start server with graceful shutdown
const server = app.listen(PORT, () => {
  console.log(`profit tracker server running on port ${PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received — shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
