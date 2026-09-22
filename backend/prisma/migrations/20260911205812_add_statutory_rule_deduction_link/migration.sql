/*
  Warnings:

  - Added the required column `deductionTypeId` to the `statutory_rules` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "payroll_deductions" ADD COLUMN     "isStatutory" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "statutory_rules" ADD COLUMN     "deductionTypeId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "statutory_rules" ADD CONSTRAINT "statutory_rules_deductionTypeId_fkey" FOREIGN KEY ("deductionTypeId") REFERENCES "deduction_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
