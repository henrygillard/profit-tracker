// lib/syncAdSpend.js
// Pulls Meta Ads campaign spend from the Insights API and upserts into AdSpend table.
// Called by lib/scheduler.js every 6 hours for each AdConnection.
// Phase 9 will add a Google branch to this same function (platform switch).

'use strict';

const { prisma } = require('./prisma');
const { decrypt } = require('./encrypt');

/**
 * syncAdSpend — fetches Meta Insights (per-campaign) for the last 90 days
 * and upserts AdSpend rows idempotently.
 *
 * @param {string} shop  — myshopify domain
 * @param {string} platform — 'meta' (only supported value in Phase 8)
 */
async function syncAdSpend(shop, platform) {
  if (platform !== 'meta') {
    throw new Error(`syncAdSpend: unsupported platform "${platform}"`);
  }

  const conn = await prisma.adConnection.findFirst({
    where: { shop, platform },
  });
  if (!conn) return; // no connection for this shop+platform

  const token = decrypt(conn.encryptedToken);
  const accountId = conn.accountId; // numeric part, without "act_" prefix

  // Sync last 90 days to keep cache warm for date-range queries
  const until = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 90);
  const since = sinceDate.toISOString().slice(0, 10);

  const campaigns = await fetchCampaignSpend(accountId, token, since, until, shop, platform);

  for (const row of campaigns) {
    // date_start is the campaign-period start date (YYYY-MM-DD string from Meta)
    // Without daily breakdowns, one row per campaign covers the full requested range
    const dayDate = new Date(row.date_start || since);
    await prisma.adSpend.upsert({
      where: {
        shop_platform_date_campaignId: {
          shop, platform, date: dayDate, campaignId: row.campaign_id,
        },
      },
      create: {
        shop,
        platform,
        date: dayDate,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        spend: parseFloat(row.spend || '0'),
      },
      update: {
        campaignName: row.campaign_name,
        spend: parseFloat(row.spend || '0'),
        syncedAt: new Date(),
      },
    });
  }
}

/**
 * fetchCampaignSpend — fetches per-campaign spend from Meta Insights API
 * with pagination (follows paging.next until null).
 *
 * Error code 190 (invalid/expired token): logs and returns empty results (no throw).
 * Other Meta API errors: throws so the scheduler catches and logs.
 *
 * @param {string} accountId — numeric ad account id (without 'act_' prefix)
 * @param {string} token — plaintext Meta access token
 * @param {string} since — YYYY-MM-DD
 * @param {string} until — YYYY-MM-DD
 * @param {string} shop — for logging
 * @param {string} platform — for logging
 * @returns {Promise<Array>} campaign spend rows
 */
async function fetchCampaignSpend(accountId, token, since, until, shop, platform) {
  const results = [];
  let url = [
    `https://graph.facebook.com/v21.0/act_${accountId}/insights`,
    `?fields=campaign_id,campaign_name,spend,date_start`,
    `&level=campaign`,
    `&time_range=${JSON.stringify({ since, until })}`,
    `&access_token=${token}`,
  ].join('');

  while (url) {
    const res = await fetch(url);
    const body = await res.json();
    if (body.error) {
      if (body.error.code === 190) {
        // Token expired or invalid — log and return what we have (do NOT throw)
        console.error(
          `syncAdSpend: token expired for ${shop}/${platform} (error 190) — reconnect needed`
        );
        return results;
      }
      throw new Error(`Meta API error: ${body.error.message}`);
    }
    results.push(...(body.data || []));
    url = body.paging?.next || null;
  }
  return results;
}

module.exports = { syncAdSpend };
