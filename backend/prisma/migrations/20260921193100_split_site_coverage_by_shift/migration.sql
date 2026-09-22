-- AlterTable: add shiftTypeId as nullable first so existing rows can be
-- backfilled before the NOT NULL constraint is applied.
ALTER TABLE "site_coverage" ADD COLUMN     "shiftTypeId" TEXT;

-- Backfill: every existing site_coverage row predates the shift split, so
-- it represented a single undifferentiated tick for the day. Point it at
-- whichever shift type is named 'Day' (the most likely original meaning);
-- if none is named exactly that, fall back to the first active shift type
-- by name so the backfill never fails even in a differently-named setup.
UPDATE "site_coverage"
SET "shiftTypeId" = (
  SELECT "id" FROM "shift_types"
  ORDER BY
    CASE WHEN "name" = 'Day' THEN 0 ELSE 1 END,
    "isActive" DESC,
    "name" ASC
  LIMIT 1
)
WHERE "shiftTypeId" IS NULL;

-- AlterTable: now safe to enforce NOT NULL.
ALTER TABLE "site_coverage" ALTER COLUMN "shiftTypeId" SET NOT NULL;

-- DropIndex
DROP INDEX "site_coverage_siteId_date_key";

-- CreateIndex
CREATE UNIQUE INDEX "site_coverage_siteId_date_shiftTypeId_key" ON "site_coverage"("siteId", "date", "shiftTypeId");

-- AddForeignKey
ALTER TABLE "site_coverage" ADD CONSTRAINT "site_coverage_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "shift_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
