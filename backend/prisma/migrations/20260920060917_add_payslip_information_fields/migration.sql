/*
  Warnings:

  - A unique constraint covering the columns `[employeeNumber]` on the table `employees` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "employeeNumber" TEXT;

-- AlterTable
ALTER TABLE "payslip_records" ADD COLUMN     "allowanceBreakdown" JSONB,
ADD COLUMN     "contractStartDate" TIMESTAMP(3),
ADD COLUMN     "employeeNumber" TEXT,
ADD COLUMN     "leaveDaysTaken" INTEGER,
ADD COLUMN     "napsaEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nhimaEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nrcNumber" TEXT,
ADD COLUMN     "overtime" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalEmployerContributions" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeNumber_key" ON "employees"("employeeNumber");
