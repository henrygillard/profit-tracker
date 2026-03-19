// lib/syncAdSpend.js
// Pulls ad campaign spend from Meta Insights API and Google Ads GAQL API,
// upserts into AdSpend table. Called by lib/scheduler.js every 6 hours.

'use strict';

const { prisma } = require('./prisma');
const { decrypt } = require('./encrypt');

/**
 * syncAdSpend — fetches per-campaign spend for the last 90 days
 * and upserts AdSpend rows idempotently.
 *
 * @param {string} shop  — myshopify domain
 * @param {string} platform — 'meta' or 'google'
 */
async function syncAdSpend(shop, platform) {
  // Shared date range: last 90 days
  const until = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 90);
  const since = sinceDate.toISOString().slice(0, 10);

  if (platform === 'meta') {
    const conn = await prisma.adConnection.findFirst({
      where: { shop, platform },
    });
    if (!conn) return; // no connection for this shop+platform

    const token = decrypt(conn.encryptedToken);
    const accountId = conn.accountId; // numeric part, without "act_" prefix

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
  } else if (platform === 'google') {
    const conn = await prisma.adConnection.findFirst({
      where: { shop, platform: 'google' },
    });
    if (!conn) return; // no connection for this shop+platform

    const refreshToken = decrypt(conn.encryptedToken);
    const campaigns = await fetchGoogleCampaignSpend(conn.accountId, refreshToken, since, until, shop);

    for (const row of campaigns) {
      await prisma.adSpend.upsert({
        where: {
          shop_platform_date_campaignId: {
            shop, platform: 'google', date: new Date(since), campaignId: row.campaignId,
          },
        },
        create: { shop, platform: 'google', date: new Date(since), campaignId: row.campaignId, campaignName: row.campaignName, spend: row.spend },
        update: { campaignName: row.campaignName, spend: row.spend, syncedAt: new Date() },
      });
    }
  } else {
    throw new Error(`syncAdSpend: unsupported platform "${platform}"`);
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

/**
 * fetchGoogleCampaignSpend — fetches per-campaign spend from Google Ads GAQL API
 * with pagination (follows nextPageToken until null).
 *
 * invalid_grant or 401: deletes AdConnection and returns [] (no throw).
 * Other errors: throws so the scheduler catches and logs.
 *
 * @param {string} customerId — Google Ads customer ID (numeric)
 * @param {string} refreshToken — plaintext Google refresh token
 * @param {string} since — YYYY-MM-DD
 * @param {string} until — YYYY-MM-DD
 * @param {string} shop — for logging and DB deletion on auth failure
 * @returns {Promise<Array>} campaign spend rows with { campaignId, campaignName, spend }
 */
async function fetchGoogleCampaignSpend(customerId, refreshToken, since, until, shop) {
  const { OAuth2Client } = require('google-auth-library');
  const client = new OAuth2Client(
    process.env.GOOGLE_ADS_CLIENT_ID,
    process.env.GOOGLE_ADS_CLIENT_SECRET
  );
  client.setCredentials({ refresh_token: refreshToken });

  let accessToken;
  try {
    const { token } = await client.getAccessToken();
    accessToken = token;
  } catch (err) {
    if (err.message?.includes('invalid_grant') || err.response?.status === 401) {
      console.error(`syncAdSpend: Google refresh token revoked for ${shop} — deleting connection`);
      await prisma.adConnection.deleteMany({ where: { shop, platform: 'google' } });
      return [];
    }
    throw err;
  }

  const results = [];
  let pageToken = null;
  const query = `SELECT campaign.id, campaign.name, metrics.cost_micros
    FROM campaign
    WHERE segments.date >= '${since}' AND segments.date <= '${until}'
      AND metrics.cost_micros > 0`;

  do {
    const body = pageToken ? { query, pageToken } : { query };
    const res = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:search`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();

    if (res.status === 401) {
      console.error(`syncAdSpend: Google API 401 for ${shop} — deleting connection`);
      await prisma.adConnection.deleteMany({ where: { shop, platform: 'google' } });
      return [];
    }
    if (res.status && res.status >= 400) throw new Error(`Google Ads API error: ${JSON.stringify(data)}`);

    for (const row of data.results || []) {
      results.push({
        campaignId: row.campaign.id,
        campaignName: row.campaign.name,
        // int64 → string in JSON; parse before dividing
        spend: parseInt(row.metrics.costMicros || '0') / 1_000_000,
      });
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return results;
}

module.exports = { syncAdSpend };
