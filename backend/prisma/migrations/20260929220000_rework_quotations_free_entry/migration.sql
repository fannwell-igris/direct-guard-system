-- Migration: rework quotations to free-entry (no client/site FK)
-- 2026-09-29

-- 1. Drop the FK constraints first
ALTER TABLE "quotations" DROP CONSTRAINT IF EXISTS "quotations_clientId_fkey";
ALTER TABLE "quotations" DROP CONSTRAINT IF EXISTS "quotations_siteId_fkey";

-- 2. Drop the old columns
ALTER TABLE "quotations" DROP COLUMN IF EXISTS "clientId";
ALTER TABLE "quotations" DROP COLUMN IF EXISTS "siteId";
ALTER TABLE "quotations" DROP COLUMN IF EXISTS "billingPeriod";

-- 3. Add new free-entry columns
ALTER TABLE "quotations" ADD COLUMN "customerName"     TEXT NOT NULL DEFAULT '';
ALTER TABLE "quotations" ADD COLUMN "customerLocation" TEXT;
ALTER TABLE "quotations" ADD COLUMN "lineItems"        JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "quotations" ADD COLUMN "discount"         DECIMAL(12,2);
ALTER TABLE "quotations" ADD COLUMN "preparedBy"       TEXT NOT NULL DEFAULT '';

-- 4. Drop old indexes that referenced the removed columns
DROP INDEX IF EXISTS "quotations_clientId_idx";
DROP INDEX IF EXISTS "quotations_siteId_idx";
