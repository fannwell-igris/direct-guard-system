import { ApiError } from "../../middleware/errorHandler";

export interface FieldVisitCreateInput {
  prospectId?: string | null;
  clientId?: string | null;
  visitDate?: Date;
  location?: string | null;
  personVisited?: string | null;
  purpose?: string | null;
  outcome?: string | null;
  opportunitiesIdentified?: string | null;
  nextAction?: string | null;
  followUpDate?: Date | null;
  notes?: string | null;
}

export interface FieldVisitUpdateInput {
  prospectId?: string | null;
  clientId?: string | null;
  visitDate?: Date;
  location?: string | null;
  personVisited?: string | null;
  purpose?: string | null;
  outcome?: string | null;
  opportunitiesIdentified?: string | null;
  nextAction?: string | null;
  followUpDate?: Date | null;
  notes?: string | null;
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

function parseDateOrNull(v: unknown, field: string): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) {
    throw ApiError.badRequest(`\`${field}\` must be a valid date.`);
  }
  return d;
}

/** Validates and normalizes the body for POST /field-visits. */
export function parseVisitCreate(body: unknown): FieldVisitCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  return {
    prospectId: parseIdOrNull(b.prospectId, "prospectId") ?? null,
    clientId: parseIdOrNull(b.clientId, "clientId") ?? null,
    visitDate: parseDateOrNull(b.visitDate, "visitDate") ?? undefined,
    location: trimOrNull(b.location) ?? null,
    personVisited: trimOrNull(b.personVisited) ?? null,
    purpose: trimOrNull(b.purpose) ?? null,
    outcome: trimOrNull(b.outcome) ?? null,
    opportunitiesIdentified: trimOrNull(b.opportunitiesIdentified) ?? null,
    nextAction: trimOrNull(b.nextAction) ?? null,
    followUpDate: parseDateOrNull(b.followUpDate, "followUpDate") ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

/** Validates and normalizes the body for PUT /field-visits/:id. Every field optional. */
export function parseVisitUpdate(body: unknown): FieldVisitUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: FieldVisitUpdateInput = {};

  if (b.prospectId !== undefined) out.prospectId = parseIdOrNull(b.prospectId, "prospectId");
  if (b.clientId !== undefined) out.clientId = parseIdOrNull(b.clientId, "clientId");
  if (b.visitDate !== undefined) out.visitDate = parseDateOrNull(b.visitDate, "visitDate") ?? undefined;
  if (b.location !== undefined) out.location = trimOrNull(b.location);
  if (b.personVisited !== undefined) out.personVisited = trimOrNull(b.personVisited);
  if (b.purpose !== undefined) out.purpose = trimOrNull(b.purpose);
  if (b.outcome !== undefined) out.outcome = trimOrNull(b.outcome);
  if (b.opportunitiesIdentified !== undefined) out.opportunitiesIdentified = trimOrNull(b.opportunitiesIdentified);
  if (b.nextAction !== undefined) out.nextAction = trimOrNull(b.nextAction);
  if (b.followUpDate !== undefined) out.followUpDate = parseDateOrNull(b.followUpDate, "followUpDate");
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

export interface FieldVisitListQuery {
  prospectId?: string;
  clientId?: string;
  marketerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}

/** Validates and normalizes query params for GET /field-visits. */
export function parseListQuery(query: Record<string, unknown>): FieldVisitListQuery {
  const result: FieldVisitListQuery = { page: 1, pageSize: 20 };

  if (typeof query.prospectId === "string" && query.prospectId.trim() !== "") result.prospectId = query.prospectId.trim();
  if (typeof query.clientId === "string" && query.clientId.trim() !== "") result.clientId = query.clientId.trim();
  if (typeof query.marketerId === "string" && query.marketerId.trim() !== "") result.marketerId = query.marketerId.trim();

  if (query.dateFrom !== undefined && query.dateFrom !== "") {
    const d = new Date(query.dateFrom as string);
    if (Number.isNaN(d.getTime())) throw ApiError.badRequest("`dateFrom` must be a valid date.");
    result.dateFrom = d;
  }
  if (query.dateTo !== undefined && query.dateTo !== "") {
    const d = new Date(query.dateTo as string);
    if (Number.isNaN(d.getTime())) throw ApiError.badRequest("`dateTo` must be a valid date.");
    result.dateTo = d;
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
