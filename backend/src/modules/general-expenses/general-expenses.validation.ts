import { ApiError } from "../../middleware/errorHandler";

export interface GeneralExpenseCreateInput {
  expenseDate: Date;
  category: string;
  amount: number;
  description?: string | null;
  departmentId?: string | null;
  departmentRequestId?: string | null;
  paidBy?: string | null;
  approvedBy?: string | null;
  receiptReference?: string | null;
  notes?: string | null;
}

export interface GeneralExpenseUpdateInput {
  expenseDate?: Date;
  category?: string;
  amount?: number;
  description?: string | null;
  departmentId?: string | null;
  departmentRequestId?: string | null;
  paidBy?: string | null;
  approvedBy?: string | null;
  receiptReference?: string | null;
  notes?: string | null;
}

export interface GeneralExpenseListQuery {
  departmentId?: string;
  departmentRequestId?: string;
  category?: string;
  page: number;
  pageSize: number;
}

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const t = v.trim();
  return t === "" ? null : t;
}

function parseDate(v: unknown, fieldName: string): Date {
  if (v === undefined || v === null || v === "") throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest(`\`${fieldName}\` must be a valid date.`);
  return d;
}

function parseAmount(v: unknown): number {
  const n = Number(v);
  if (Number.isNaN(n) || n <= 0) throw ApiError.badRequest("`amount` must be a positive number.");
  return n;
}

export function parseGeneralExpenseCreate(body: unknown): GeneralExpenseCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const expenseDate = parseDate(b.expenseDate, "expenseDate");

  const category = typeof b.category === "string" ? b.category.trim() : "";
  if (!category) throw ApiError.badRequest("`category` is required.");

  if (b.amount === undefined || b.amount === null) throw ApiError.badRequest("`amount` is required.");
  const amount = parseAmount(b.amount);

  return {
    expenseDate,
    category,
    amount,
    description: trimOrNull(b.description) ?? null,
    departmentId: trimOrNull(b.departmentId) ?? null,
    departmentRequestId: trimOrNull(b.departmentRequestId) ?? null,
    paidBy: trimOrNull(b.paidBy) ?? null,
    approvedBy: trimOrNull(b.approvedBy) ?? null,
    receiptReference: trimOrNull(b.receiptReference) ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

export function parseGeneralExpenseUpdate(body: unknown): GeneralExpenseUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: GeneralExpenseUpdateInput = {};

  if (b.expenseDate !== undefined) out.expenseDate = parseDate(b.expenseDate, "expenseDate");
  if (b.amount !== undefined) out.amount = parseAmount(b.amount);

  if (b.category !== undefined) {
    const category = typeof b.category === "string" ? b.category.trim() : "";
    if (!category) throw ApiError.badRequest("`category` cannot be empty.");
    out.category = category;
  }

  if (b.description !== undefined) out.description = trimOrNull(b.description);
  if (b.departmentId !== undefined) out.departmentId = trimOrNull(b.departmentId);
  if (b.departmentRequestId !== undefined) out.departmentRequestId = trimOrNull(b.departmentRequestId);
  if (b.paidBy !== undefined) out.paidBy = trimOrNull(b.paidBy);
  if (b.approvedBy !== undefined) out.approvedBy = trimOrNull(b.approvedBy);
  if (b.receiptReference !== undefined) out.receiptReference = trimOrNull(b.receiptReference);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }
  return out;
}

export function parseListQuery(query: Record<string, unknown>): GeneralExpenseListQuery {
  const result: GeneralExpenseListQuery = { page: 1, pageSize: 20 };

  const strFilter = (key: string): string | undefined => {
    const v = query[key];
    if (v === undefined) return undefined;
    if (typeof v !== "string" || !v.trim()) throw ApiError.badRequest(`\`${key}\` filter must be a non-empty string.`);
    return v.trim();
  };

  const departmentId = strFilter("departmentId");
  if (departmentId) result.departmentId = departmentId;
  const departmentRequestId = strFilter("departmentRequestId");
  if (departmentRequestId) result.departmentRequestId = departmentRequestId;
  const category = strFilter("category");
  if (category) result.category = category;

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
