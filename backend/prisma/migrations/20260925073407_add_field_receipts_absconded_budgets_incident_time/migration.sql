-- CreateEnum
CREATE TYPE "FieldReceiptStatus" AS ENUM ('PENDING', 'RECONCILED', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'RETURNED', 'REJECTED');

-- AlterEnum
ALTER TYPE "EmploymentStatus" ADD VALUE 'ABSCONDED';

-- AlterTable
ALTER TABLE "operations_records" ADD COLUMN     "incidentTime" TEXT;

-- CreateTable
CREATE TABLE "field_receipt_entries" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT,
    "siteId" TEXT,
    "recordedBy" TEXT,
    "status" "FieldReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "reconciledBy" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "reconciliationNotes" TEXT,
    "notes" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_receipt_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_budgets" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "preparedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "notes" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_budget_lines" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "plannedAmount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "department_budgets_departmentId_month_year_key" ON "department_budgets"("departmentId", "month", "year");

-- AddForeignKey
ALTER TABLE "field_receipt_entries" ADD CONSTRAINT "field_receipt_entries_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_budgets" ADD CONSTRAINT "department_budgets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_budget_lines" ADD CONSTRAINT "department_budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "department_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
