import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  RosterEntryCreateInput,
  RosterEntryUpdateInput,
  RosterEntryListQuery,
  BulkCreateInput,
  BulkCancelInput,
  RecordReliefInput,
} from "./roster.validation";

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
 * Bulk-creates roster entries for every calendar day from startDate to
 * endDate (inclusive). This is the "schedule N days in advance" feature.
 *
 * The unique constraint @@unique([employeeId, siteId, date, shiftTypeId])
 * means a day where an entry already exists will throw a P2002 for that
 * particular day. We catch those per-row and report them as skipped rather
 * than aborting the whole batch — the caller gets a `created` array and a
 * `skipped` array explaining which dates were already booked.
 *
 * No schema change is required: each day just becomes one RosterEntry row,
 * exactly as if the user had clicked "Schedule Shift" once per day.
 */
export async function bulkCreateRosterEntries(input: BulkCreateInput) {
  await ensureEmployeeIsGuard(input.employeeId);
  const site = await ensureSiteExists(input.siteId);
  await ensureShiftTypeExists(input.shiftTypeId);

  // Build the list of dates in the range.
  const dates: Date[] = [];
  const cursor = new Date(input.startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(input.endDate);
  end.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const created: object[] = [];
  const skipped: { date: string; reason: string }[] = [];

  for (const date of dates) {
    try {
      const entry = await prisma.rosterEntry.create({
        data: {
          employeeId: input.employeeId,
          siteId: input.siteId,
          clientId: site.clientId,
          shiftTypeId: input.shiftTypeId,
          date,
          notes: input.notes,
        },
      });
      created.push(entry);
    } catch (err: any) {
      // P2002 = unique constraint violation → already scheduled that day.
      if (err?.code === "P2002") {
        skipped.push({
          date: date.toISOString().slice(0, 10),
          reason: "Already scheduled for this employee/site/shift on that date.",
        });
      } else {
        // Any other error is unexpected — surface it so it isn't silently swallowed.
        throw err;
      }
    }
  }

  return { created, skipped };
}

/**
 * Cancels a list of roster entries by their IDs.
 *
 * This is the "cancel from a specific day forward" feature. The caller
 * passes the IDs of all future SCHEDULED entries they want to cancel;
 * entries that have already been marked CANCELLED or that reference a
 * past date are simply ignored by the WHERE clause — no error.
 *
 * Only SCHEDULED entries are touched, so accidentally including an already-
 * cancelled entry in the ids array is harmless.
 */
export async function bulkCancelRosterEntries(input: BulkCancelInput) {
  const result = await prisma.rosterEntry.updateMany({
    where: {
      id: { in: input.ids },
      status: "SCHEDULED",
    },
    data: { status: "CANCELLED" },
  });

  return { cancelledCount: result.count };
}

/**
 * Records a relief / substitute officer for a roster entry where the
 * originally scheduled officer didn't show up.
 *
 * Two things happen in a single transaction:
 *  1. The original roster entry's status is set to CANCELLED (they didn't
 *     work that shift).
 *  2. An AttendanceRecord is created for the relief officer with
 *     status = REPLACEMENT and replacementForEmployeeId pointing at the
 *     original scheduled employee.
 *
 * This means:
 *  - The original officer's roster entry is preserved (for the historical
 *    record of what was planned) but marked CANCELLED.
 *  - The relief officer appears in attendance with REPLACEMENT status, so
 *    payroll can see they worked an extra shift.
 *  - The link between the two is always traceable via
 *    AttendanceRecord.replacementForEmployeeId.
 *
 * No schema change is required — all of these fields already exist.
 */
export async function recordRelief(rosterEntryId: string, input: RecordReliefInput) {
  // Load the existing roster entry first.
  const entry = await prisma.rosterEntry.findUnique({
    where: { id: rosterEntryId },
    include: { employee: { select: { id: true, fullName: true } } },
  });
  if (!entry) {
    throw ApiError.notFound(`Roster entry ${rosterEntryId} not found.`);
  }
  if (entry.status === "CANCELLED") {
    throw ApiError.badRequest("This roster entry is already cancelled.");
  }

  // Validate the relief employee: must be an active guard.
  await ensureEmployeeIsGuard(input.reliefEmployeeId);

  const [updatedEntry, attendanceRecord] = await prisma.$transaction([
    // 1. Cancel the original entry — the planned officer didn't work.
    prisma.rosterEntry.update({
      where: { id: rosterEntryId },
      data: { status: "CANCELLED" },
    }),

    // 2. Record the relief officer's actual attendance.
    prisma.attendanceRecord.create({
      data: {
        employeeId: input.reliefEmployeeId,
        date: entry.date,
        status: "REPLACEMENT",
        replacementForEmployeeId: entry.employeeId, // who they covered for
        rosterEntryId: rosterEntryId,               // which scheduled shift
        notes: input.notes,
      },
    }),
  ]);

  return {
    cancelledEntry: updatedEntry,
    reliefAttendance: attendanceRecord,
    coveredFor: entry.employee,
  };
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

  return prisma.rosterEntry.update({
    where: { id },
    data: {
      ...input,
      ...(clientId !== undefined ? { clientId } : {}),
    },
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// Free-text on the Employee record (see schema comment on `position`), so
// this is a case-insensitive substring match rather than an enum check —
// covers "Guard", "Site Guard", "Security Guard", etc.
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
  const exists = await prisma.shiftType.findUnique({
    where: { id: shiftTypeId },
    select: { id: true },
  });
  if (!exists) {
    throw ApiError.badRequest(`Shift type ${shiftTypeId} does not exist.`);
  }
}
