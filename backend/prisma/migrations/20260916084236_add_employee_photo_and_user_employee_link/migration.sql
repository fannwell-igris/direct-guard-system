/*
  Warnings:

  - You are about to drop the `permission_grants` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `permissions` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[employeeId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "permission_grants" DROP CONSTRAINT "permission_grants_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "permission_grants" DROP CONSTRAINT "permission_grants_permissionId_fkey";

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "photoFilename" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "employeeId" TEXT;

-- DropTable
DROP TABLE "permission_grants";

-- DropTable
DROP TABLE "permissions";

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
