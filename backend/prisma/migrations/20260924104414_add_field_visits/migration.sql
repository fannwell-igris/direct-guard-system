-- CreateEnum
CREATE TYPE "MarketingActivityType" AS ENUM ('EMAIL', 'CALL', 'WHATSAPP', 'VISIT', 'MEETING', 'FOLLOW_UP', 'PROPOSAL_SENT', 'QUOTATION_SENT', 'NEW_PROSPECT_IDENTIFIED', 'SOCIAL_MEDIA', 'CAMPAIGN', 'NETWORKING_EVENT', 'OTHER');

-- CreateTable
CREATE TABLE "marketing_activities" (
    "id" TEXT NOT NULL,
    "type" "MarketingActivityType" NOT NULL,
    "prospectId" TEXT,
    "clientId" TEXT,
    "purpose" TEXT,
    "outcome" TEXT,
    "nextAction" TEXT,
    "followUpDate" TIMESTAMP(3),
    "notes" TEXT,
    "activityDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedById" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_visits" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT,
    "clientId" TEXT,
    "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT,
    "personVisited" TEXT,
    "purpose" TEXT,
    "outcome" TEXT,
    "opportunitiesIdentified" TEXT,
    "nextAction" TEXT,
    "followUpDate" TIMESTAMP(3),
    "notes" TEXT,
    "attachmentFilename" TEXT,
    "marketerId" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_activities_prospectId_idx" ON "marketing_activities"("prospectId");

-- CreateIndex
CREATE INDEX "marketing_activities_clientId_idx" ON "marketing_activities"("clientId");

-- CreateIndex
CREATE INDEX "marketing_activities_performedById_idx" ON "marketing_activities"("performedById");

-- CreateIndex
CREATE INDEX "marketing_activities_activityDate_idx" ON "marketing_activities"("activityDate");

-- CreateIndex
CREATE INDEX "field_visits_prospectId_idx" ON "field_visits"("prospectId");

-- CreateIndex
CREATE INDEX "field_visits_clientId_idx" ON "field_visits"("clientId");

-- CreateIndex
CREATE INDEX "field_visits_marketerId_idx" ON "field_visits"("marketerId");

-- CreateIndex
CREATE INDEX "field_visits_visitDate_idx" ON "field_visits"("visitDate");

-- AddForeignKey
ALTER TABLE "marketing_activities" ADD CONSTRAINT "marketing_activities_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_activities" ADD CONSTRAINT "marketing_activities_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_activities" ADD CONSTRAINT "marketing_activities_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_marketerId_fkey" FOREIGN KEY ("marketerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
