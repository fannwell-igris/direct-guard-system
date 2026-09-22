import { BillingFrequency } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

export interface ClientContractCreateInput {
  clientId: string;
  siteId?: string | null;
  startDate: Date;
  endDate: Date;
  amount: number;
  billingFrequency: BillingFrequency;
  notes?: string | null;
}

export interface ClientContractUpdateInput {
  clientId?: string;
  siteId?: string | null;
  startDate?: Date;
  endDate?: Date;
  amount?: number;
  billingFrequency?: BillingFrequency;
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
    throw ApiError.badRequest(`\`${fieldName}\` must be a valid date (e.g. "2026-01-31").`);
  }
  return d;
}

function parseOptionalDate(v: unknown, fieldName: string): Date | undefined {
  if (v === undefined) return undefined;
  return parseRequiredDate(v, fieldName);
}

function parseRequiredAmount(v: unknown, fieldName: string): number {
  if (v === undefined || v === null || v === "") {
    throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a non-negative number.`);
  }
  return n;
}

const VALID_BILLING_FREQUENCIES = Object.values(BillingFrequency);

function parseBillingFrequency(v: unknown): BillingFrequency {
  if (typeof v !== "string" || !VALID_BILLING_FREQUENCIES.includes(v as BillingFrequency)) {
    throw ApiError.badRequest(
      `\`billingFrequency\` must be one of: ${VALID_BILLING_FREQUENCIES.join(", ")}.`
    );
  }
  return v as BillingFrequency;
}

/** Validates and normalizes the body for POST /client-contracts. */
export function parseClientContractCreate(body: unknown): ClientContractCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
  if (!clientId) {
    throw ApiError.badRequest("`clientId` is required.");
  }

  const startDate = parseRequiredDate(b.startDate, "startDate");
  const endDate = parseRequiredDate(b.endDate, "endDate");
  if (endDate.getTime() < startDate.getTime()) {
    throw ApiError.badRequest("`endDate` cannot be before `startDate`.");
  }

  return {
    clientId,
    siteId: trimOrNull(b.siteId) ?? null,
    startDate,
    endDate,
    amount: parseRequiredAmount(b.amount, "amount"),
    billingFrequency: b.billingFrequency !== undefined ? parseBillingFrequency(b.billingFrequency) : "MONTHLY",
    notes: trimOrNull(b.notes) ?? null,
  };
}

/** Validates and normalizes the body for PUT /client-contracts/:id. */
export function parseClientContractUpdate(body: unknown): ClientContractUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: ClientContractUpdateInput = {};

  if (b.clientId !== undefined) {
    const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
    if (!clientId) throw ApiError.badRequest("`clientId` cannot be empty.");
    out.clientId = clientId;
  }

  if (b.siteId !== undefined) out.siteId = trimOrNull(b.siteId);

  if (b.startDate !== undefined) out.startDate = parseOptionalDate(b.startDate, "startDate");
  if (b.endDate !== undefined) out.endDate = parseOptionalDate(b.endDate, "endDate");
  if (out.startDate && out.endDate && out.endDate.getTime() < out.startDate.getTime()) {
    throw ApiError.badRequest("`endDate` cannot be before `startDate`.");
  }

  if (b.amount !== undefined) out.amount = parseRequiredAmount(b.amount, "amount");
  if (b.billingFrequency !== undefined) out.billingFrequency = parseBillingFrequency(b.billingFrequency);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

export interface ClientContractListQuery {
  clientId?: string;
  siteId?: string;
  status?: string;
  page: number;
  pageSize: number;
}

const VALID_STATUSES = ["ACTIVE", "EXPIRING_SOON", "EXPIRED", "INACTIVE"];

/** Validates and normalizes query params for GET /client-contracts. */
export function parseListQuery(query: Record<string, unknown>): ClientContractListQuery {
  const result: ClientContractListQuery = { page: 1, pageSize: 20 };

  if (query.clientId !== undefined) {
    if (typeof query.clientId !== "string" || query.clientId.trim() === "") {
      throw ApiError.badRequest("`clientId` filter must be a non-empty string.");
    }
    result.clientId = query.clientId.trim();
  }

  if (query.siteId !== undefined) {
    if (typeof query.siteId !== "string" || query.siteId.trim() === "") {
      throw ApiError.badRequest("`siteId` filter must be a non-empty string.");
    }
    result.siteId = query.siteId.trim();
  }

  if (query.status !== undefined) {
    if (typeof query.status !== "string" || !VALID_STATUSES.includes(query.status)) {
      throw ApiError.badRequest(`\`status\` filter must be one of: ${VALID_STATUSES.join(", ")}.`);
    }
    result.status = query.status;
  }

  if (query.page !== undefined) {
    const page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) {
      throw ApiError.badRequest("`page` must be a positive integer.");
    }
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
