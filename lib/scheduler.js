// lib/scheduler.js
// 15-minute polling backstop for missed webhooks (SYNC-03).
// Initialized once at server startup — see server.js.
const cron = require('node-cron');

/**
 * startScheduler — registers a cron job that runs incremental order sync
 * for every installed shop every 15 minutes.
 *
 * Errors from individual shop syncs are caught and logged so a single failing
 * shop does not abort the run for all other shops.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Function} syncFn — async (shop, accessToken) => void
 */
function startScheduler(prisma, syncFn) {
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
}

module.exports = { startScheduler };
