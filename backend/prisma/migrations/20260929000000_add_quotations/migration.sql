-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "quotations" (
    "id"              TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "clientId"        TEXT NOT NULL,
    "siteId"          TEXT,
    "quotationDate"   TIMESTAMP(3) NOT NULL,
    "validUntil"      TIMESTAMP(3),
    "billingPeriod"   TEXT,
    "amount"          DECIMAL(12,2) NOT NULL,
    "status"          "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes"           TEXT,
    "dateCreated"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quotationNumber_key" ON "quotations"("quotationNumber");
CREATE INDEX "quotations_clientId_idx"  ON "quotations"("clientId");
CREATE INDEX "quotations_siteId_idx"    ON "quotations"("siteId");
CREATE INDEX "quotations_status_idx"    ON "quotations"("status");

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quotations" ADD CONSTRAINT "quotations_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
