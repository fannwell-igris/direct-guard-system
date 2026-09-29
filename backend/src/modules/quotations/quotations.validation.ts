import { ApiError } from "../../middleware/errorHandler";

export type QuotationStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";

// ─── Line item ─────────────────────────────────────────────────────────────────

export interface LineItem {
  description: string;
  amount: number;
}

// ─── Create / Update inputs ────────────────────────────────────────────────────

export interface QuotationCreateInput {
  customerName: string;
  customerLocation?: string | null;
  quotationDate: Date;
  validUntil?: Date | null;
  lineItems: LineItem[];
  discount?: number | null;
  /** Computed server-side: subtotal − discount */
  amount: number;
  preparedBy: string;
  notes?: string | null;
  /** If provided, overrides the running sequence for that year. */
  startingNumber?: number | null;
}

export interface QuotationUpdateInput {
  customerName?: string;
  customerLocation?: string | null;
  quotationDate?: Date;
  validUntil?: Date | null;
  lineItems?: LineItem[];
  discount?: number | null;
  amount?: number;
  notes?: string | null;
}

// ─── List query ────────────────────────────────────────────────────────────────

export interface QuotationListQuery {
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}

// ─── Small parse helpers ───────────────────────────────────────────────────────

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function parseRequiredString(v: unknown, fieldName: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  return s;
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

function parseOptionalDecimal(v: unknown, fieldName: string): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) throw ApiError.badRequest(`\`${fieldName}\` must be a number.`);
  if (n < 0) throw ApiError.badRequest(`\`${fieldName}\` cannot be negative.`);
  return n;
}

/**
 * Validates the `lineItems` array.
 * Each item must have a non-empty `description` and a non-negative `amount`.
 * At least one line item is required.
 */
function parseLineItems(v: unknown): LineItem[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw ApiError.badRequest("`lineItems` must be a non-empty array.");
  }
  return v.map((item, i) => {
    if (typeof item !== "object" || item === null) {
      throw ApiError.badRequest(`lineItems[${i}] must be an object.`);
    }
    const obj = item as Record<string, unknown>;
    const description = typeof obj.description === "string" ? obj.description.trim() : "";
    if (!description) throw ApiError.badRequest(`lineItems[${i}].description is required.`);
    const amount = typeof obj.amount === "number" ? obj.amount : Number(obj.amount);
    if (Number.isNaN(amount) || amount < 0) {
      throw ApiError.badRequest(`lineItems[${i}].amount must be a non-negative number.`);
    }
    return { description, amount };
  });
}

// ─── Public validators ─────────────────────────────────────────────────────────

/**
 * Validates and normalises the body for POST /quotations.
 * `preparedBy` is NOT accepted from the client body — the controller injects
 * it from `req.user.fullName`.
 * `quotationNumber` is always auto-generated.
 */
export function parseQuotationCreate(
  body: unknown,
  preparedBy: string
): QuotationCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const customerName = parseRequiredString(b.customerName, "customerName");
  const customerLocation = trimOrNull(b.customerLocation) ?? null;
  const quotationDate = parseRequiredDate(b.quotationDate, "quotationDate");
  const validUntil = parseOptionalDate(b.validUntil, "validUntil");
  if (validUntil && validUntil.getTime() < quotationDate.getTime()) {
    throw ApiError.badRequest("`validUntil` cannot be before `quotationDate`.");
  }

  const lineItems = parseLineItems(b.lineItems);
  const discount = parseOptionalDecimal(b.discount, "discount");

  const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const amount = discount != null ? Math.max(0, subtotal - discount) : subtotal;

  let startingNumber: number | null = null;
  if (b.startingNumber !== undefined && b.startingNumber !== null && b.startingNumber !== "") {
    const n = Number(b.startingNumber);
    if (!Number.isInteger(n) || n < 1) {
      throw ApiError.badRequest("`startingNumber` must be a positive integer.");
    }
    startingNumber = n;
  }

  return {
    customerName,
    customerLocation,
    quotationDate,
    validUntil,
    lineItems,
    discount: discount ?? null,
    amount,
    preparedBy,
    notes: trimOrNull(b.notes) ?? null,
    startingNumber,
  };
}

/**
 * Validates and normalises the body for PUT /quotations/:id.
 * Status changes use the dedicated POST /:id/send, accept, reject, expire routes.
 */
export function parseQuotationUpdate(body: unknown): QuotationUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: QuotationUpdateInput = {};

  if (b.customerName !== undefined) {
    out.customerName = parseRequiredString(b.customerName, "customerName");
  }
  if (b.customerLocation !== undefined) out.customerLocation = trimOrNull(b.customerLocation);
  if (b.quotationDate !== undefined) out.quotationDate = parseRequiredDate(b.quotationDate, "quotationDate");
  if (b.validUntil !== undefined) out.validUntil = parseOptionalDate(b.validUntil, "validUntil");
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (b.lineItems !== undefined) {
    out.lineItems = parseLineItems(b.lineItems);
  }
  if (b.discount !== undefined) out.discount = parseOptionalDecimal(b.discount, "discount");

  // Recompute amount if line items or discount changed
  if (out.lineItems !== undefined) {
    const subtotal = out.lineItems.reduce((sum, li) => sum + li.amount, 0);
    const disc = out.discount !== undefined ? (out.discount ?? 0) : 0;
    out.amount = Math.max(0, subtotal - disc);
  } else if (out.discount !== undefined) {
    // discount changed but no new line items — amount will be recomputed in service
    out.amount = undefined;
  }

  if (out.quotationDate && out.validUntil && out.validUntil.getTime() < out.quotationDate.getTime()) {
    throw ApiError.badRequest("`validUntil` cannot be before `quotationDate`.");
  }

  const keys = Object.keys(out).filter((k) => out[k as keyof QuotationUpdateInput] !== undefined);
  if (keys.length === 0) {
    throw ApiError.badRequest(
      "Request body must include at least one field to update. To change status use POST /:id/send, /:id/accept, /:id/reject, or /:id/expire."
    );
  }
  return out;
}

const VALID_STATUSES: QuotationStatus[] = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];

export function parseListQuery(query: Record<string, unknown>): QuotationListQuery {
  const result: QuotationListQuery = { page: 1, pageSize: 20 };

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
