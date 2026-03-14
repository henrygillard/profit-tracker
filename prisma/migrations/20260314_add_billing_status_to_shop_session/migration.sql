-- Migration: add_billing_status_to_shop_session
-- Adds billingStatus and subscriptionId fields to ShopSession for Phase 4 billing gate

ALTER TABLE "shop_sessions"
  ADD COLUMN IF NOT EXISTS "billing_status" TEXT,
  ADD COLUMN IF NOT EXISTS "subscription_id" TEXT;
