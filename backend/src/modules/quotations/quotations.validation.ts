import { ApiError } from "../../middleware/errorHandler";

export type QuotationStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export interface QuotationCreateInput {
  clientId: string;
  siteId?: string | null;
  quotationDate: Date;
  validUntil?: Date | null;
  billingPeriod?: string | null;
  amount: number;
  notes?: string | null;
  /** If provided, uses this number; otherwise auto-generates from sequence. */
  startingNumber?: number | null;
}

export interface QuotationUpdateInput {
  siteId?: string | null;
  quotationDate?: Date;
  validUntil?: Date | null;
  billingPeriod?: string | null;
  amount?: number;
  notes?: string | null;
}

export interface QuotationListQuery {
  clientId?: string;
  siteId?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
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

function parseOptionalDate(v: unknown, fieldName: string): Date | null {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a valid date (e.g. "2026-12-31").`);
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
 * Validates and normalises the body for POST /quotations.
 * `quotationNumber` is never accepted from the client — always auto-generated.
 * `startingNumber` is optional; if provided it overrides the running sequence
 * for that year (and future ones will continue from there).
 */
export function parseQuotationCreate(body: unknown): QuotationCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const clientId = parseRequiredId(b.clientId, "clientId");
  const siteId = b.siteId !== undefined ? trimOrNull(b.siteId) : null;
  const quotationDate = parseRequiredDate(b.quotationDate, "quotationDate");
  const validUntil = parseOptionalDate(b.validUntil, "validUntil");
  if (validUntil && validUntil.getTime() < quotationDate.getTime()) {
    throw ApiError.badRequest("`validUntil` cannot be before `quotationDate`.");
  }
  const amount = parseAmount(b.amount, "amount");

  let startingNumber: number | null = null;
  if (b.startingNumber !== undefined && b.startingNumber !== null && b.startingNumber !== "") {
    const n = Number(b.startingNumber);
    if (!Number.isInteger(n) || n < 1) {
      throw ApiError.badRequest("`startingNumber` must be a positive integer.");
    }
    startingNumber = n;
  }

  return {
    clientId,
    siteId: siteId ?? null,
    quotationDate,
    validUntil: validUntil ?? null,
    billingPeriod: trimOrNull(b.billingPeriod) ?? null,
    amount,
    notes: trimOrNull(b.notes) ?? null,
    startingNumber,
  };
}

/**
 * Validates and normalises the body for PUT /quotations/:id.
 * status is never editable here — only via POST /:id/send, /:id/accept,
 * /:id/reject, or /:id/expire.
 */
export function parseQuotationUpdate(body: unknown): QuotationUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: QuotationUpdateInput = {};

  if (b.siteId !== undefined) out.siteId = trimOrNull(b.siteId);
  if (b.quotationDate !== undefined) out.quotationDate = parseRequiredDate(b.quotationDate, "quotationDate");
  if (b.validUntil !== undefined) out.validUntil = parseOptionalDate(b.validUntil, "validUntil");
  if (b.billingPeriod !== undefined) out.billingPeriod = trimOrNull(b.billingPeriod);
  if (b.amount !== undefined) out.amount = parseAmount(b.amount, "amount");
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (out.quotationDate && out.validUntil && out.validUntil.getTime() < out.quotationDate.getTime()) {
    throw ApiError.badRequest("`validUntil` cannot be before `quotationDate`.");
  }

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest(
      "Request body must include at least one field to update. To change status, use POST /:id/send, /:id/accept, /:id/reject, or /:id/expire."
    );
  }
  return out;
}

const VALID_STATUSES: QuotationStatus[] = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];

export function parseListQuery(query: Record<string, unknown>): QuotationListQuery {
  const result: QuotationListQuery = { page: 1, pageSize: 20 };

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
    if (typeof query.status !== "string" || !(VALID_STATUSES as string[]).includes(query.status)) {
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
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
      throw ApiError.badRequest("`pageSize` must be an integer between 1 and 500.");
    }
    result.pageSize = pageSize;
  }

  return result;
}
