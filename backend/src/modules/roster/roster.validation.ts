import { RosterEntryStatus } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

export interface RosterEntryCreateInput {
  employeeId: string;
  siteId: string;
  shiftTypeId: string;
  date: Date;
  status?: RosterEntryStatus;
  notes?: string | null;
}

export interface RosterEntryUpdateInput {
  employeeId?: string;
  siteId?: string;
  shiftTypeId?: string;
  date?: Date;
  status?: RosterEntryStatus;
  notes?: string | null;
}

// ─── New: bulk create ────────────────────────────────────────────────────────

export interface BulkCreateInput {
  employeeId: string;
  siteId: string;
  shiftTypeId: string;
  /** First day of the range (inclusive). */
  startDate: Date;
  /** Last day of the range (inclusive). */
  endDate: Date;
  notes?: string | null;
}

// ─── New: bulk cancel ────────────────────────────────────────────────────────

export interface BulkCancelInput {
  ids: string[];
}

// ─── New: record relief ──────────────────────────────────────────────────────

export interface RecordReliefInput {
  /** The employee who actually showed up as a replacement. */
  reliefEmployeeId: string;
  notes?: string | null;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

const VALID_STATUSES: RosterEntryStatus[] = ["SCHEDULED", "CANCELLED"];

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
    throw ApiError.badRequest(`\`${fieldName}\` must be a valid date (e.g. "2026-01-31").`);
  }
  return d;
}

function parseStatus(v: unknown): RosterEntryStatus {
  if (typeof v !== "string" || !VALID_STATUSES.includes(v as RosterEntryStatus)) {
    throw ApiError.badRequest(`\`status\` must be one of: ${VALID_STATUSES.join(", ")}.`);
  }
  return v as RosterEntryStatus;
}

// ─── Parse functions ─────────────────────────────────────────────────────────

/**
 * Validates and normalizes the body for POST /roster.
 * `clientId` is deliberately not accepted — it's always snapshotted
 * server-side from the site's current client.
 */
export function parseRosterEntryCreate(body: unknown): RosterEntryCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const employeeId = parseRequiredId(b.employeeId, "employeeId");
  const siteId = parseRequiredId(b.siteId, "siteId");
  const shiftTypeId = parseRequiredId(b.shiftTypeId, "shiftTypeId");
  const date = parseRequiredDate(b.date, "date");

  let status: RosterEntryStatus | undefined;
  if (b.status !== undefined) {
    status = parseStatus(b.status);
  }

  return {
    employeeId,
    siteId,
    shiftTypeId,
    date,
    status,
    notes: trimOrNull(b.notes) ?? null,
  };
}

/** Validates and normalizes the body for PUT /roster/:id. */
export function parseRosterEntryUpdate(body: unknown): RosterEntryUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: RosterEntryUpdateInput = {};

  if (b.employeeId !== undefined) out.employeeId = parseRequiredId(b.employeeId, "employeeId");
  if (b.siteId !== undefined) out.siteId = parseRequiredId(b.siteId, "siteId");
  if (b.shiftTypeId !== undefined) out.shiftTypeId = parseRequiredId(b.shiftTypeId, "shiftTypeId");
  if (b.date !== undefined) out.date = parseRequiredDate(b.date, "date");
  if (b.status !== undefined) out.status = parseStatus(b.status);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

/**
 * Validates POST /roster/bulk.
 * Creates one RosterEntry per calendar day from startDate to endDate.
 */
export function parseBulkCreate(body: unknown): BulkCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const employeeId = parseRequiredId(b.employeeId, "employeeId");
  const siteId = parseRequiredId(b.siteId, "siteId");
  const shiftTypeId = parseRequiredId(b.shiftTypeId, "shiftTypeId");
  const startDate = parseRequiredDate(b.startDate, "startDate");
  const endDate = parseRequiredDate(b.endDate, "endDate");

  if (endDate.getTime() < startDate.getTime()) {
    throw ApiError.badRequest("`endDate` cannot be before `startDate`.");
  }

  // Sanity cap: no more than 365 days at once.
  const diffDays =
    Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  if (diffDays > 365) {
    throw ApiError.badRequest("Cannot bulk-schedule more than 365 days at once.");
  }

  return {
    employeeId,
    siteId,
    shiftTypeId,
    startDate,
    endDate,
    notes: trimOrNull(b.notes) ?? null,
  };
}

/** Validates POST /roster/bulk-cancel. */
export function parseBulkCancel(body: unknown): BulkCancelInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.ids) || b.ids.length === 0) {
    throw ApiError.badRequest("`ids` must be a non-empty array of roster entry IDs.");
  }
  const ids = b.ids.map((v, i) => {
    if (typeof v !== "string" || !v.trim()) {
      throw ApiError.badRequest(`\`ids[${i}]\` must be a non-empty string.`);
    }
    return v.trim();
  });

  return { ids };
}

/** Validates POST /roster/:id/relief. */
export function parseRecordRelief(body: unknown): RecordReliefInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const reliefEmployeeId = parseRequiredId(b.reliefEmployeeId, "reliefEmployeeId");

  return {
    reliefEmployeeId,
    notes: trimOrNull(b.notes) ?? null,
  };
}

// ─── List query (unchanged) ──────────────────────────────────────────────────

export interface RosterEntryListQuery {
  employeeId?: string;
  siteId?: string;
  clientId?: string;
  shiftTypeId?: string;
  status?: RosterEntryStatus;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}

/** Validates and normalizes query params for GET /roster. */
export function parseListQuery(query: Record<string, unknown>): RosterEntryListQuery {
  const result: RosterEntryListQuery = { page: 1, pageSize: 20 };

  const idFilter = (key: string): string | undefined => {
    const v = query[key];
    if (v === undefined) return undefined;
    if (typeof v !== "string" || v.trim() === "") {
      throw ApiError.badRequest(`\`${key}\` filter must be a non-empty string.`);
    }
    return v.trim();
  };

  const employeeId = idFilter("employeeId");
  if (employeeId) result.employeeId = employeeId;
  const siteId = idFilter("siteId");
  if (siteId) result.siteId = siteId;
  const clientId = idFilter("clientId");
  if (clientId) result.clientId = clientId;
  const shiftTypeId = idFilter("shiftTypeId");
  if (shiftTypeId) result.shiftTypeId = shiftTypeId;

  if (query.status !== undefined) {
    result.status = parseStatus(query.status);
  }

  if (query.dateFrom !== undefined) {
    result.dateFrom = parseRequiredDate(query.dateFrom, "dateFrom");
  }
  if (query.dateTo !== undefined) {
    result.dateTo = parseRequiredDate(query.dateTo, "dateTo");
  }
  if (result.dateFrom && result.dateTo && result.dateTo.getTime() < result.dateFrom.getTime()) {
    throw ApiError.badRequest("`dateTo` cannot be before `dateFrom`.");
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
