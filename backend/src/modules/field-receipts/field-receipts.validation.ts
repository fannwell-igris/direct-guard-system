import { ApiError } from "../../middleware/errorHandler";

export type FieldReceiptStatus = "PENDING" | "RECONCILED" | "DISCREPANCY";
const VALID_STATUSES: FieldReceiptStatus[] = ["PENDING", "RECONCILED", "DISCREPANCY"];

export interface FieldReceiptCreateInput {
  referenceNumber: string;
  amount: number;
  date: Date;
  purpose?: string | null;
  siteId?: string | null;
  recordedBy?: string | null;
  notes?: string | null;
}

export interface FieldReceiptReconcileInput {
  status: FieldReceiptStatus;
  reconciledBy: string;
  reconciliationNotes?: string | null;
}

export interface FieldReceiptListQuery {
  status?: FieldReceiptStatus;
  siteId?: string;
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

export function parseFieldReceiptCreate(body: unknown): FieldReceiptCreateInput {
  if (typeof body !== "object" || body === null)
    throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;

  const referenceNumber = typeof b.referenceNumber === "string" ? b.referenceNumber.trim() : "";
  if (!referenceNumber) throw ApiError.badRequest("`referenceNumber` is required.");

  const amount = Number(b.amount);
  if (isNaN(amount) || amount <= 0) throw ApiError.badRequest("`amount` must be a positive number.");

  if (!b.date) throw ApiError.badRequest("`date` is required.");
  const date = new Date(b.date as string);
  if (isNaN(date.getTime())) throw ApiError.badRequest("`date` must be a valid date.");

  return {
    referenceNumber,
    amount,
    date,
    purpose: trimOrNull(b.purpose) ?? null,
    siteId: trimOrNull(b.siteId) ?? null,
    recordedBy: trimOrNull(b.recordedBy) ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

export function parseFieldReceiptReconcile(body: unknown): FieldReceiptReconcileInput {
  if (typeof body !== "object" || body === null)
    throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;

  if (!VALID_STATUSES.includes(b.status as FieldReceiptStatus) || b.status === "PENDING")
    throw ApiError.badRequest("`status` must be RECONCILED or DISCREPANCY.");

  const reconciledBy = typeof b.reconciledBy === "string" ? b.reconciledBy.trim() : "";
  if (!reconciledBy) throw ApiError.badRequest("`reconciledBy` is required.");

  return {
    status: b.status as FieldReceiptStatus,
    reconciledBy,
    reconciliationNotes: trimOrNull(b.reconciliationNotes) ?? null,
  };
}

export function parseFieldReceiptListQuery(query: Record<string, unknown>): FieldReceiptListQuery {
  const result: FieldReceiptListQuery = { page: 1, pageSize: 20 };

  if (query.status !== undefined) {
    if (!VALID_STATUSES.includes(query.status as FieldReceiptStatus))
      throw ApiError.badRequest(`\`status\` must be one of: ${VALID_STATUSES.join(", ")}.`);
    result.status = query.status as FieldReceiptStatus;
  }
  if (query.siteId !== undefined) {
    if (typeof query.siteId !== "string" || !query.siteId.trim())
      throw ApiError.badRequest("`siteId` filter must be a non-empty string.");
    result.siteId = query.siteId.trim();
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
