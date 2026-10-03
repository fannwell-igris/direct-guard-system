-- CreateEnum
CREATE TYPE "SiteShiftConfig" AS ENUM ('DAY_ONLY', 'NIGHT_ONLY', 'BOTH');

-- AlterTable
ALTER TABLE "sites" ADD COLUMN "activeShifts" "SiteShiftConfig" NOT NULL DEFAULT 'BOTH';
