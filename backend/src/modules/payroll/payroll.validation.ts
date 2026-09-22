import { ApiError } from "../../middleware/errorHandler";

// ---------- shared small parsers ----------

function parseRequiredId(v: unknown, fieldName: string): string {
  const id = typeof v === "string" ? v.trim() : "";
  if (!id) throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  return id;
}

function parseOptionalId(v: unknown, fieldName: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || !v.trim()) throw ApiError.badRequest(`\`${fieldName}\` must be a non-empty string.`);
  return v.trim();
}

function parseRequiredDate(v: unknown, fieldName: string): Date {
  if (v === undefined || v === null || v === "") {
    throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  }
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a valid date (e.g. "2026-09-01").`);
  }
  return d;
}

function parseOptionalString(v: unknown, fieldName: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw ApiError.badRequest(`\`${fieldName}\` must be a string.`);
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseRequiredAmount(v: unknown, fieldName: string): number {
  if (v === undefined || v === null || v === "") {
    throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  }
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a non-negative number.`);
  }
  return n;
}

function parseOptionalAmount(v: unknown, fieldName: string): number | undefined {
  if (v === undefined) return undefined;
  return parseRequiredAmount(v, fieldName);
}

// ---------- Shift-pay preview (Phase 4, unchanged) ----------

export interface ShiftPayPreviewQuery {
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
}

export function parseShiftPayPreviewQuery(query: Record<string, unknown>): ShiftPayPreviewQuery {
  const employeeId = parseRequiredId(query.employeeId, "employeeId");
  const periodStart = parseRequiredDate(query.periodStart, "periodStart");
  const periodEnd = parseRequiredDate(query.periodEnd, "periodEnd");

  if (periodEnd.getTime() < periodStart.getTime()) {
    throw ApiError.badRequest("`periodEnd` cannot be before `periodStart`.");
  }

  return { employeeId, periodStart, periodEnd };
}

// ---------- PayrollRun create ----------

export interface PayrollRunCreateInput {
  period: Date;
  clientId?: string;
  siteId?: string;
  createdBy?: string;
  notes?: string;
}

export function parsePayrollRunCreate(body: unknown): PayrollRunCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const period = parseRequiredDate(b.period, "period");

  return {
    period,
    clientId: parseOptionalId(b.clientId, "clientId"),
    siteId: parseOptionalId(b.siteId, "siteId"),
    createdBy: parseOptionalString(b.createdBy, "createdBy"),
    notes: parseOptionalString(b.notes, "notes"),
  };
}

// ---------- PayrollRun list ----------

const VALID_RUN_STATUSES = ["DRAFT", "REVIEWED", "FINALIZED", "PAID"];

export interface PayrollRunListQuery {
  status?: string;
  clientId?: string;
  siteId?: string;
}

export function parsePayrollRunListQuery(query: Record<string, unknown>): PayrollRunListQuery {
  const result: PayrollRunListQuery = {};

  if (query.status !== undefined) {
    if (typeof query.status !== "string" || !VALID_RUN_STATUSES.includes(query.status)) {
      throw ApiError.badRequest(`\`status\` filter must be one of: ${VALID_RUN_STATUSES.join(", ")}.`);
    }
    result.status = query.status;
  }
  if (typeof query.clientId === "string" && query.clientId.trim()) result.clientId = query.clientId.trim();
  if (typeof query.siteId === "string" && query.siteId.trim()) result.siteId = query.siteId.trim();

  return result;
}

// ---------- Line item update ----------

export interface LineItemUpdateInput {
  overtime?: number;
  bonuses?: number;
  advances?: number;
  otherAdjustments?: number;
  notes?: string;
}

export function parseLineItemUpdate(body: unknown): LineItemUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: LineItemUpdateInput = {};

  const overtime = parseOptionalAmount(b.overtime, "overtime");
  if (overtime !== undefined) out.overtime = overtime;
  const bonuses = parseOptionalAmount(b.bonuses, "bonuses");
  if (bonuses !== undefined) out.bonuses = bonuses;
  const advances = parseOptionalAmount(b.advances, "advances");
  if (advances !== undefined) out.advances = advances;
  const otherAdjustments = parseOptionalAmount(b.otherAdjustments, "otherAdjustments");
  if (otherAdjustments !== undefined) out.otherAdjustments = otherAdjustments;
  const notes = parseOptionalString(b.notes, "notes");
  if (notes !== undefined) out.notes = notes;

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

// ---------- Allowance / Deduction create ----------

export interface AllowanceCreateInput {
  allowanceTypeId: string;
  amount: number;
  notes?: string;
}

export function parseAllowanceCreate(body: unknown): AllowanceCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  return {
    allowanceTypeId: parseRequiredId(b.allowanceTypeId, "allowanceTypeId"),
    amount: parseRequiredAmount(b.amount, "amount"),
    notes: parseOptionalString(b.notes, "notes"),
  };
}

export interface DeductionCreateInput {
  deductionTypeId: string;
  amount: number;
  notes?: string;
}

export function parseDeductionCreate(body: unknown): DeductionCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  return {
    deductionTypeId: parseRequiredId(b.deductionTypeId, "deductionTypeId"),
    amount: parseRequiredAmount(b.amount, "amount"),
    notes: parseOptionalString(b.notes, "notes"),
  };
}

// ---------- Status actions (review / finalize / mark-paid) ----------

export interface StatusActionInput {
  performedBy: string;
  notes?: string;
}

export function parseStatusAction(body: unknown): StatusActionInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  return {
    performedBy: parseRequiredId(b.performedBy, "performedBy"),
    notes: parseOptionalString(b.notes, "notes"),
  };
}

// ---------- Statutory deductions (Phase 5b) ----------

export interface ApplyStatutoryDeductionsInput {
  performedBy?: string;
}

/** Validates the body for POST /runs/:id/apply-statutory-deductions. performedBy is optional here (audit-trail nicety, not required like the workflow actions) since this can be re-run freely and isn't itself a one-way transition. */
export function parseApplyStatutoryDeductions(body: unknown): ApplyStatutoryDeductionsInput {
  if (body === undefined || body === null) return {};
  if (typeof body !== "object") {
    throw ApiError.badRequest("Request body must be a JSON object if provided.");
  }
  const b = body as Record<string, unknown>;
  return {
    performedBy: b.performedBy !== undefined ? parseOptionalString(b.performedBy, "performedBy") : undefined,
  };
}
