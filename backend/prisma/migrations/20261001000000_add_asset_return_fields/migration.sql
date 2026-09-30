-- CreateEnum
CREATE TYPE "AssetReturnStatus" AS ENUM ('PENDING_COLLECTION', 'COLLECTED');

-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'RETURN_PENDING';
ALTER TYPE "MovementType" ADD VALUE 'RETURN_CONFIRMED';

-- AlterTable
ALTER TABLE "inventory_items"
  ADD COLUMN "returnStatus"      "AssetReturnStatus",
  ADD COLUMN "returnTriggeredAt" TIMESTAMP(3),
  ADD COLUMN "returnTriggeredBy" TEXT,
  ADD COLUMN "returnConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "returnConfirmedBy" TEXT;