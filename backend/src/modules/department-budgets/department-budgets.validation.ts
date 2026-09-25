import { BudgetStatus } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

export interface BudgetLineInput {
  category: string;
  plannedAmount: number;
  description?: string | null;
}

export interface BudgetCreateInput {
  departmentId: string;
  month: number;
  year: number;
  preparedBy?: string | null;
  notes?: string | null;
  lines: BudgetLineInput[];
}

export interface BudgetUpdateInput {
  preparedBy?: string | null;
  notes?: string | null;
  lines?: BudgetLineInput[];
}

const REVIEW_STATUSES: BudgetStatus[] = ["UNDER_REVIEW", "APPROVED", "RETURNED", "REJECTED"];

export interface BudgetReviewInput {
  status: BudgetStatus;
  reviewComment?: string | null;
}

export interface BudgetListQuery {
  departmentId?: string;
  month?: number;
  year?: number;
  status?: BudgetStatus;
  page: number;
  pageSize: number;
}

export interface BudgetSummaryQuery {
  month: number;
  year: number;
}

export interface BudgetCompareQuery {
  departmentId?: string;
  periods: { month: number; year: number }[];
}

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const t = v.trim();
  return t === "" ? null : t;
}

function parseMonth(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    throw ApiError.badRequest("`month` must be an integer between 1 and 12.");
  }
  return n;
}

function parseYear(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 2020 || n > 2100) {
    throw ApiError.badRequest("`year` must be a valid 4-digit year.");
  }
  return n;
}

function parseLines(v: unknown): BudgetLineInput[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw ApiError.badRequest("`lines` must be a non-empty array of budget line items.");
  }
  return v.map((raw, idx) => {
    if (typeof raw !== "object" || raw === null) {
      throw ApiError.badRequest(`lines[${idx}] must be an object.`);
    }
    const l = raw as Record<string, unknown>;
    const category = typeof l.category === "string" ? l.category.trim() : "";
    if (!category) throw ApiError.badRequest(`lines[${idx}].category is required.`);

    const plannedAmount = Number(l.plannedAmount);
    if (Number.isNaN(plannedAmount) || plannedAmount < 0) {
      throw ApiError.badRequest(`lines[${idx}].plannedAmount must be a non-negative number.`);
    }

    return {
      category,
      plannedAmount,
      description: trimOrNull(l.description) ?? null,
    };
  });
}

export function parseBudgetCreate(body: unknown): BudgetCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const departmentId = typeof b.departmentId === "string" ? b.departmentId.trim() : "";
  if (!departmentId) throw ApiError.badRequest("`departmentId` is required.");

  return {
    departmentId,
    month: parseMonth(b.month),
    year: parseYear(b.year),
    preparedBy: trimOrNull(b.preparedBy) ?? null,
    notes: trimOrNull(b.notes) ?? null,
    lines: parseLines(b.lines),
  };
}

export function parseBudgetUpdate(body: unknown): BudgetUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: BudgetUpdateInput = {};

  if (b.preparedBy !== undefined) out.preparedBy = trimOrNull(b.preparedBy);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);
  if (b.lines !== undefined) out.lines = parseLines(b.lines);

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }
  return out;
}

export function parseBudgetReview(body: unknown): BudgetReviewInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  if (!REVIEW_STATUSES.includes(b.status as BudgetStatus)) {
    throw ApiError.badRequest(`\`status\` must be one of: ${REVIEW_STATUSES.join(", ")}.`);
  }

  return {
    status: b.status as BudgetStatus,
    reviewComment: trimOrNull(b.reviewComment) ?? null,
  };
}

export function parseBudgetListQuery(query: Record<string, unknown>): BudgetListQuery {
  const result: BudgetListQuery = { page: 1, pageSize: 20 };

  if (query.departmentId !== undefined) {
    if (typeof query.departmentId !== "string" || !query.departmentId.trim()) {
      throw ApiError.badRequest("`departmentId` filter must be a non-empty string.");
    }
    result.departmentId = query.departmentId.trim();
  }
  if (query.month !== undefined) result.month = parseMonth(query.month);
  if (query.year !== undefined) result.year = parseYear(query.year);
  if (query.status !== undefined) {
    const all: BudgetStatus[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "RETURNED", "REJECTED"];
    if (!all.includes(query.status as BudgetStatus)) {
      throw ApiError.badRequest(`\`status\` must be one of: ${all.join(", ")}.`);
    }
    result.status = query.status as BudgetStatus;
  }
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

export function parseBudgetSummaryQuery(query: Record<string, unknown>): BudgetSummaryQuery {
  if (query.month === undefined || query.year === undefined) {
    throw ApiError.badRequest("`month` and `year` query parameters are required.");
  }
  return { month: parseMonth(query.month), year: parseYear(query.year) };
}

// Accepts ?periods=2026-09,2026-10,2026-11 (max 12 at once — a company
// comparison view has no reasonable use for more than a year at a time).
export function parseBudgetCompareQuery(query: Record<string, unknown>): BudgetCompareQuery {
  if (typeof query.periods !== "string" || !query.periods.trim()) {
    throw ApiError.badRequest("`periods` query parameter is required, e.g. periods=2026-09,2026-10,2026-11.");
  }
  const parts = query.periods.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 12) {
    throw ApiError.badRequest("`periods` must list between 1 and 12 YYYY-MM values.");
  }
  const periods = parts.map((p) => {
    const match = /^(\d{4})-(\d{1,2})$/.exec(p);
    if (!match) throw ApiError.badRequest(`Invalid period "${p}" — expected format YYYY-MM.`);
    const year = parseYear(match[1]);
    const month = parseMonth(match[2]);
    return { month, year };
  });

  let departmentId: string | undefined;
  if (query.departmentId !== undefined) {
    if (typeof query.departmentId !== "string" || !query.departmentId.trim()) {
      throw ApiError.badRequest("`departmentId` filter must be a non-empty string.");
    }
    departmentId = query.departmentId.trim();
  }

  return { departmentId, periods };
}
