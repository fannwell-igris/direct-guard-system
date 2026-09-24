import { MarketingActivityType } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

const VALID_TYPES = Object.values(MarketingActivityType);

export interface ActivityCreateInput {
  type: MarketingActivityType;
  prospectId?: string | null;
  clientId?: string | null;
  purpose?: string | null;
  outcome?: string | null;
  nextAction?: string | null;
  followUpDate?: Date | null;
  notes?: string | null;
  activityDate?: Date;
}

export interface ActivityUpdateInput {
  type?: MarketingActivityType;
  prospectId?: string | null;
  clientId?: string | null;
  purpose?: string | null;
  outcome?: string | null;
  nextAction?: string | null;
  followUpDate?: Date | null;
  notes?: string | null;
  activityDate?: Date;
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

function parseType(v: unknown): MarketingActivityType {
  if (typeof v !== "string" || !VALID_TYPES.includes(v as MarketingActivityType)) {
    throw ApiError.badRequest(`\`type\` must be one of: ${VALID_TYPES.join(", ")}.`);
  }
  return v as MarketingActivityType;
}

/** Validates and normalizes the body for POST /marketing-activities. */
export function parseActivityCreate(body: unknown): ActivityCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const prospectId = parseIdOrNull(b.prospectId, "prospectId");
  const clientId = parseIdOrNull(b.clientId, "clientId");

  return {
    type: parseType(b.type),
    prospectId: prospectId ?? null,
    clientId: clientId ?? null,
    purpose: trimOrNull(b.purpose) ?? null,
    outcome: trimOrNull(b.outcome) ?? null,
    nextAction: trimOrNull(b.nextAction) ?? null,
    followUpDate: parseDateOrNull(b.followUpDate, "followUpDate") ?? null,
    notes: trimOrNull(b.notes) ?? null,
    activityDate: parseDateOrNull(b.activityDate, "activityDate") ?? undefined,
  };
}

/** Validates and normalizes the body for PUT /marketing-activities/:id. Every field optional. */
export function parseActivityUpdate(body: unknown): ActivityUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: ActivityUpdateInput = {};

  if (b.type !== undefined) out.type = parseType(b.type);
  if (b.prospectId !== undefined) out.prospectId = parseIdOrNull(b.prospectId, "prospectId");
  if (b.clientId !== undefined) out.clientId = parseIdOrNull(b.clientId, "clientId");
  if (b.purpose !== undefined) out.purpose = trimOrNull(b.purpose);
  if (b.outcome !== undefined) out.outcome = trimOrNull(b.outcome);
  if (b.nextAction !== undefined) out.nextAction = trimOrNull(b.nextAction);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);
  if (b.followUpDate !== undefined) out.followUpDate = parseDateOrNull(b.followUpDate, "followUpDate");
  if (b.activityDate !== undefined) out.activityDate = parseDateOrNull(b.activityDate, "activityDate") ?? undefined;

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

export interface ActivityListQuery {
  type?: MarketingActivityType;
  prospectId?: string;
  clientId?: string;
  performedById?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}

/** Validates and normalizes query params for GET /marketing-activities. */
export function parseListQuery(query: Record<string, unknown>): ActivityListQuery {
  const result: ActivityListQuery = { page: 1, pageSize: 20 };

  if (query.type !== undefined) {
    result.type = parseType(query.type);
  }
  if (typeof query.prospectId === "string" && query.prospectId.trim() !== "") {
    result.prospectId = query.prospectId.trim();
  }
  if (typeof query.clientId === "string" && query.clientId.trim() !== "") {
    result.clientId = query.clientId.trim();
  }
  if (typeof query.performedById === "string" && query.performedById.trim() !== "") {
    result.performedById = query.performedById.trim();
  }
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
    if (!Number.isInteger(page) || page < 1) {
      throw ApiError.badRequest("`page` must be a positive integer.");
    }
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
