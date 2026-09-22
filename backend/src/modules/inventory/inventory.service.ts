import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  InventoryItemCreateInput,
  InventoryItemUpdateInput,
  InventoryItemListQuery,
  StockMovementCreateInput,
  TakeHomeInput,
} from "./inventory.validation";

// ---- InventoryItem CRUD ----

export async function createInventoryItem(input: InventoryItemCreateInput) {
  await validateAssignmentFKs(input.assignedToEmployeeId, input.assignedToDepartmentId, input.assignedToSiteId);

  // Auto-set assignedAt if assignment provided and not explicitly set
  const data = {
    ...input,
    assignedAt:
      input.assignedAt !== undefined
        ? input.assignedAt
        : input.assignedToEmployeeId || input.assignedToDepartmentId || input.assignedToSiteId
        ? new Date()
        : null,
  };

  return prisma.inventoryItem.create({ data });
}

export async function listInventoryItems(query: InventoryItemListQuery) {
  const where: Prisma.InventoryItemWhereInput = {};
  if (query.itemType) where.itemType = query.itemType;
  if (query.status) where.status = query.status;
  if (query.category) where.category = { contains: query.category, mode: "insensitive" };
  if (query.assignedToEmployeeId) where.assignedToEmployeeId = query.assignedToEmployeeId;
  if (query.assignedToDepartmentId) where.assignedToDepartmentId = query.assignedToDepartmentId;
  if (query.assignedToSiteId) where.assignedToSiteId = query.assignedToSiteId;

  const [total, rows] = await Promise.all([
    prisma.inventoryItem.count({ where }),
    prisma.inventoryItem.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        assignedToEmployee: { select: { id: true, fullName: true, position: true } },
        assignedToDepartment: { select: { id: true, name: true } },
        assignedToSite: { select: { id: true, siteName: true } },
      },
    }),
  ]);

  return {
    data: rows,
    pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
  };
}

export async function getInventoryItemById(id: string) {
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      assignedToEmployee: { select: { id: true, fullName: true, position: true } },
      assignedToDepartment: { select: { id: true, name: true } },
      assignedToSite: { select: { id: true, siteName: true } },
      _count: { select: { stockMovements: true, takeHomeLogs: true } },
    },
  });
  if (!item) throw ApiError.notFound(`Inventory item ${id} not found.`);
  return item;
}

export async function updateInventoryItem(id: string, input: InventoryItemUpdateInput) {
  const existing = await prisma.inventoryItem.findUnique({ where: { id }, select: { id: true, takenHome: true } });
  if (!existing) throw ApiError.notFound(`Inventory item ${id} not found.`);

  await validateAssignmentFKs(input.assignedToEmployeeId, input.assignedToDepartmentId, input.assignedToSiteId);

  // Auto-set assignedAt when assignment changes and not explicitly supplied
  const data: typeof input & { assignedAt?: Date | null } = { ...input };
  if (
    (input.assignedToEmployeeId !== undefined || input.assignedToDepartmentId !== undefined || input.assignedToSiteId !== undefined) &&
    input.assignedAt === undefined
  ) {
    const hasAssignment = input.assignedToEmployeeId || input.assignedToDepartmentId || input.assignedToSiteId;
    data.assignedAt = hasAssignment ? new Date() : null;
  }

  return prisma.inventoryItem.update({ where: { id }, data });
}

// ---- Stock Movements ----

export async function addStockMovement(itemId: string, input: StockMovementCreateInput) {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: itemId },
    select: { id: true, quantity: true, itemType: true },
  });
  if (!item) throw ApiError.notFound(`Inventory item ${itemId} not found.`);

  // Calculate new quantity
  const isIncrease = input.movementType === "PURCHASE" || input.movementType === "ADJUSTMENT";
  const newQty = isIncrease ? item.quantity + input.quantity : item.quantity - input.quantity;

  if (newQty < 0) {
    throw ApiError.badRequest(
      `Insufficient quantity. Current stock: ${item.quantity}, requested: ${input.quantity}.`
    );
  }

  // Validate issue FKs
  if (input.issuedToEmployeeId) {
    const emp = await prisma.employee.findUnique({ where: { id: input.issuedToEmployeeId }, select: { id: true } });
    if (!emp) throw ApiError.badRequest(`Employee ${input.issuedToEmployeeId} does not exist.`);
  }
  if (input.issuedToDepartmentId) {
    const dept = await prisma.department.findUnique({ where: { id: input.issuedToDepartmentId }, select: { id: true } });
    if (!dept) throw ApiError.badRequest(`Department ${input.issuedToDepartmentId} does not exist.`);
  }

  return prisma.$transaction(async (tx) => {
    const movement = await tx.stockMovement.create({
      data: { inventoryItemId: itemId, ...input },
    });
    await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: newQty } });
    return movement;
  });
}

export async function listStockMovements(itemId: string) {
  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!item) throw ApiError.notFound(`Inventory item ${itemId} not found.`);

  return prisma.stockMovement.findMany({
    where: { inventoryItemId: itemId },
    orderBy: { movementDate: "desc" },
    include: {
      issuedToEmployee: { select: { id: true, fullName: true } },
      issuedToDepartment: { select: { id: true, name: true } },
    },
  });
}

// ---- Take-home ----

export async function markTakenHome(itemId: string, input: TakeHomeInput) {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: itemId },
    select: { id: true, canTakeHome: true, takenHome: true, assignedToEmployeeId: true },
  });
  if (!item) throw ApiError.notFound(`Inventory item ${itemId} not found.`);
  if (!item.canTakeHome) throw ApiError.badRequest(`Item ${itemId} is not permitted to be taken home.`);
  if (item.takenHome) throw ApiError.badRequest(`Item ${itemId} is already marked as taken home.`);
  if (!item.assignedToEmployeeId) throw ApiError.badRequest(`Item ${itemId} must be assigned to an employee before it can be taken home.`);

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { takenHome: true, takenHomeAt: now },
    });
    return tx.itemTakeHomeLog.create({
      data: {
        inventoryItemId: itemId,
        employeeId: item.assignedToEmployeeId,
        action: "TAKEN_HOME",
        actionDate: now,
        authorisedBy: input.authorisedBy,
        notes: input.notes,
      },
    });
  });
}

export async function markReturned(itemId: string, input: TakeHomeInput) {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: itemId },
    select: { id: true, takenHome: true, assignedToEmployeeId: true },
  });
  if (!item) throw ApiError.notFound(`Inventory item ${itemId} not found.`);
  if (!item.takenHome) throw ApiError.badRequest(`Item ${itemId} is not currently marked as taken home.`);

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { takenHome: false, takenHomeAt: null },
    });
    return tx.itemTakeHomeLog.create({
      data: {
        inventoryItemId: itemId,
        employeeId: item.assignedToEmployeeId,
        action: "RETURNED",
        actionDate: now,
        authorisedBy: input.authorisedBy,
        notes: input.notes,
      },
    });
  });
}

export async function getTakeHomeLog(itemId: string) {
  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!item) throw ApiError.notFound(`Inventory item ${itemId} not found.`);

  return prisma.itemTakeHomeLog.findMany({
    where: { inventoryItemId: itemId },
    orderBy: { actionDate: "desc" },
    include: { employee: { select: { id: true, fullName: true } } },
  });
}

// ---- helpers ----

async function validateAssignmentFKs(
  employeeId?: string | null,
  departmentId?: string | null,
  siteId?: string | null
) {
  if (employeeId) {
    const exists = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!exists) throw ApiError.badRequest(`Employee ${employeeId} does not exist.`);
  }
  if (departmentId) {
    const exists = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
    if (!exists) throw ApiError.badRequest(`Department ${departmentId} does not exist.`);
  }
  if (siteId) {
    const exists = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
    if (!exists) throw ApiError.badRequest(`Site ${siteId} does not exist.`);
  }
}
