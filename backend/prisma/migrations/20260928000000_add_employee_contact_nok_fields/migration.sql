-- Add personal contact and next-of-kin fields to the employees table
-- All columns are nullable so existing rows are unaffected (no default needed).

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "email"                 TEXT,
  ADD COLUMN IF NOT EXISTS "address"               TEXT,
  ADD COLUMN IF NOT EXISTS "nextOfKinName"         TEXT,
  ADD COLUMN IF NOT EXISTS "nextOfKinRelationship" TEXT,
  ADD COLUMN IF NOT EXISTS "nextOfKinPhone"        TEXT;
