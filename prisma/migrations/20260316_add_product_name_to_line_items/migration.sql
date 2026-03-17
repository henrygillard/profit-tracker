-- Migration: add_product_name_to_line_items
-- Adds product_name column to line_items for display in Products by Margin table

ALTER TABLE "line_items"
  ADD COLUMN IF NOT EXISTS "product_name" TEXT;
