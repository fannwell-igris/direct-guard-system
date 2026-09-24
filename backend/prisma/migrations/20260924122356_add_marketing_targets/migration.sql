-- CreateTable
CREATE TABLE "marketing_targets" (
    "id" TEXT NOT NULL,
    "marketerId" TEXT,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "targetNewProspects" INTEGER,
    "targetActivities" INTEGER,
    "targetVisits" INTEGER,
    "targetConversions" INTEGER,
    "notes" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_targets_marketerId_idx" ON "marketing_targets"("marketerId");

-- CreateIndex
CREATE INDEX "marketing_targets_periodYear_periodMonth_idx" ON "marketing_targets"("periodYear", "periodMonth");

-- AddForeignKey
ALTER TABLE "marketing_targets" ADD CONSTRAINT "marketing_targets_marketerId_fkey" FOREIGN KEY ("marketerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
