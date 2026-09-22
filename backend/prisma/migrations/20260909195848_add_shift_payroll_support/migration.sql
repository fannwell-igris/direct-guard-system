-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'REVIEWED', 'FINALIZED', 'PAID');

-- CreateEnum
CREATE TYPE "PayrollPaymentStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "StatutoryRuleType" AS ENUM ('PERCENTAGE', 'FIXED', 'BRACKETED');

-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('SHIFT', 'MONTHLY');

-- CreateEnum
CREATE TYPE "RosterEntryStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- AlterTable
ALTER TABLE "employee_contracts" ADD COLUMN     "extraShiftRate" DECIMAL(12,2),
ADD COLUMN     "payType" "PayType" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "shiftRate" DECIMAL(12,2),
ALTER COLUMN "salary" DROP NOT NULL;

-- CreateTable
CREATE TABLE "allowance_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allowance_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deduction_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deduction_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statutory_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ruleType" "StatutoryRuleType" NOT NULL,
    "employeeRate" DECIMAL(9,6),
    "employerRate" DECIMAL(9,6),
    "config" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statutory_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT,
    "siteId" TEXT,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "totalGrossPay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalNetPay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "reviewedBy" TEXT,
    "finalizedBy" TEXT,
    "paidBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_line_items" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeContractId" TEXT,
    "fullNameSnapshot" TEXT NOT NULL,
    "positionSnapshot" TEXT,
    "basicSalary" DECIMAL(12,2) NOT NULL,
    "overtime" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonuses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherAdjustments" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAllowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grossPay" DECIMAL(12,2) NOT NULL,
    "netPay" DECIMAL(12,2) NOT NULL,
    "paymentStatus" "PayrollPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payType" "PayType",
    "shiftsScheduled" INTEGER,
    "shiftsCovered" INTEGER,
    "shiftsExtra" INTEGER,
    "shiftRate" DECIMAL(12,2),
    "extraShiftRate" DECIMAL(12,2),
    "normalShiftPay" DECIMAL(12,2),
    "extraShiftPay" DECIMAL(12,2),
    "notes" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_allowances" (
    "id" TEXT NOT NULL,
    "payrollLineItemId" TEXT NOT NULL,
    "allowanceTypeId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "payroll_allowances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_deductions" (
    "id" TEXT NOT NULL,
    "payrollLineItemId" TEXT NOT NULL,
    "deductionTypeId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "payroll_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_audit_logs" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" TEXT,

    CONSTRAINT "payroll_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_requirements" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "shiftTypeId" TEXT NOT NULL,
    "requiredOfficers" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "notes" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_entries" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftTypeId" TEXT NOT NULL,
    "status" "RosterEntryStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roster_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_line_items_payrollRunId_employeeId_key" ON "payroll_line_items"("payrollRunId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "shift_types_name_key" ON "shift_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "roster_entries_employeeId_siteId_date_shiftTypeId_key" ON "roster_entries"("employeeId", "siteId", "date", "shiftTypeId");

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_employeeContractId_fkey" FOREIGN KEY ("employeeContractId") REFERENCES "employee_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_allowances" ADD CONSTRAINT "payroll_allowances_payrollLineItemId_fkey" FOREIGN KEY ("payrollLineItemId") REFERENCES "payroll_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_allowances" ADD CONSTRAINT "payroll_allowances_allowanceTypeId_fkey" FOREIGN KEY ("allowanceTypeId") REFERENCES "allowance_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_payrollLineItemId_fkey" FOREIGN KEY ("payrollLineItemId") REFERENCES "payroll_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_deductionTypeId_fkey" FOREIGN KEY ("deductionTypeId") REFERENCES "deduction_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_audit_logs" ADD CONSTRAINT "payroll_audit_logs_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_requirements" ADD CONSTRAINT "site_requirements_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_requirements" ADD CONSTRAINT "site_requirements_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "shift_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "shift_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
