import { WeeklyPlanItemStatus } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

export interface WeeklyPlanItemInput {
  activity: string;
  plannedDate: Date;
  responsible?: string | null;
  estimatedCost: number;
  status: WeeklyPlanItemStatus;
  notes?: string | null;
}

export interface WeeklyPlanCreateInput {
  departmentId: string;
  weekStartDate: Date;
  preparedBy?: string | null;
  notes?: string | null;
  items: WeeklyPlanItemInput[];
}

export interface WeeklyPlanUpdateInput {
  preparedBy?: string | null;
  notes?: string | null;
  items?: WeeklyPlanItemInput[];
}

export interface WeeklyPlanItemStatusInput {
  status: WeeklyPlanItemStatus;
}

export interface WeeklyPlanListQuery {
  departmentId?: string;
  /** Inclusive lower bound on weekStartDate, already normalised to a Monday. */
  fromWeek?: Date;
  /** Inclusive upper bound on weekStartDate, already normalised to a Monday. */
  toWeek?: Date;
  page: number;
  pageSize: number;
}

const ITEM_STATUSES: WeeklyPlanItemStatus[] = ["PLANNED", "DONE", "CANCELLED"];

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const t = v.trim();
  return t === "" ? null : t;
}

function parseDate(v: unknown, field: string): Date {
  if (typeof v !== "string" && !(v instanceof Date)) {
    throw ApiError.badRequest(`\`${field}\` must be a date.`);
  }
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest(`\`${field}\` is not a valid date.`);
  return d;
}

/**
 * Snaps any date to 00:00 UTC on the Monday of its week. Every weekStartDate
 * that reaches the database goes through here, so "the week of the 13th"
 * resolves to one row whether the user picked Monday the 13th or Friday the
 * 17th — which is what makes the per-department-per-week unique constraint
 * meaningful rather than a trap.
 *
 * UTC throughout on purpose: a local-time Monday in Lusaka (UTC+2) would be
 * stored as the preceding Sunday 22:00, so two users in different zones could
 * create two "same" weeks that don't collide.
 */
export function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // getUTCDay(): 0 = Sunday. Shift Sunday back 6 days, every other day back
  // (day - 1), so the week runs Monday-Sunday.
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

/** Midnight UTC on the given date, discarding any time component. */
function dateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseItems(v: unknown): WeeklyPlanItemInput[] {
  if (!Array.isArray(v)) {
    throw ApiError.badRequest("`items` must be an array of planned activities.");
  }
  return v.map((raw, idx) => {
    if (typeof raw !== "object" || raw === null) {
      throw ApiError.badRequest(`items[${idx}] must be an object.`);
    }
    const it = raw as Record<string, unknown>;

    const activity = typeof it.activity === "string" ? it.activity.trim() : "";
    if (!activity) throw ApiError.badRequest(`items[${idx}].activity is required.`);

    // Cost is optional — a site visit on foot costs nothing, and forcing a
    // number would push people to type 0 or, worse, invent a figure.
    let estimatedCost = 0;
    if (it.estimatedCost !== undefined && it.estimatedCost !== null && it.estimatedCost !== "") {
      estimatedCost = Number(it.estimatedCost);
      if (Number.isNaN(estimatedCost) || estimatedCost < 0) {
        throw ApiError.badRequest(`items[${idx}].estimatedCost must be a non-negative number.`);
      }
    }

    let status: WeeklyPlanItemStatus = "PLANNED";
    if (it.status !== undefined) {
      if (!ITEM_STATUSES.includes(it.status as WeeklyPlanItemStatus)) {
        throw ApiError.badRequest(`items[${idx}].status must be one of: ${ITEM_STATUSES.join(", ")}.`);
      }
      status = it.status as WeeklyPlanItemStatus;
    }

    return {
      activity,
      plannedDate: dateOnly(parseDate(it.plannedDate, `items[${idx}].plannedDate`)),
      responsible: trimOrNull(it.responsible) ?? null,
      estimatedCost,
      status,
      notes: trimOrNull(it.notes) ?? null,
    };
  });
}

export function parseWeeklyPlanCreate(body: unknown): WeeklyPlanCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const departmentId = typeof b.departmentId === "string" ? b.departmentId.trim() : "";
  if (!departmentId) throw ApiError.badRequest("`departmentId` is required.");

  return {
    departmentId,
    weekStartDate: startOfWeek(parseDate(b.weekStartDate, "weekStartDate")),
    preparedBy: trimOrNull(b.preparedBy) ?? null,
    notes: trimOrNull(b.notes) ?? null,
    // A plan can legitimately start empty and be filled in during the week.
    items: b.items === undefined ? [] : parseItems(b.items),
  };
}

export function parseWeeklyPlanUpdate(body: unknown): WeeklyPlanUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: WeeklyPlanUpdateInput = {};

  if (b.preparedBy !== undefined) out.preparedBy = trimOrNull(b.preparedBy);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);
  if (b.items !== undefined) out.items = parseItems(b.items);

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }
  return out;
}

export function parseWeeklyPlanItemStatus(body: unknown): WeeklyPlanItemStatusInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  if (!ITEM_STATUSES.includes(b.status as WeeklyPlanItemStatus)) {
    throw ApiError.badRequest(`\`status\` must be one of: ${ITEM_STATUSES.join(", ")}.`);
  }
  return { status: b.status as WeeklyPlanItemStatus };
}

export function parseWeeklyPlanListQuery(query: Record<string, unknown>): WeeklyPlanListQuery {
  const result: WeeklyPlanListQuery = { page: 1, pageSize: 20 };

  if (query.departmentId !== undefined) {
    if (typeof query.departmentId !== "string" || !query.departmentId.trim()) {
      throw ApiError.badRequest("`departmentId` filter must be a non-empty string.");
    }
    result.departmentId = query.departmentId.trim();
  }
  if (query.fromWeek !== undefined) {
    result.fromWeek = startOfWeek(parseDate(query.fromWeek, "fromWeek"));
  }
  if (query.toWeek !== undefined) {
    result.toWeek = startOfWeek(parseDate(query.toWeek, "toWeek"));
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
