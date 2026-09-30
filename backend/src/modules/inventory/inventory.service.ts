import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  InventoryItemCreateInput,
  InventoryItemUpdateInput,
  StockMovementInput,
  InventoryListQuery,
} from "./inventory.validation";

// ── Items ────────────────────────────────────────────────────────────────────

const ITEM_INCLUDE = {
  assignedToEmployee:   { select: { id: true, fullName: true } },
  assignedToDepartment: { select: { id: true, name: true } },
  assignedToSite:       { select: { id: true, siteName: true } },
} satisfies Prisma.InventoryItemInclude;

export async function createItem(input: InventoryItemCreateInput) {
  await validateAssignmentTargets(input);
  return prisma.inventoryItem.create({
    data: {
      name:                   input.name,
      category:               input.category,
      itemType:               input.itemType,
      quantity:               input.quantity ?? 0,
      unitOfMeasure:          input.unitOfMeasure ?? null,
      condition:              input.condition ?? "GOOD",
      serialNumber:           input.serialNumber ?? null,
      purchaseDate:           input.purchaseDate ?? null,
      purchasePrice:          input.purchasePrice != null
        ? new Prisma.Decimal(input.purchasePrice) : null,
      assignedToEmployeeId:   input.assignedToEmployeeId   ?? null,
      assignedToDepartmentId: input.assignedToDepartmentId ?? null,
      assignedToSiteId:       input.assignedToSiteId       ?? null,
      assignedAt:             input.assignedAt ?? null,
      canTakeHome:            input.canTakeHome ?? false,
      notes:                  input.notes ?? null,
    },
    include: ITEM_INCLUDE,
  });
}

export async function listItems(query: InventoryListQuery) {
  const where: Prisma.InventoryItemWhereInput = {};
  if (query.itemType) where.itemType = query.itemType;
  if (query.category) where.category = { contains: query.category, mode: "insensitive" };
  if (query.status)   where.status   = query.status;

  const [total, rows] = await Promise.all([
    prisma.inventoryItem.count({ where }),
    prisma.inventoryItem.findMany({
      where,
      orderBy: { dateCreated: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: ITEM_INCLUDE,
    }),
  ]);

  return {
    data: rows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getItemById(id: string) {
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      ...ITEM_INCLUDE,
      stockMovements: {
        orderBy: { movementDate: "desc" },
        include: {
          issuedToEmployee:   { select: { id: true, fullName: true } },
          issuedToDepartment: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!item) throw ApiError.notFound(`Inventory item ${id} not found.`);
  return item;
}

export async function updateItem(id: string, input: InventoryItemUpdateInput) {
  await ensureItemExists(id);
  await validateAssignmentTargets(input);

  const data: Prisma.InventoryItemUpdateInput = { ...input };
  if (input.purchasePrice !== undefined) {
    data.purchasePrice = input.purchasePrice != null
      ? new Prisma.Decimal(input.purchasePrice) : null;
  }

  return prisma.inventoryItem.update({
    where: { id },
    data,
    include: ITEM_INCLUDE,
  });
}

export async function setItemStatus(id: string, status: "ACTIVE" | "INACTIVE" | "ARCHIVED") {
  await ensureItemExists(id);
  return prisma.inventoryItem.update({
    where: { id },
    data: { status },
    include: ITEM_INCLUDE,
  });
}

// ── Stock Movements ──────────────────────────────────────────────────────────

export async function listMovements(inventoryItemId: string) {
  await ensureItemExists(inventoryItemId);
  return prisma.stockMovement.findMany({
    where: { inventoryItemId },
    orderBy: { movementDate: "desc" },
    include: {
      issuedToEmployee:   { select: { id: true, fullName: true } },
      issuedToDepartment: { select: { id: true, name: true } },
    },
  });
}

/**
 * Log a stock movement and adjust the item's `quantity` accordingly.
 *   PURCHASE  → +quantity (stock received)
 *   ISSUE     → −quantity (stock given out to someone)
 *   WRITE_OFF → −quantity (damaged / lost)
 *   ADJUSTMENT → signed delta (supply correctionKey; use positive or
 *                negative `quantity` in the notes/reference; here we
 *                always add, caller passes a negative number to subtract)
 *
 * For ISSUE movements the quantity is subtracted. If the resulting stock
 * would go below 0, we reject the request — can't issue more than you have.
 */
export async function logMovement(
  inventoryItemId: string,
  input: StockMovementInput,
  callerRole: string,
) {
  const item = await prisma.inventoryItem.findUnique({
    where: { id: inventoryItemId },
    select: { id: true, quantity: true, itemType: true },
  });
  if (!item) throw ApiError.notFound(`Inventory item ${inventoryItemId} not found.`);

  // Operations role: ISSUE only
  if (callerRole === "OPERATIONS" && input.movementType !== "ISSUE") {
    throw ApiError.forbidden(
      "Operations staff may only log ISSUE movements. " +
      "Contact Admin or Management to record purchases, write-offs, or adjustments.",
    );
  }

  let quantityDelta = input.quantity;
  if (input.movementType === "ISSUE" || input.movementType === "WRITE_OFF") {
    quantityDelta = -input.quantity;
  }

  const newQty = item.quantity + quantityDelta;
  if (newQty < 0) {
    throw ApiError.badRequest(
      `Cannot issue ${input.quantity} unit(s) — only ${item.quantity} in stock.`,
    );
  }

  // Validate issuance targets exist
  if (input.issuedToEmployeeId) {
    const emp = await prisma.employee.findUnique({
      where: { id: input.issuedToEmployeeId },
      select: { id: true },
    });
    if (!emp) throw ApiError.badRequest(`Employee ${input.issuedToEmployeeId} does not exist.`);
  }
  if (input.issuedToDepartmentId) {
    const dept = await prisma.department.findUnique({
      where: { id: input.issuedToDepartmentId },
      select: { id: true },
    });
    if (!dept) throw ApiError.badRequest(`Department ${input.issuedToDepartmentId} does not exist.`);
  }

  const [movement] = await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        inventoryItemId,
        movementType:         input.movementType,
        quantity:             input.quantity,
        movementDate:         input.movementDate,
        issuedToEmployeeId:   input.issuedToEmployeeId   ?? null,
        issuedToDepartmentId: input.issuedToDepartmentId ?? null,
        reference:            input.reference   ?? null,
        notes:                input.notes       ?? null,
        recordedBy:           input.recordedBy  ?? null,
      },
      include: {
        issuedToEmployee:   { select: { id: true, fullName: true } },
        issuedToDepartment: { select: { id: true, name: true } },
      },
    }),
    prisma.inventoryItem.update({
      where: { id: inventoryItemId },
      data:  { quantity: newQty },
    }),
  ]);

  return movement;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ensureItemExists(id: string) {
  const exists = await prisma.inventoryItem.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.notFound(`Inventory item ${id} not found.`);
}

async function validateAssignmentTargets(input: {
  assignedToEmployeeId?:   string | null;
  assignedToDepartmentId?: string | null;
  assignedToSiteId?:       string | null;
}) {
  if (input.assignedToEmployeeId) {
    const emp = await prisma.employee.findUnique({
      where: { id: input.assignedToEmployeeId }, select: { id: true },
    });
    if (!emp) throw ApiError.badRequest(`Employee ${input.assignedToEmployeeId} does not exist.`);
  }
  if (input.assignedToDepartmentId) {
    const dept = await prisma.department.findUnique({
      where: { id: input.assignedToDepartmentId }, select: { id: true },
    });
    if (!dept) throw ApiError.badRequest(`Department ${input.assignedToDepartmentId} does not exist.`);
  }
  if (input.assignedToSiteId) {
    const site = await prisma.site.findUnique({
      where: { id: input.assignedToSiteId }, select: { id: true },
    });
    if (!site) throw ApiError.badRequest(`Site ${input.assignedToSiteId} does not exist.`);
  }
}
