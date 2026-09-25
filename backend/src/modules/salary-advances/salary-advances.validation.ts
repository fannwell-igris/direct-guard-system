import { ApiError } from "../../middleware/errorHandler";

export type SalaryAdvanceType = "CURRENT_PERIOD" | "LOAN";
const VALID_ADVANCE_TYPES: SalaryAdvanceType[] = ["CURRENT_PERIOD", "LOAN"];

export interface SalaryAdvanceCreateInput {
  employeeId: string;
  advanceDate: Date;
  amount: number;
  reason?: string | null;
  repaymentMonths: number;
  approvedBy?: string | null;
  notes?: string | null;
  advanceType: SalaryAdvanceType;
}

export interface SalaryAdvanceUpdateInput {
  reason?: string | null;
  approvedBy?: string | null;
  notes?: string | null;
  status?: string;
}

export interface SalaryAdvanceListQuery {
  employeeId?: string;
  status?: string;
  page: number;
  pageSize: number;
}

const VALID_STATUSES = ["ACTIVE", "FULLY_REPAID", "CANCELLED"];

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const t = v.trim();
  return t === "" ? null : t;
}

export function parseSalaryAdvanceCreate(body: unknown): SalaryAdvanceCreateInput {
  if (typeof body !== "object" || body === null)
    throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;

  const employeeId = typeof b.employeeId === "string" ? b.employeeId.trim() : "";
  if (!employeeId) throw ApiError.badRequest("`employeeId` is required.");

  if (!b.advanceDate) throw ApiError.badRequest("`advanceDate` is required.");
  const advanceDate = new Date(b.advanceDate as string);
  if (isNaN(advanceDate.getTime())) throw ApiError.badRequest("`advanceDate` must be a valid date.");

  const amount = Number(b.amount);
  if (isNaN(amount) || amount <= 0) throw ApiError.badRequest("`amount` must be a positive number.");

  // Defaults to CURRENT_PERIOD: an early payment of THIS period's wages,
  // auto-settled the moment payroll for that period is generated (see
  // payroll.service.ts). LOAN is the original multi-month, manually
  // repaid behavior.
  const advanceType = b.advanceType !== undefined ? (b.advanceType as string) : "CURRENT_PERIOD";
  if (!VALID_ADVANCE_TYPES.includes(advanceType as SalaryAdvanceType))
    throw ApiError.badRequest(`\`advanceType\` must be one of: ${VALID_ADVANCE_TYPES.join(", ")}.`);

  // CURRENT_PERIOD is always paid off in the one period it belongs to —
  // repaymentMonths is forced to 1 regardless of what was sent, so the
  // amount is never accidentally spread across future payroll runs.
  const repaymentMonths =
    advanceType === "CURRENT_PERIOD" ? 1 : Number(b.repaymentMonths);
  if (advanceType === "LOAN" && (!Number.isInteger(repaymentMonths) || repaymentMonths < 1))
    throw ApiError.badRequest("`repaymentMonths` must be a positive integer.");

  return {
    employeeId,
    advanceDate,
    amount,
    repaymentMonths,
    advanceType: advanceType as SalaryAdvanceType,
    reason: trimOrNull(b.reason) ?? null,
    approvedBy: trimOrNull(b.approvedBy) ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

export function parseSalaryAdvanceUpdate(body: unknown): SalaryAdvanceUpdateInput {
  if (typeof body !== "object" || body === null)
    throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;
  const out: SalaryAdvanceUpdateInput = {};

  if (b.reason !== undefined) out.reason = trimOrNull(b.reason);
  if (b.approvedBy !== undefined) out.approvedBy = trimOrNull(b.approvedBy);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);
  if (b.status !== undefined) {
    if (!VALID_STATUSES.includes(b.status as string))
      throw ApiError.badRequest(`\`status\` must be one of: ${VALID_STATUSES.join(", ")}.`);
    out.status = b.status as string;
  }

  if (Object.keys(out).length === 0)
    throw ApiError.badRequest("Request body must include at least one field to update.");
  return out;
}

export function parseAdvanceListQuery(query: Record<string, unknown>): SalaryAdvanceListQuery {
  const result: SalaryAdvanceListQuery = { page: 1, pageSize: 20 };

  if (query.employeeId !== undefined) {
    if (typeof query.employeeId !== "string" || !query.employeeId.trim())
      throw ApiError.badRequest("`employeeId` filter must be a non-empty string.");
    result.employeeId = query.employeeId.trim();
  }
  if (query.status !== undefined) {
    if (!VALID_STATUSES.includes(query.status as string))
      throw ApiError.badRequest(`\`status\` must be one of: ${VALID_STATUSES.join(", ")}.`);
    result.status = query.status as string;
  }
  if (query.page !== undefined) {
    const page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) throw ApiError.badRequest("`page` must be a positive integer.");
    result.page = page;
  }
  if (query.pageSize !== undefined) {
    const pageSize = Number(query.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
      throw ApiError.badRequest("`pageSize` must be between 1 and 100.");
    result.pageSize = pageSize;
  }
  return result;
}

// ---- repayment recording ----

export interface RepaymentInput {
  amount: number;
  notes?: string | null;
}

export function parseRepaymentInput(body: unknown): RepaymentInput {
  if (typeof body !== "object" || body === null)
    throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;

  const amount = Number(b.amount);
  if (isNaN(amount) || amount <= 0) throw ApiError.badRequest("`amount` must be a positive number.");

  return {
    amount,
    notes: trimOrNull(b.notes) ?? null,
  };
}
