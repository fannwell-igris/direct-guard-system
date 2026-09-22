-- CreateEnum
CREATE TYPE "OperationsReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE', 'APPROVED_ABSENCE', 'REPLACEMENT', 'EXTRA_SHIFT', 'OTHER');

-- CreateTable
CREATE TABLE "operations_records" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftTypeId" TEXT NOT NULL,
    "siteIssues" TEXT,
    "incidents" TEXT,
    "operationalReport" TEXT,
    "notes" TEXT,
    "submittedBy" TEXT,
    "reviewStatus" "OperationsReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operations_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "operationsRecordId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "rosterEntryId" TEXT,
    "status" "AttendanceStatus" NOT NULL,
    "replacementForEmployeeId" TEXT,
    "notes" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operations_records_siteId_date_shiftTypeId_key" ON "operations_records"("siteId", "date", "shiftTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_operationsRecordId_employeeId_key" ON "attendance_records"("operationsRecordId", "employeeId");

-- AddForeignKey
ALTER TABLE "operations_records" ADD CONSTRAINT "operations_records_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations_records" ADD CONSTRAINT "operations_records_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations_records" ADD CONSTRAINT "operations_records_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "shift_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_operationsRecordId_fkey" FOREIGN KEY ("operationsRecordId") REFERENCES "operations_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_rosterEntryId_fkey" FOREIGN KEY ("rosterEntryId") REFERENCES "roster_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_replacementForEmployeeId_fkey" FOREIGN KEY ("replacementForEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
