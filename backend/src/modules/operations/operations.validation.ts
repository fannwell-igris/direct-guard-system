import { OperationsReviewStatus, AttendanceStatus } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

export interface OperationsRecordCreateInput {
  siteId: string;
  shiftTypeId: string;
  date: Date;
  siteIssues?: string | null;
  incidents?: string | null;
  incidentTime?: string | null;
  operationalReport?: string | null;
  notes?: string | null;
  submittedBy?: string | null;
}

export interface OperationsRecordUpdateInput {
  siteIssues?: string | null;
  incidents?: string | null;
  incidentTime?: string | null;
  operationalReport?: string | null;
  notes?: string | null;
  submittedBy?: string | null;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseOptionalTime(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !TIME_PATTERN.test(v)) {
    throw ApiError.badRequest("`incidentTime` must be in 24-hour HH:MM format (e.g. \"14:30\").");
  }
  return v;
}

export interface OperationsReviewInput {
  reviewStatus: OperationsReviewStatus;
  reviewedBy: string;
}

const REVIEWABLE_STATUSES: OperationsReviewStatus[] = ["APPROVED", "REJECTED"];
const ALL_REVIEW_STATUSES: OperationsReviewStatus[] = ["PENDING", "APPROVED", "REJECTED"];

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

function parseOptionalId(v: unknown, fieldName: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || v.trim() === "") {
    throw ApiError.badRequest(`\`${fieldName}\` must be a non-empty string if provided.`);
  }
  return v.trim();
}

const ALL_ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "PRESENT",
  "ABSENT",
  "LEAVE",
  "APPROVED_ABSENCE",
  "REPLACEMENT",
  "EXTRA_SHIFT",
  "OTHER",
];

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

/**
 * Validates and normalizes the body for POST /operations.
 * reviewStatus is deliberately not accepted here — every new record
 * starts PENDING; moving it forward happens only via POST /:id/review.
 */
export function parseOperationsRecordCreate(body: unknown): OperationsRecordCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  return {
    siteId: parseRequiredId(b.siteId, "siteId"),
    shiftTypeId: parseRequiredId(b.shiftTypeId, "shiftTypeId"),
    date: parseRequiredDate(b.date, "date"),
    siteIssues: trimOrNull(b.siteIssues) ?? null,
    incidents: trimOrNull(b.incidents) ?? null,
    incidentTime: parseOptionalTime(b.incidentTime) ?? null,
    operationalReport: trimOrNull(b.operationalReport) ?? null,
    notes: trimOrNull(b.notes) ?? null,
    submittedBy: trimOrNull(b.submittedBy) ?? null,
  };
}

/**
 * Validates and normalizes the body for PUT /operations/:id.
 * Only the narrative/free-text fields are editable here — siteId,
 * shiftTypeId, and date identify which record this is (enforced by the
 * unique constraint), and reviewStatus changes only via POST /:id/review.
 */
export function parseOperationsRecordUpdate(body: unknown): OperationsRecordUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: OperationsRecordUpdateInput = {};

  if (b.siteIssues !== undefined) out.siteIssues = trimOrNull(b.siteIssues);
  if (b.incidents !== undefined) out.incidents = trimOrNull(b.incidents);
  if (b.incidentTime !== undefined) out.incidentTime = parseOptionalTime(b.incidentTime);
  if (b.operationalReport !== undefined) out.operationalReport = trimOrNull(b.operationalReport);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);
  if (b.submittedBy !== undefined) out.submittedBy = trimOrNull(b.submittedBy);

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest(
      "Request body must include at least one field to update (siteIssues, incidents, incidentTime, operationalReport, notes, submittedBy). To correct siteId, shiftTypeId, or date, create a new record instead. To change reviewStatus, use POST /:id/review."
    );
  }

  return out;
}

/** Validates and normalizes the body for POST /operations/:id/review. */
export function parseOperationsReview(body: unknown): OperationsReviewInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  if (typeof b.reviewStatus !== "string" || !REVIEWABLE_STATUSES.includes(b.reviewStatus as OperationsReviewStatus)) {
    throw ApiError.badRequest(`\`reviewStatus\` must be one of: ${REVIEWABLE_STATUSES.join(", ")}.`);
  }
  const reviewedBy = parseRequiredId(b.reviewedBy, "reviewedBy");

  return {
    reviewStatus: b.reviewStatus as OperationsReviewStatus,
    reviewedBy,
  };
}

export interface AttendanceRecordCreateInput {
  employeeId: string;
  status: AttendanceStatus;
  rosterEntryId?: string;
  replacementForEmployeeId?: string;
  notes?: string | null;
}

/**
 * Validates and normalizes the body for POST /operations/:id/attendance.
 *
 * Strict replacementForEmployeeId rule (decided 2026-09-10, deferred
 * question resolved): required when status = REPLACEMENT, and rejected
 * for every other status. This guarantees every REPLACEMENT record is
 * traceable to who it covered for — no orphaned/ambiguous replacement
 * rows, matching Section 39's "Officer A = Absent, Officer B =
 * Replacement/Worked" test case. Also rejects an employee being recorded
 * as their own replacement, which is never valid.
 *
 * operationsRecordId is NOT accepted here — it comes from the URL path
 * (nested route), not the body, same as every other nested-resource
 * pattern in this codebase.
 */
export function parseAttendanceRecordCreate(body: unknown): AttendanceRecordCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const employeeId = parseRequiredId(b.employeeId, "employeeId");

  if (typeof b.status !== "string" || !ALL_ATTENDANCE_STATUSES.includes(b.status as AttendanceStatus)) {
    throw ApiError.badRequest(`\`status\` must be one of: ${ALL_ATTENDANCE_STATUSES.join(", ")}.`);
  }
  const status = b.status as AttendanceStatus;

  const rosterEntryId = parseOptionalId(b.rosterEntryId, "rosterEntryId");
  const replacementForEmployeeId = parseOptionalId(b.replacementForEmployeeId, "replacementForEmployeeId");

  if (status === "REPLACEMENT" && !replacementForEmployeeId) {
    throw ApiError.badRequest(
      "`replacementForEmployeeId` is required when `status` is REPLACEMENT."
    );
  }
  if (status !== "REPLACEMENT" && replacementForEmployeeId) {
    throw ApiError.badRequest(
      "`replacementForEmployeeId` may only be set when `status` is REPLACEMENT."
    );
  }
  if (replacementForEmployeeId && replacementForEmployeeId === employeeId) {
    throw ApiError.badRequest("An employee cannot be recorded as a replacement for themselves.");
  }

  return {
    employeeId,
    status,
    rosterEntryId,
    replacementForEmployeeId,
    notes: trimOrNull(b.notes) ?? null,
  };
}

export interface OperationsListQuery {
  siteId?: string;
  clientId?: string;
  shiftTypeId?: string;
  reviewStatus?: OperationsReviewStatus;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}

/** Validates and normalizes query params for GET /operations and the coverage summary. */
export function parseListQuery(query: Record<string, unknown>): OperationsListQuery {
  const result: OperationsListQuery = { page: 1, pageSize: 20 };

  const idFilter = (key: string): string | undefined => {
    const v = query[key];
    if (v === undefined) return undefined;
    if (typeof v !== "string" || v.trim() === "") {
      throw ApiError.badRequest(`\`${key}\` filter must be a non-empty string.`);
    }
    return v.trim();
  };

  const siteId = idFilter("siteId");
  if (siteId) result.siteId = siteId;
  const clientId = idFilter("clientId");
  if (clientId) result.clientId = clientId;
  const shiftTypeId = idFilter("shiftTypeId");
  if (shiftTypeId) result.shiftTypeId = shiftTypeId;

  if (query.reviewStatus !== undefined) {
    const rs = query.reviewStatus;
    if (typeof rs !== "string" || !ALL_REVIEW_STATUSES.includes(rs as OperationsReviewStatus)) {
      throw ApiError.badRequest(`\`reviewStatus\` must be one of: ${ALL_REVIEW_STATUSES.join(", ")}.`);
    }
    result.reviewStatus = rs as OperationsReviewStatus;
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

// The coverage summary uses the exact same filters as the list endpoint.
export type CoverageSummaryQuery = OperationsListQuery;
export const parseCoverageSummaryQuery = parseListQuery;

export interface AttendanceCalendarQuery {
  dateFrom: Date;
  dateTo: Date;
  siteId?: string;
  clientId?: string;
  employeeId?: string;
  shiftTypeId?: string;
}

// ------------------------------------------------------------------ //
// Sync-from-roster / Mark-all-present
// ------------------------------------------------------------------ //

export interface SyncFromRosterInput {
  date: Date;
  siteId?: string;
  shiftTypeId?: string;
}

export interface MarkAllPresentInput {
  date: Date;
  siteId?: string;
  shiftTypeId?: string;
}

/** Validates POST /operations/sync-from-roster body. */
export function parseSyncFromRosterInput(body: unknown): SyncFromRosterInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  return {
    date: parseRequiredDate(b.date, "date"),
    siteId: parseOptionalId(b.siteId, "siteId"),
    shiftTypeId: parseOptionalId(b.shiftTypeId, "shiftTypeId"),
  };
}

/** Validates POST /operations/mark-all-present body. */
export function parseMarkAllPresentInput(body: unknown): MarkAllPresentInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  return {
    date: parseRequiredDate(b.date, "date"),
    siteId: parseOptionalId(b.siteId, "siteId"),
    shiftTypeId: parseOptionalId(b.shiftTypeId, "shiftTypeId"),
  };
}

// Keeps the grid to roughly two months at a time so one request can't be
// asked to build (and the browser render) a year-wide table.
const MAX_CALENDAR_DAYS = 62;

/** Validates and normalizes query params for GET /operations/attendance-calendar. */
export function parseAttendanceCalendarQuery(query: Record<string, unknown>): AttendanceCalendarQuery {
  const dateFrom = parseRequiredDate(query.dateFrom, "dateFrom");
  const dateTo = parseRequiredDate(query.dateTo, "dateTo");
  if (dateTo.getTime() < dateFrom.getTime()) {
    throw ApiError.badRequest("`dateTo` cannot be before `dateFrom`.");
  }
  const spanDays = Math.round((dateTo.getTime() - dateFrom.getTime()) / 86400000) + 1;
  if (spanDays > MAX_CALENDAR_DAYS) {
    throw ApiError.badRequest(`Date range too large (${spanDays} days) — request at most ${MAX_CALENDAR_DAYS} days (about two months) at a time.`);
  }

  const idFilter = (key: string): string | undefined => {
    const v = query[key];
    if (v === undefined) return undefined;
    if (typeof v !== "string" || v.trim() === "") {
      throw ApiError.badRequest(`\`${key}\` filter must be a non-empty string.`);
    }
    return v.trim();
  };

  return {
    dateFrom,
    dateTo,
    siteId: idFilter("siteId"),
    clientId: idFilter("clientId"),
    employeeId: idFilter("employeeId"),
    shiftTypeId: idFilter("shiftTypeId"),
  };
}
