// Validation helpers for the Inventory module.
// No external library — plain object parsing matching the project pattern.

export type ItemType = "ASSET" | "CONSUMABLE";
export type ItemCondition = "NEW" | "GOOD" | "FAIR" | "POOR" | "CONDEMNED";
export type MovementType = "PURCHASE" | "ISSUE" | "WRITE_OFF" | "ADJUSTMENT" | "RETURN_PENDING" | "RETURN_CONFIRMED";
export type RecordStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

const ITEM_TYPES: ItemType[] = ["ASSET", "CONSUMABLE"];
const CONDITIONS: ItemCondition[] = ["NEW", "GOOD", "FAIR", "POOR", "CONDEMNED"];
// RETURN_PENDING and RETURN_CONFIRMED are system-only — they are logged
// automatically by the termination trigger, never entered via the UI form.
const MOVEMENT_TYPES: MovementType[] = ["PURCHASE", "ISSUE", "WRITE_OFF", "ADJUSTMENT"];
const ALL_MOVEMENT_TYPES: MovementType[] = [...MOVEMENT_TYPES, "RETURN_PENDING", "RETURN_CONFIRMED"];

// ── Create / Update ──────────────────────────────────────────────────────────

export interface InventoryItemCreateInput {
  name: string;
  category: string;
  itemType: ItemType;
  quantity?: number;
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

export interface InventoryItemUpdateInput {
  name?: string;
  category?: string;
  itemType?: ItemType;
  quantity?: number;
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
  takenHome?: boolean;
  takenHomeAt?: Date | null;
  notes?: string | null;
}

export interface StockMovementInput {
  movementType: MovementType;
  quantity: number;
  movementDate: Date;
  issuedToEmployeeId?: string | null;
  issuedToDepartmentId?: string | null;
  reference?: string | null;
  notes?: string | null;
  recordedBy?: string | null;
}

export interface InventoryListQuery {
  itemType?: ItemType;
  category?: string;
  status?: RecordStatus;
  page: number;
  pageSize: number;
}

// ── Parsers ──────────────────────────────────────────────────────────────────

function str(val: unknown, field: string): string {
  if (typeof val !== "string" || !val.trim())
    throw new Error(`\`${field}\` is required and must be a non-empty string.`);
  return val.trim();
}

function optStr(val: unknown): string | null {
  return typeof val === "string" && val.trim() ? val.trim() : null;
}

function optDate(val: unknown, field: string): Date | null {
  if (val === undefined || val === null || val === "") return null;
  const d = new Date(val as string);
  if (isNaN(d.getTime())) throw new Error(`\`${field}\` must be a valid date.`);
  return d;
}

function optDecimal(val: unknown, field: string): number | null {
  if (val === undefined || val === null || val === "") return null;
  const n = Number(val);
  if (isNaN(n) || n < 0) throw new Error(`\`${field}\` must be a non-negative number.`);
  return n;
}

export function parseItemCreate(body: Record<string, unknown>): InventoryItemCreateInput {
  const name     = str(body.name, "name");
  const category = str(body.category, "category");
  const itemType = str(body.itemType, "itemType") as ItemType;
  if (!ITEM_TYPES.includes(itemType))
    throw new Error(`\`itemType\` must be one of: ${ITEM_TYPES.join(", ")}.`);

  const quantity = body.quantity !== undefined ? Number(body.quantity) : 0;
  if (isNaN(quantity) || quantity < 0)
    throw new Error("`quantity` must be a non-negative integer.");

  const condition = body.condition ? str(body.condition, "condition") as ItemCondition : "GOOD";
  if (!CONDITIONS.includes(condition))
    throw new Error(`\`condition\` must be one of: ${CONDITIONS.join(", ")}.`);

  return {
    name, category, itemType,
    quantity,
    unitOfMeasure:          optStr(body.unitOfMeasure),
    condition,
    serialNumber:           optStr(body.serialNumber),
    purchaseDate:           optDate(body.purchaseDate, "purchaseDate"),
    purchasePrice:          optDecimal(body.purchasePrice, "purchasePrice"),
    assignedToEmployeeId:   optStr(body.assignedToEmployeeId),
    assignedToDepartmentId: optStr(body.assignedToDepartmentId),
    assignedToSiteId:       optStr(body.assignedToSiteId),
    assignedAt:             optDate(body.assignedAt, "assignedAt"),
    canTakeHome:            body.canTakeHome === true || body.canTakeHome === "true",
    notes:                  optStr(body.notes),
  };
}

export function parseItemUpdate(body: Record<string, unknown>): InventoryItemUpdateInput {
  const out: InventoryItemUpdateInput = {};
  if (body.name        !== undefined) out.name        = str(body.name, "name");
  if (body.category    !== undefined) out.category    = str(body.category, "category");
  if (body.itemType    !== undefined) {
    const it = str(body.itemType, "itemType") as ItemType;
    if (!ITEM_TYPES.includes(it)) throw new Error(`\`itemType\` must be one of: ${ITEM_TYPES.join(", ")}.`);
    out.itemType = it;
  }
  if (body.quantity !== undefined) {
    const q = Number(body.quantity);
    if (isNaN(q) || q < 0) throw new Error("`quantity` must be a non-negative integer.");
    out.quantity = q;
  }
  if (body.condition !== undefined) {
    const c = str(body.condition, "condition") as ItemCondition;
    if (!CONDITIONS.includes(c)) throw new Error(`\`condition\` must be one of: ${CONDITIONS.join(", ")}.`);
    out.condition = c;
  }
  if ("unitOfMeasure"          in body) out.unitOfMeasure          = optStr(body.unitOfMeasure);
  if ("serialNumber"           in body) out.serialNumber           = optStr(body.serialNumber);
  if ("purchaseDate"           in body) out.purchaseDate           = optDate(body.purchaseDate, "purchaseDate");
  if ("purchasePrice"          in body) out.purchasePrice          = optDecimal(body.purchasePrice, "purchasePrice");
  if ("assignedToEmployeeId"   in body) out.assignedToEmployeeId   = optStr(body.assignedToEmployeeId);
  if ("assignedToDepartmentId" in body) out.assignedToDepartmentId = optStr(body.assignedToDepartmentId);
  if ("assignedToSiteId"       in body) out.assignedToSiteId       = optStr(body.assignedToSiteId);
  if ("assignedAt"             in body) out.assignedAt             = optDate(body.assignedAt, "assignedAt");
  if ("canTakeHome"            in body) out.canTakeHome            = body.canTakeHome === true || body.canTakeHome === "true";
  if ("takenHome"              in body) out.takenHome              = body.takenHome   === true || body.takenHome   === "true";
  if ("takenHomeAt"            in body) out.takenHomeAt            = optDate(body.takenHomeAt, "takenHomeAt");
  if ("notes"                  in body) out.notes                  = optStr(body.notes);
  return out;
}

export function parseMovement(body: Record<string, unknown>): StockMovementInput {
  const movementType = str(body.movementType, "movementType") as MovementType;
  // Accept all types when parsing (system types like RETURN_PENDING are
  // logged programmatically; MOVEMENT_TYPES is the user-facing subset)
  if (!ALL_MOVEMENT_TYPES.includes(movementType))
    throw new Error(`\`movementType\` must be one of: ${MOVEMENT_TYPES.join(", ")}.`);

  const quantity = Number(body.quantity);
  if (isNaN(quantity) || quantity <= 0)
    throw new Error("`quantity` must be a positive integer.");

  const movementDate = optDate(body.movementDate, "movementDate") ?? new Date();

  return {
    movementType,
    quantity,
    movementDate,
    issuedToEmployeeId:   optStr(body.issuedToEmployeeId),
    issuedToDepartmentId: optStr(body.issuedToDepartmentId),
    reference:            optStr(body.reference),
    notes:                optStr(body.notes),
    recordedBy:           optStr(body.recordedBy),
  };
}

export function parseListQuery(q: Record<string, unknown>): InventoryListQuery {
  const page     = Math.max(1, parseInt(String(q.page     ?? "1"),  10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(q.pageSize ?? "50"), 10) || 50));
  const itemType = q.itemType && ITEM_TYPES.includes(q.itemType as ItemType)
    ? q.itemType as ItemType : undefined;
  return {
    itemType,
    category: optStr(q.category) ?? undefined,
    status:   (q.status as RecordStatus) ?? undefined,
    page,
    pageSize,
  };
}
