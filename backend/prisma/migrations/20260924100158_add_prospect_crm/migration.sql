-- CreateEnum
CREATE TYPE "ProspectStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'MEETING', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'NOT_INTERESTED');

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sent_alert_notifications" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sent_alert_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "location" TEXT,
    "potentialService" TEXT,
    "source" TEXT,
    "assignedToId" TEXT,
    "dateAdded" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastContactDate" TIMESTAMP(3),
    "nextFollowUpDate" TIMESTAMP(3),
    "stage" "ProspectStage" NOT NULL DEFAULT 'NEW',
    "opportunityValue" DECIMAL(12,2),
    "outcome" TEXT,
    "notes" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_stage_history" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "fromStage" "ProspectStage",
    "toStage" "ProspectStage" NOT NULL,
    "notes" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" TEXT,

    CONSTRAINT "prospect_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_userId_idx" ON "device_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sent_alert_notifications_category_referenceId_key" ON "sent_alert_notifications"("category", "referenceId");

-- CreateIndex
CREATE INDEX "prospects_assignedToId_idx" ON "prospects"("assignedToId");

-- CreateIndex
CREATE INDEX "prospects_stage_idx" ON "prospects"("stage");

-- CreateIndex
CREATE INDEX "prospects_nextFollowUpDate_idx" ON "prospects"("nextFollowUpDate");

-- CreateIndex
CREATE INDEX "prospect_stage_history_prospectId_idx" ON "prospect_stage_history"("prospectId");

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_stage_history" ADD CONSTRAINT "prospect_stage_history_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_stage_history" ADD CONSTRAINT "prospect_stage_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
