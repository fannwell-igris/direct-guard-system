import { ItemType, ItemCondition, MovementType, RecordStatus } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

// ---- shared ----

const VALID_ITEM_TYPES: ItemType[] = ["ASSET", "CONSUMABLE"];
const VALID_CONDITIONS: ItemCondition[] = ["NEW", "GOOD", "FAIR", "POOR", "CONDEMNED"];
const VALID_MOVEMENT_TYPES: MovementType[] = ["PURCHASE", "ISSUE", "WRITE_OFF", "ADJUSTMENT"];
const VALID_STATUSES: RecordStatus[] = ["ACTIVE", "INACTIVE", "ARCHIVED"];

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const t = v.trim();
  return t === "" ? null : t;
}

function parseOptionalDate(v: unknown, field: string): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest(`\`${field}\` must be a valid date.`);
  return d;
}

function parseOptionalPositiveDecimal(v: unknown, field: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) throw ApiError.badRequest(`\`${field}\` must be a non-negative number.`);
  return n;
}

// ---- InventoryItem create ----

export interface InventoryItemCreateInput {
  name: string;
  category: string;
  itemType: ItemType;
  quantity: number;
  unitOfMeasure?: string | null;
  condition?: ItemCondition;
  serialNumber?: string | null;
  purchaseDate?: Date | null;
  purchasePrice?: number | null;
  assignedToEmployeeId?: string | null;
  assignedToDepartmentId?: string | null;
  assignedToSiteId?: string | null;
  assignedAt?: Date | null;
  canTakeHome?: boolean;
  notes?: string | null;
}

export function parseInventoryItemCreate(body: unknown): InventoryItemCreateInput {
  if (typeof body !== "object" || body === null) throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) throw ApiError.badRequest("`name` is required.");

  const category = typeof b.category === "string" ? b.category.trim() : "";
  if (!category) throw ApiError.badRequest("`category` is required.");

  if (!VALID_ITEM_TYPES.includes(b.itemType as ItemType)) {
    throw ApiError.badRequest(`\`itemType\` must be one of: ${VALID_ITEM_TYPES.join(", ")}.`);
  }

  const quantity = b.quantity !== undefined ? Number(b.quantity) : 0;
  if (!Number.isInteger(quantity) || quantity < 0) throw ApiError.badRequest("`quantity` must be a non-negative integer.");

  let condition: ItemCondition | undefined;
  if (b.condition !== undefined) {
    if (!VALID_CONDITIONS.includes(b.condition as ItemCondition)) {
      throw ApiError.badRequest(`\`condition\` must be one of: ${VALID_CONDITIONS.join(", ")}.`);
    }
    condition = b.condition as ItemCondition;
  }

  let canTakeHome: boolean | undefined;
  if (b.canTakeHome !== undefined) {
    if (typeof b.canTakeHome !== "boolean") throw ApiError.badRequest("`canTakeHome` must be a boolean.");
    canTakeHome = b.canTakeHome;
  }

  return {
    name,
    category,
    itemType: b.itemType as ItemType,
    quantity,
    condition,
    canTakeHome,
    unitOfMeasure: trimOrNull(b.unitOfMeasure) ?? null,
    serialNumber: trimOrNull(b.serialNumber) ?? null,
    purchaseDate: parseOptionalDate(b.purchaseDate, "purchaseDate") ?? null,
    purchasePrice: parseOptionalPositiveDecimal(b.purchasePrice, "purchasePrice") ?? null,
    assignedToEmployeeId: trimOrNull(b.assignedToEmployeeId) ?? null,
    assignedToDepartmentId: trimOrNull(b.assignedToDepartmentId) ?? null,
    assignedToSiteId: trimOrNull(b.assignedToSiteId) ?? null,
    assignedAt: parseOptionalDate(b.assignedAt, "assignedAt") ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

// ---- InventoryItem update ----

export interface InventoryItemUpdateInput {
  name?: string;
  category?: string;
  unitOfMeasure?: string | null;
  condition?: ItemCondition;
  serialNumber?: string | null;
  purchaseDate?: Date | null;
  purchasePrice?: number | null;
  assignedToEmployeeId?: string | null;
  assignedToDepartmentId?: string | null;
  assignedToSiteId?: string | null;
  assignedAt?: Date | null;
  canTakeHome?: boolean;
  notes?: string | null;
  status?: RecordStatus;
}

export function parseInventoryItemUpdate(body: unknown): InventoryItemUpdateInput {
  if (typeof body !== "object" || body === null) throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;
  const out: InventoryItemUpdateInput = {};

  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) throw ApiError.badRequest("`name` cannot be empty.");
    out.name = name;
  }
  if (b.category !== undefined) {
    const category = typeof b.category === "string" ? b.category.trim() : "";
    if (!category) throw ApiError.badRequest("`category` cannot be empty.");
    out.category = category;
  }
  if (b.condition !== undefined) {
    if (!VALID_CONDITIONS.includes(b.condition as ItemCondition)) {
      throw ApiError.badRequest(`\`condition\` must be one of: ${VALID_CONDITIONS.join(", ")}.`);
    }
    out.condition = b.condition as ItemCondition;
  }
  if (b.status !== undefined) {
    if (!VALID_STATUSES.includes(b.status as RecordStatus)) {
      throw ApiError.badRequest(`\`status\` must be one of: ${VALID_STATUSES.join(", ")}.`);
    }
    out.status = b.status as RecordStatus;
  }
  if (b.canTakeHome !== undefined) {
    if (typeof b.canTakeHome !== "boolean") throw ApiError.badRequest("`canTakeHome` must be a boolean.");
    out.canTakeHome = b.canTakeHome;
  }
  if (b.unitOfMeasure !== undefined) out.unitOfMeasure = trimOrNull(b.unitOfMeasure);
  if (b.serialNumber !== undefined) out.serialNumber = trimOrNull(b.serialNumber);
  if (b.purchaseDate !== undefined) out.purchaseDate = parseOptionalDate(b.purchaseDate, "purchaseDate");
  if (b.purchasePrice !== undefined) out.purchasePrice = parseOptionalPositiveDecimal(b.purchasePrice, "purchasePrice");
  if (b.assignedToEmployeeId !== undefined) out.assignedToEmployeeId = trimOrNull(b.assignedToEmployeeId);
  if (b.assignedToDepartmentId !== undefined) out.assignedToDepartmentId = trimOrNull(b.assignedToDepartmentId);
  if (b.assignedToSiteId !== undefined) out.assignedToSiteId = trimOrNull(b.assignedToSiteId);
  if (b.assignedAt !== undefined) out.assignedAt = parseOptionalDate(b.assignedAt, "assignedAt");
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (Object.keys(out).length === 0) throw ApiError.badRequest("Request body must include at least one field to update.");
  return out;
}

// ---- InventoryItem list ----

export interface InventoryItemListQuery {
  itemType?: ItemType;
  category?: string;
  status?: RecordStatus;
  assignedToEmployeeId?: string;
  assignedToDepartmentId?: string;
  assignedToSiteId?: string;
  page: number;
  pageSize: number;
}

export function parseItemListQuery(query: Record<string, unknown>): InventoryItemListQuery {
  const result: InventoryItemListQuery = { page: 1, pageSize: 20 };

  if (query.itemType !== undefined) {
    if (!VALID_ITEM_TYPES.includes(query.itemType as ItemType)) {
      throw ApiError.badRequest(`\`itemType\` must be one of: ${VALID_ITEM_TYPES.join(", ")}.`);
    }
    result.itemType = query.itemType as ItemType;
  }
  if (query.status !== undefined) {
    if (!VALID_STATUSES.includes(query.status as RecordStatus)) {
      throw ApiError.badRequest(`\`status\` must be one of: ${VALID_STATUSES.join(", ")}.`);
    }
    result.status = query.status as RecordStatus;
  }

  const strFilter = (key: string): string | undefined => {
    const v = query[key];
    if (v === undefined) return undefined;
    if (typeof v !== "string" || !v.trim()) throw ApiError.badRequest(`\`${key}\` filter must be a non-empty string.`);
    return v.trim();
  };

  const category = strFilter("category");
  if (category) result.category = category;
  const assignedToEmployeeId = strFilter("assignedToEmployeeId");
  if (assignedToEmployeeId) result.assignedToEmployeeId = assignedToEmployeeId;
  const assignedToDepartmentId = strFilter("assignedToDepartmentId");
  if (assignedToDepartmentId) result.assignedToDepartmentId = assignedToDepartmentId;
  const assignedToSiteId = strFilter("assignedToSiteId");
  if (assignedToSiteId) result.assignedToSiteId = assignedToSiteId;

  if (query.page !== undefined) {
    const page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) throw ApiError.badRequest("`page` must be a positive integer.");
    result.page = page;
  }
  if (query.pageSize !== undefined) {
    const pageSize = Number(query.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw ApiError.badRequest("`pageSize` must be an integer between 1 and 100.");
    }
    result.pageSize = pageSize;
  }

  return result;
}

// ---- StockMovement ----

export interface StockMovementCreateInput {
  movementType: MovementType;
  quantity: number;
  movementDate: Date;
  issuedToDepartmentId?: string | null;
  issuedToEmployeeId?: string | null;
  reference?: string | null;
  notes?: string | null;
  recordedBy?: string | null;
}

export function parseStockMovementCreate(body: unknown): StockMovementCreateInput {
  if (typeof body !== "object" || body === null) throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;

  if (!VALID_MOVEMENT_TYPES.includes(b.movementType as MovementType)) {
    throw ApiError.badRequest(`\`movementType\` must be one of: ${VALID_MOVEMENT_TYPES.join(", ")}.`);
  }

  const quantity = Number(b.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) throw ApiError.badRequest("`quantity` must be a positive integer.");

  if (b.movementDate === undefined || b.movementDate === null) throw ApiError.badRequest("`movementDate` is required.");
  const movementDate = new Date(b.movementDate as string);
  if (Number.isNaN(movementDate.getTime())) throw ApiError.badRequest("`movementDate` must be a valid date.");

  return {
    movementType: b.movementType as MovementType,
    quantity,
    movementDate,
    issuedToDepartmentId: trimOrNull(b.issuedToDepartmentId) ?? null,
    issuedToEmployeeId: trimOrNull(b.issuedToEmployeeId) ?? null,
    reference: trimOrNull(b.reference) ?? null,
    notes: trimOrNull(b.notes) ?? null,
    recordedBy: trimOrNull(b.recordedBy) ?? null,
  };
}

// ---- TakeHome ----

export interface TakeHomeInput {
  authorisedBy?: string | null;
  notes?: string | null;
}

export function parseTakeHomeInput(body: unknown): TakeHomeInput {
  if (typeof body !== "object" || body === null) throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;
  return {
    authorisedBy: trimOrNull(b.authorisedBy) ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}
