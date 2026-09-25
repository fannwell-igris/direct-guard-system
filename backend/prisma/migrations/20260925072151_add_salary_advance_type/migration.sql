-- CreateEnum
CREATE TYPE "SalaryAdvanceType" AS ENUM ('CURRENT_PERIOD', 'LOAN');

-- AlterTable
ALTER TABLE "salary_advances" ADD COLUMN     "advanceType" "SalaryAdvanceType" NOT NULL DEFAULT 'CURRENT_PERIOD',
ADD COLUMN     "settledInPayrollLineItemId" TEXT;

-- AddForeignKey
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_settledInPayrollLineItemId_fkey" FOREIGN KEY ("settledInPayrollLineItemId") REFERENCES "payroll_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
