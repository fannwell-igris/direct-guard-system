import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  RosterEntryCreateInput,
  RosterEntryUpdateInput,
  RosterEntryListQuery,
} from "./roster.validation";

export interface ReliefInput {
  reliefEmployeeId: string;
  notes?: string | null;
}

/**
 * Creates a new roster entry. Validates employeeId, siteId, and shiftTypeId
 * all reference real records first, so a bad id comes back as a clean 400
 * rather than a raw Prisma foreign-key error.
 *
 * `clientId` is never accepted from the caller — it's always snapshotted
 * from the site's *current* client at creation time (per the schema
 * comment: a site's client assignment can be reassigned later via the
 * Sites API, and historical roster entries must not silently show a
 * different client afterward).
 *
 * The DB-level @@unique([employeeId, siteId, date, shiftTypeId]) prevents
 * double-booking the same employee for the same site/date/shift, and
 * surfaces as a clean 409 via the shared error handler's P2002 handling.
 */
export async function createRosterEntry(input: RosterEntryCreateInput) {
  await ensureEmployeeIsGuard(input.employeeId);
  const site = await ensureSiteExists(input.siteId);
  await ensureShiftTypeExists(input.shiftTypeId);

  // An officer cannot be scheduled for the same shift type on the same day
  // at any site — Day Shift at Site A AND Day Shift at Site B is a conflict.
  // Same officer, same day, different shift types is fine (Day + Night).
  // Only SCHEDULED entries count — CANCELLED ones are ignored.
  await ensureNoShiftConflict(input.employeeId, input.date, input.shiftTypeId);

  return prisma.rosterEntry.create({
    data: {
      employeeId: input.employeeId,
      siteId: input.siteId,
      clientId: site.clientId,
      shiftTypeId: input.shiftTypeId,
      date: input.date,
      ...(input.status !== undefined ? { status: input.status } : {}),
      notes: input.notes,
    },
  });
}

/**
 * Lists roster entries with optional employeeId/siteId/clientId/
 * shiftTypeId/status filters and a date range, paginated.
 */
export async function listRosterEntries(query: RosterEntryListQuery) {
  const where: Prisma.RosterEntryWhereInput = {};

  if (query.employeeId) where.employeeId = query.employeeId;
  if (query.siteId) where.siteId = query.siteId;
  if (query.clientId) where.clientId = query.clientId;
  if (query.shiftTypeId) where.shiftTypeId = query.shiftTypeId;
  if (query.status) where.status = query.status;

  if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom ? { gte: query.dateFrom } : {}),
      ...(query.dateTo ? { lte: query.dateTo } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    prisma.rosterEntry.count({ where }),
    prisma.rosterEntry.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        employee: { select: { id: true, fullName: true } },
        site: { select: { id: true, siteName: true } },
        client: { select: { id: true, name: true } },
        shiftType: { select: { id: true, name: true, isActive: true } },
      },
    }),
  ]);

  return {
    data: rows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

/** Fetches a single roster entry for the detail view. */
export async function getRosterEntryById(id: string) {
  const entry = await prisma.rosterEntry.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, fullName: true, employmentStatus: true } },
      site: { select: { id: true, siteName: true, status: true } },
      client: { select: { id: true, name: true } },
      shiftType: { select: { id: true, name: true, isActive: true } },
    },
  });

  if (!entry) {
    throw ApiError.notFound(`Roster entry ${id} not found.`);
  }

  return entry;
}

/**
 * Updates a roster entry. Re-validates employeeId/shiftTypeId if changed.
 * If siteId changes, `clientId` is re-snapshotted from the *new* site's
 * current client — the entry now represents a shift at a different site,
 * so it should reflect that site's client, not the old one.
 */
export async function updateRosterEntry(id: string, input: RosterEntryUpdateInput) {
  const existing = await prisma.rosterEntry.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Roster entry ${id} not found.`);
  }

  if (input.employeeId) await ensureEmployeeIsGuard(input.employeeId);
  if (input.shiftTypeId) await ensureShiftTypeExists(input.shiftTypeId);

  let clientId: string | undefined;
  if (input.siteId) {
    const site = await ensureSiteExists(input.siteId);
    clientId = site.clientId;
  }

  // Re-check for shift conflict when the employee, date, or shift type is
  // being changed. Use the incoming values where provided, fall back to the
  // existing entry's values so we always check the final effective state.
  const effectiveEmployeeId  = input.employeeId  ?? existing.employeeId;
  const effectiveDate        = input.date        ?? existing.date;
  const effectiveShiftTypeId = input.shiftTypeId ?? existing.shiftTypeId;
  await ensureNoShiftConflict(
    effectiveEmployeeId,
    effectiveDate,
    effectiveShiftTypeId,
    id, // exclude the entry being edited from the conflict check
  );

  return prisma.rosterEntry.update({
    where: { id },
    data: {
      ...input,
      ...(clientId !== undefined ? { clientId } : {}),
    },
  });
}

/**
 * Relief officer flow — single atomic action:
 *  1. Loads the original SCHEDULED roster entry (404 if not found, 409 if
 *     already cancelled).
 *  2. Validates the relief officer is a Guard and not the same person.
 *  3. Finds or creates the OperationsRecord for this site/date/shift
 *     (creates it with no report fields if it doesn't exist yet — this
 *     matches the pattern used everywhere else: the ops record is the
 *     container, the attendance record is the content).
 *  4. Inside a transaction:
 *     a. Sets the original roster entry to CANCELLED.
 *     b. Creates an AttendanceRecord for the relief officer with
 *        status=REPLACEMENT, linked to the original officer via
 *        replacementForEmployeeId.
 *
 * Returns the created AttendanceRecord so the caller can confirm what was
 * recorded.
 */
export async function recordRelief(rosterEntryId: string, input: ReliefInput) {
  // 1. Load original entry
  const entry = await prisma.rosterEntry.findUnique({
    where: { id: rosterEntryId },
    include: {
      employee:  { select: { id: true, fullName: true } },
      site:      { select: { id: true, siteName: true, clientId: true } },
      shiftType: { select: { id: true, name: true } },
    },
  });
  if (!entry) {
    throw ApiError.notFound(`Roster entry ${rosterEntryId} not found.`);
  }
  if (entry.status === "CANCELLED") {
    throw ApiError.conflict(
      `This roster entry is already cancelled — it cannot receive a relief officer.`
    );
  }

  // 2. Validate relief officer
  if (input.reliefEmployeeId === entry.employeeId) {
    throw ApiError.badRequest("The relief officer cannot be the same as the original officer.");
  }
  await ensureEmployeeIsGuard(input.reliefEmployeeId);

  // 3. Find or create the OperationsRecord for this site/date/shift
  const dateOnly = new Date(entry.date);
  let opsRecord = await prisma.operationsRecord.findFirst({
    where: {
      siteId:      entry.siteId,
      shiftTypeId: entry.shiftTypeId,
      date:        dateOnly,
    },
    select: { id: true },
  });

  if (!opsRecord) {
    opsRecord = await prisma.operationsRecord.create({
      data: {
        siteId:      entry.siteId,
        clientId:    entry.site.clientId,
        shiftTypeId: entry.shiftTypeId,
        date:        dateOnly,
        // Report fields left blank — relief is recorded before a full
        // ops report is submitted; the ops team fills those in separately.
      },
      select: { id: true },
    });
  }

  // 4. Transaction: cancel original entry + create REPLACEMENT attendance
  const [, attendanceRecord] = await prisma.$transaction([
    prisma.rosterEntry.update({
      where: { id: rosterEntryId },
      data: {
        status: "CANCELLED",
        notes: input.notes
          ? `Relief: ${input.notes}`
          : (entry.notes ?? undefined),
      },
    }),
    prisma.attendanceRecord.create({
      data: {
        operationsRecordId:       opsRecord.id,
        employeeId:               input.reliefEmployeeId,
        status:                   "REPLACEMENT",
        rosterEntryId:            rosterEntryId,
        replacementForEmployeeId: entry.employeeId,
        notes:                    input.notes ?? null,
      },
      include: {
        employee:               { select: { id: true, fullName: true } },
        replacementForEmployee: { select: { id: true, fullName: true } },
      },
    }),
  ]);

  return {
    cancelledEntry: { id: rosterEntryId, originalOfficer: entry.employee.fullName },
    attendanceRecord,
  };
}

// Free-text on the Employee record (see schema comment on `position`), so
// this is a case-insensitive substring match rather than an enum check —
// covers "Guard", "Site Guard", "Security Guard", etc. (2026-09-23: only
// Guards may be scheduled to a site, per explicit instruction.)
const GUARD_POSITION_PATTERN = /guard/i;

function isGuardPosition(position: string | null | undefined): boolean {
  return !!position && GUARD_POSITION_PATTERN.test(position);
}

async function ensureEmployeeIsGuard(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, position: true },
  });
  if (!employee) {
    throw ApiError.badRequest(`Employee ${employeeId} does not exist.`);
  }
  if (!isGuardPosition(employee.position)) {
    throw ApiError.badRequest(
      `Only employees whose position is "Guard" can be scheduled to a site (this employee's position is "${employee.position ?? "not set"}").`
    );
  }
}

async function ensureSiteExists(siteId: string) {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, clientId: true },
  });
  if (!site) {
    throw ApiError.badRequest(`Site ${siteId} does not exist.`);
  }
  return site;
}

async function ensureShiftTypeExists(shiftTypeId: string) {
  const exists = await prisma.shiftType.findUnique({ where: { id: shiftTypeId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Shift type ${shiftTypeId} does not exist.`);
  }
}

/**
 * Blocks scheduling the same officer for the same shift type on the same day
 * at any site. Only SCHEDULED entries count — CANCELLED ones are ignored so
 * that replacing a cancelled shift never triggers a false conflict.
 *
 * `excludeId` is the roster entry being edited (so it doesn't conflict with
 * itself). Omit when creating.
 */
async function ensureNoShiftConflict(
  employeeId: string,
  date: Date | string,
  shiftTypeId: string,
  excludeId?: string,
) {
  const conflict = await prisma.rosterEntry.findFirst({
    where: {
      employeeId,
      date: typeof date === "string" ? new Date(date) : date,
      shiftTypeId,
      status: "SCHEDULED",
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: {
      site:      { select: { siteName: true } },
      shiftType: { select: { name: true } },
    },
  });

  if (conflict) {
    throw ApiError.conflict(
      `This officer is already scheduled for a ${conflict.shiftType.name} on this date ` +
      `(${conflict.site.siteName}). An officer cannot be scheduled for the same shift ` +
      `type twice on the same day, even at a different site.`,
    );
  }
}
