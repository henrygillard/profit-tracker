-- Migration: add_margin_alert_threshold
-- Adds margin_alert_threshold column to shop_configs with default 20
ALTER TABLE "shop_configs" ADD COLUMN "margin_alert_threshold" DECIMAL(6,2) NOT NULL DEFAULT 20;
