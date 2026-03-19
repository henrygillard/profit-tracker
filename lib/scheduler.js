// lib/scheduler.js
// 15-minute polling backstop for missed webhooks (SYNC-03).
// Initialized once at server startup — see server.js.
const cron = require('node-cron');

/**
 * startScheduler — registers cron jobs for:
 *   1. Incremental order sync — every 15 minutes for every installed shop
 *   2. Ad spend sync (optional) — every 6 hours for every AdConnection
 *
 * Errors from individual shop/connection syncs are caught and logged so a
 * single failing shop does not abort the run for all others.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Function} syncFn — async (shop, accessToken) => void
 * @param {Function} [syncAdSpendFn] — async (shop, platform) => void (optional)
 */
function startScheduler(prisma, syncFn, syncAdSpendFn) {
  // Runs at :00, :15, :30, :45 of every hour
  cron.schedule('*/15 * * * *', async () => {
    let shops;
    try {
      shops = await prisma.shopSession.findMany({
        select: { shop: true, accessToken: true },
      });
    } catch (err) {
      console.error('Scheduler: failed to fetch shops:', err.message);
      return;
    }

    for (const { shop, accessToken } of shops) {
      try {
        await syncFn(shop, accessToken);
      } catch (err) {
        // Log but do not let one shop failure abort the rest
        console.error(`Scheduler: sync failed for ${shop}:`, err.message);
      }
    }
  }, { noOverlap: true }); // prevent overlap if sync takes > 15 min

  console.log('Scheduler: 15-minute order sync job registered');

  // Optional 6-hour ad spend sync job (registered only when syncAdSpendFn is provided)
  if (syncAdSpendFn) {
    cron.schedule('0 */6 * * *', async () => {
      let connections;
      try {
        connections = await prisma.adConnection.findMany({
          select: { shop: true, platform: true },
        });
      } catch (err) {
        console.error('Scheduler: failed to fetch ad connections:', err.message);
        return;
      }
      for (const { shop, platform } of connections) {
        try {
          await syncAdSpendFn(shop, platform);
        } catch (err) {
          console.error(`Scheduler: adSpend sync failed for ${shop}/${platform}:`, err.message);
        }
      }
    }, { noOverlap: true });
    console.log('Scheduler: 6-hour ad spend sync job registered');
  }
}

module.exports = { startScheduler };
