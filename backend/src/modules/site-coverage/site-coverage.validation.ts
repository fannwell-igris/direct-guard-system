import { ApiError } from "../../middleware/errorHandler";

export interface SiteCoverageSetInput {
  siteId: string;
  shiftTypeId: string;
  date: Date;
  isCovered: boolean | null;
  notes?: string | null;
}

function parseRequiredId(v: unknown, fieldName: string): string {
  const id = typeof v === "string" ? v.trim() : "";
  if (!id) throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  return id;
}

/** Normalizes any date input down to midnight UTC of that calendar day (once-per-day granularity, confirmed 2026-09-14). */
function parseDay(v: unknown, fieldName: string): Date {
  if (v === undefined || v === null || v === "") {
    throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  }
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a valid date (e.g. "2026-09-14").`);
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/** Validates and normalizes the body for PUT /site-coverage (upsert: one row per site per day per shift). */
export function parseSiteCoverageSet(body: unknown): SiteCoverageSetInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  // null is allowed and means "reset to unmarked"
  if (b.isCovered !== null && typeof b.isCovered !== "boolean") {
    throw ApiError.badRequest("`isCovered` must be true, false, or null.");
  }

  return {
    siteId: parseRequiredId(b.siteId, "siteId"),
    shiftTypeId: parseRequiredId(b.shiftTypeId, "shiftTypeId"),
    date: parseDay(b.date, "date"),
    isCovered: b.isCovered,
    notes: trimOrNull(b.notes) ?? null,
  };
}

/** Validates the ?date= query param for GET /site-coverage. Defaults to today (UTC) if omitted. */
export function parseDateQuery(query: Record<string, unknown>): Date {
  if (query.date === undefined) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  return parseDay(query.date, "date");
}
