import { ApiError } from "../../middleware/errorHandler";

export interface InvoiceCreateInput {
  clientId: string;
  siteId?: string | null;
  invoiceDate: Date;
  billingPeriod?: string | null;
  dueDate: Date;
  amount: number;
  notes?: string | null;
}

export interface InvoiceUpdateInput {
  siteId?: string | null;
  invoiceDate?: Date;
  billingPeriod?: string | null;
  dueDate?: Date;
  amount?: number;
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

function parseRequiredDate(v: unknown, fieldName: string): Date {
  if (v === undefined || v === null || v === "") {
    throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  }
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a valid date (e.g. "2026-09-30").`);
  }
  return d;
}

function parseAmount(v: unknown, fieldName: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (v === undefined || v === null || v === "" || Number.isNaN(n)) {
    throw ApiError.badRequest(`\`${fieldName}\` is required and must be a number.`);
  }
  if (n <= 0) throw ApiError.badRequest(`\`${fieldName}\` must be greater than zero.`);
  return n;
}

/**
 * Validates and normalizes the body for POST /invoices.
 * `invoiceNumber` is never accepted — always auto-generated server-side.
 * `status`/`amountPaid`/`outstandingBalance` are never accepted either —
 * status starts DRAFT and the two amounts are always derived from Payments.
 */
export function parseInvoiceCreate(body: unknown): InvoiceCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const clientId = parseRequiredId(b.clientId, "clientId");
  const siteId = b.siteId !== undefined ? trimOrNull(b.siteId) : null;
  const invoiceDate = parseRequiredDate(b.invoiceDate, "invoiceDate");
  const dueDate = parseRequiredDate(b.dueDate, "dueDate");
  if (dueDate.getTime() < invoiceDate.getTime()) {
    throw ApiError.badRequest("`dueDate` cannot be before `invoiceDate`.");
  }
  const amount = parseAmount(b.amount, "amount");

  return {
    clientId,
    siteId: siteId ?? null,
    invoiceDate,
    billingPeriod: trimOrNull(b.billingPeriod) ?? null,
    dueDate,
    amount,
    notes: trimOrNull(b.notes) ?? null,
  };
}

/**
 * Validates and normalizes the body for PUT /invoices/:id.
 * status is never editable here — only via POST /:id/issue or /:id/cancel.
 * amountPaid/outstandingBalance are never editable — always derived.
 */
export function parseInvoiceUpdate(body: unknown): InvoiceUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: InvoiceUpdateInput = {};

  if (b.siteId !== undefined) out.siteId = trimOrNull(b.siteId);
  if (b.invoiceDate !== undefined) out.invoiceDate = parseRequiredDate(b.invoiceDate, "invoiceDate");
  if (b.billingPeriod !== undefined) out.billingPeriod = trimOrNull(b.billingPeriod);
  if (b.dueDate !== undefined) out.dueDate = parseRequiredDate(b.dueDate, "dueDate");
  if (b.amount !== undefined) out.amount = parseAmount(b.amount, "amount");
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (out.invoiceDate && out.dueDate && out.dueDate.getTime() < out.invoiceDate.getTime()) {
    throw ApiError.badRequest("`dueDate` cannot be before `invoiceDate`.");
  }

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest(
      "Request body must include at least one field to update. To change status, use POST /:id/issue or /:id/cancel."
    );
  }
  return out;
}

export interface InvoiceListQuery {
  clientId?: string;
  siteId?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}

const VALID_STATUSES = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"];

export function parseListQuery(query: Record<string, unknown>): InvoiceListQuery {
  const result: InvoiceListQuery = { page: 1, pageSize: 20 };

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

  if (query.status !== undefined) {
    if (typeof query.status !== "string" || !VALID_STATUSES.includes(query.status)) {
      throw ApiError.badRequest(`\`status\` must be one of: ${VALID_STATUSES.join(", ")}.`);
    }
    result.status = query.status;
  }

  if (query.dateFrom !== undefined) result.dateFrom = parseRequiredDate(query.dateFrom, "dateFrom");
  if (query.dateTo !== undefined) result.dateTo = parseRequiredDate(query.dateTo, "dateTo");
  if (result.dateFrom && result.dateTo && result.dateTo.getTime() < result.dateFrom.getTime()) {
    throw ApiError.badRequest("`dateTo` cannot be before `dateFrom`.");
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
