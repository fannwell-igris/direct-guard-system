import { ApiError } from "../../middleware/errorHandler";

export interface OperationalCostCreateInput {
  clientId: string;
  siteId: string;
  month: Date;
  costCategory: string;
  amount: number;
  description?: string | null;
  notes?: string | null;
}

export interface OperationalCostUpdateInput {
  clientId?: string;
  siteId?: string;
  month?: Date;
  costCategory?: string;
  amount?: number;
  description?: string | null;
  notes?: string | null;
}

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function parseRequiredId(v: unknown, fieldName: string): string {
  const id = typeof v === "string" ? v.trim() : "";
  if (!id) throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  return id;
}

function parseRequiredString(v: unknown, fieldName: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  return s;
}

/** Parses a month input down to the 1st of that month (schema stores `month` as the 1st day). */
function parseMonth(v: unknown, fieldName: string): Date {
  if (v === undefined || v === null || v === "") {
    throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  }
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a valid date (e.g. "2026-09-01").`);
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function parseAmount(v: unknown, fieldName: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (v === undefined || v === null || v === "" || Number.isNaN(n)) {
    throw ApiError.badRequest(`\`${fieldName}\` is required and must be a number.`);
  }
  if (n <= 0) {
    throw ApiError.badRequest(`\`${fieldName}\` must be greater than zero.`);
  }
  return n;
}

export function parseOperationalCostCreate(body: unknown): OperationalCostCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  return {
    clientId: parseRequiredId(b.clientId, "clientId"),
    siteId: parseRequiredId(b.siteId, "siteId"),
    month: parseMonth(b.month, "month"),
    costCategory: parseRequiredString(b.costCategory, "costCategory"),
    amount: parseAmount(b.amount, "amount"),
    description: trimOrNull(b.description) ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

export function parseOperationalCostUpdate(body: unknown): OperationalCostUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: OperationalCostUpdateInput = {};

  if (b.clientId !== undefined) out.clientId = parseRequiredId(b.clientId, "clientId");
  if (b.siteId !== undefined) out.siteId = parseRequiredId(b.siteId, "siteId");
  if (b.month !== undefined) out.month = parseMonth(b.month, "month");
  if (b.costCategory !== undefined) out.costCategory = parseRequiredString(b.costCategory, "costCategory");
  if (b.amount !== undefined) out.amount = parseAmount(b.amount, "amount");
  if (b.description !== undefined) out.description = trimOrNull(b.description);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }
  return out;
}

export interface OperationalCostListQuery {
  clientId?: string;
  siteId?: string;
  costCategory?: string;
  monthFrom?: Date;
  monthTo?: Date;
  page: number;
  pageSize: number;
}

export function parseListQuery(query: Record<string, unknown>): OperationalCostListQuery {
  const result: OperationalCostListQuery = { page: 1, pageSize: 20 };

  const strFilter = (key: string): string | undefined => {
    const v = query[key];
    if (v === undefined) return undefined;
    if (typeof v !== "string" || v.trim() === "") {
      throw ApiError.badRequest(`\`${key}\` filter must be a non-empty string.`);
    }
    return v.trim();
  };

  const clientId = strFilter("clientId");
  if (clientId) result.clientId = clientId;
  const siteId = strFilter("siteId");
  if (siteId) result.siteId = siteId;
  const costCategory = strFilter("costCategory");
  if (costCategory) result.costCategory = costCategory;

  if (query.monthFrom !== undefined) result.monthFrom = parseMonth(query.monthFrom, "monthFrom");
  if (query.monthTo !== undefined) result.monthTo = parseMonth(query.monthTo, "monthTo");
  if (result.monthFrom && result.monthTo && result.monthTo.getTime() < result.monthFrom.getTime()) {
    throw ApiError.badRequest("`monthTo` cannot be before `monthFrom`.");
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
