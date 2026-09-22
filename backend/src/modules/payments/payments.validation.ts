import { ApiError } from "../../middleware/errorHandler";

export interface PaymentCreateInput {
  paymentDate: Date;
  amount: number;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface PaymentUpdateInput {
  paymentDate?: Date;
  amount?: number;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
}

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
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
 * Validates and normalizes the body for POST /invoices/:id/payments.
 * `clientId` is never accepted — always snapshotted from the invoice.
 */
export function parsePaymentCreate(body: unknown): PaymentCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  return {
    paymentDate: parseRequiredDate(b.paymentDate, "paymentDate"),
    amount: parseAmount(b.amount, "amount"),
    paymentMethod: trimOrNull(b.paymentMethod) ?? null,
    reference: trimOrNull(b.reference) ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

export function parsePaymentUpdate(body: unknown): PaymentUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: PaymentUpdateInput = {};

  if (b.paymentDate !== undefined) out.paymentDate = parseRequiredDate(b.paymentDate, "paymentDate");
  if (b.amount !== undefined) out.amount = parseAmount(b.amount, "amount");
  if (b.paymentMethod !== undefined) out.paymentMethod = trimOrNull(b.paymentMethod);
  if (b.reference !== undefined) out.reference = trimOrNull(b.reference);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }
  return out;
}
