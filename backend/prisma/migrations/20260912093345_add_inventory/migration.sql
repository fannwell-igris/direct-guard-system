-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('ASSET', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'POOR', 'CONDEMNED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PURCHASE', 'ISSUE', 'WRITE_OFF', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TakeHomeAction" AS ENUM ('TAKEN_HOME', 'RETURNED');

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "itemType" "ItemType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unitOfMeasure" TEXT,
    "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
    "serialNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchasePrice" DECIMAL(12,2),
    "assignedToEmployeeId" TEXT,
    "assignedToDepartmentId" TEXT,
    "assignedToSiteId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "canTakeHome" BOOLEAN NOT NULL DEFAULT false,
    "takenHome" BOOLEAN NOT NULL DEFAULT false,
    "takenHomeAt" TIMESTAMP(3),
    "notes" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "issuedToDepartmentId" TEXT,
    "issuedToEmployeeId" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "recordedBy" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_take_home_logs" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "employeeId" TEXT,
    "action" "TakeHomeAction" NOT NULL,
    "actionDate" TIMESTAMP(3) NOT NULL,
    "authorisedBy" TEXT,
    "notes" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_take_home_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_assignedToEmployeeId_fkey" FOREIGN KEY ("assignedToEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_assignedToDepartmentId_fkey" FOREIGN KEY ("assignedToDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_assignedToSiteId_fkey" FOREIGN KEY ("assignedToSiteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_issuedToDepartmentId_fkey" FOREIGN KEY ("issuedToDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_issuedToEmployeeId_fkey" FOREIGN KEY ("issuedToEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_take_home_logs" ADD CONSTRAINT "item_take_home_logs_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_take_home_logs" ADD CONSTRAINT "item_take_home_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
