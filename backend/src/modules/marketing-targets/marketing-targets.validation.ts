import { ApiError } from "../../middleware/errorHandler";

export interface TargetCreateInput {
  marketerId?: string | null;
  periodYear: number;
  periodMonth: number;
  targetNewProspects?: number | null;
  targetActivities?: number | null;
  targetVisits?: number | null;
  targetConversions?: number | null;
  notes?: string | null;
}

export interface TargetUpdateInput {
  marketerId?: string | null;
  periodYear?: number;
  periodMonth?: number;
  targetNewProspects?: number | null;
  targetActivities?: number | null;
  targetVisits?: number | null;
  targetConversions?: number | null;
  notes?: string | null;
}

export interface TargetListQuery {
  marketerId?: string;
  periodYear?: number;
  periodMonth?: number;
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

function parseIdOrNull(v: unknown, field: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") throw ApiError.badRequest(`\`${field}\` must be a string.`);
  return v;
}

function parseIntOrNull(v: unknown, field: string, { min, max }: { min?: number; max?: number } = {}): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw ApiError.badRequest(`\`${field}\` must be a whole number.`);
  if (min !== undefined && n < min) throw ApiError.badRequest(`\`${field}\` must be at least ${min}.`);
  if (max !== undefined && n > max) throw ApiError.badRequest(`\`${field}\` must be at most ${max}.`);
  return n;
}

function requireYear(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) throw ApiError.badRequest("`periodYear` must be a valid year.");
  return n;
}

function requireMonth(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 12) throw ApiError.badRequest("`periodMonth` must be an integer between 1 and 12.");
  return n;
}

export function parseTargetCreate(body: unknown): TargetCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  if (b.periodYear === undefined) throw ApiError.badRequest("`periodYear` is required.");
  if (b.periodMonth === undefined) throw ApiError.badRequest("`periodMonth` is required.");

  return {
    marketerId: parseIdOrNull(b.marketerId, "marketerId") ?? null,
    periodYear: requireYear(b.periodYear),
    periodMonth: requireMonth(b.periodMonth),
    targetNewProspects: parseIntOrNull(b.targetNewProspects, "targetNewProspects", { min: 0 }) ?? null,
    targetActivities: parseIntOrNull(b.targetActivities, "targetActivities", { min: 0 }) ?? null,
    targetVisits: parseIntOrNull(b.targetVisits, "targetVisits", { min: 0 }) ?? null,
    targetConversions: parseIntOrNull(b.targetConversions, "targetConversions", { min: 0 }) ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

export function parseTargetUpdate(body: unknown): TargetUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: TargetUpdateInput = {};

  if (b.marketerId !== undefined) out.marketerId = parseIdOrNull(b.marketerId, "marketerId");
  if (b.periodYear !== undefined) out.periodYear = requireYear(b.periodYear);
  if (b.periodMonth !== undefined) out.periodMonth = requireMonth(b.periodMonth);
  if (b.targetNewProspects !== undefined) out.targetNewProspects = parseIntOrNull(b.targetNewProspects, "targetNewProspects", { min: 0 });
  if (b.targetActivities !== undefined) out.targetActivities = parseIntOrNull(b.targetActivities, "targetActivities", { min: 0 });
  if (b.targetVisits !== undefined) out.targetVisits = parseIntOrNull(b.targetVisits, "targetVisits", { min: 0 });
  if (b.targetConversions !== undefined) out.targetConversions = parseIntOrNull(b.targetConversions, "targetConversions", { min: 0 });
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }
  return out;
}

export function parseListQuery(query: Record<string, unknown>): TargetListQuery {
  const result: TargetListQuery = { page: 1, pageSize: 50 };

  if (typeof query.marketerId === "string" && query.marketerId.trim() !== "") result.marketerId = query.marketerId.trim();
  if (query.periodYear !== undefined && query.periodYear !== "") result.periodYear = requireYear(query.periodYear);
  if (query.periodMonth !== undefined && query.periodMonth !== "") result.periodMonth = requireMonth(query.periodMonth);

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
