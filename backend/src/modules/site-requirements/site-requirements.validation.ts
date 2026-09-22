import { ApiError } from "../../middleware/errorHandler";

export interface SiteRequirementCreateInput {
  siteId: string;
  shiftTypeId: string;
  requiredOfficers: number;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
  notes?: string | null;
}

export interface SiteRequirementUpdateInput {
  siteId?: string;
  shiftTypeId?: string;
  requiredOfficers?: number;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
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

function parseRequiredOfficers(v: unknown): number {
  if (v === undefined || v === null || v === "") {
    throw ApiError.badRequest("`requiredOfficers` is required.");
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) {
    throw ApiError.badRequest("`requiredOfficers` must be a non-negative integer.");
  }
  return n;
}

function parseDate(v: unknown, fieldName: string): Date {
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a valid date (e.g. "2026-01-31").`);
  }
  return d;
}

function parseOptionalNullableDate(v: unknown, fieldName: string): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return parseDate(v, fieldName);
}

/** Validates and normalizes the body for POST /site-requirements. */
export function parseSiteRequirementCreate(body: unknown): SiteRequirementCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const siteId = parseRequiredId(b.siteId, "siteId");
  const shiftTypeId = parseRequiredId(b.shiftTypeId, "shiftTypeId");
  const requiredOfficers = parseRequiredOfficers(b.requiredOfficers);

  const effectiveFrom = b.effectiveFrom !== undefined ? parseDate(b.effectiveFrom, "effectiveFrom") : undefined;
  const effectiveTo = parseOptionalNullableDate(b.effectiveTo, "effectiveTo") ?? null;

  if (effectiveFrom && effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) {
    throw ApiError.badRequest("`effectiveTo` cannot be before `effectiveFrom`.");
  }

  return {
    siteId,
    shiftTypeId,
    requiredOfficers,
    effectiveFrom,
    effectiveTo,
    notes: trimOrNull(b.notes) ?? null,
  };
}

/** Validates and normalizes the body for PUT /site-requirements/:id. */
export function parseSiteRequirementUpdate(body: unknown): SiteRequirementUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: SiteRequirementUpdateInput = {};

  if (b.siteId !== undefined) out.siteId = parseRequiredId(b.siteId, "siteId");
  if (b.shiftTypeId !== undefined) out.shiftTypeId = parseRequiredId(b.shiftTypeId, "shiftTypeId");
  if (b.requiredOfficers !== undefined) out.requiredOfficers = parseRequiredOfficers(b.requiredOfficers);
  if (b.effectiveFrom !== undefined) out.effectiveFrom = parseDate(b.effectiveFrom, "effectiveFrom");
  if (b.effectiveTo !== undefined) out.effectiveTo = parseOptionalNullableDate(b.effectiveTo, "effectiveTo") ?? null;
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (out.effectiveFrom && out.effectiveTo && out.effectiveTo.getTime() < out.effectiveFrom.getTime()) {
    throw ApiError.badRequest("`effectiveTo` cannot be before `effectiveFrom`.");
  }

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

export interface SiteRequirementListQuery {
  siteId?: string;
  shiftTypeId?: string;
  page: number;
  pageSize: number;
}

/** Validates and normalizes query params for GET /site-requirements. */
export function parseListQuery(query: Record<string, unknown>): SiteRequirementListQuery {
  const result: SiteRequirementListQuery = { page: 1, pageSize: 20 };

  if (query.siteId !== undefined) {
    if (typeof query.siteId !== "string" || query.siteId.trim() === "") {
      throw ApiError.badRequest("`siteId` filter must be a non-empty string.");
    }
    result.siteId = query.siteId.trim();
  }

  if (query.shiftTypeId !== undefined) {
    if (typeof query.shiftTypeId !== "string" || query.shiftTypeId.trim() === "") {
      throw ApiError.badRequest("`shiftTypeId` filter must be a non-empty string.");
    }
    result.shiftTypeId = query.shiftTypeId.trim();
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
