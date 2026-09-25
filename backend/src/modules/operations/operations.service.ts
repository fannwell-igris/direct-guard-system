import { Prisma, AttendanceStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  OperationsRecordCreateInput,
  OperationsRecordUpdateInput,
  OperationsReviewInput,
  OperationsListQuery,
  AttendanceRecordCreateInput,
  AttendanceCalendarQuery,
} from "./operations.validation";

// Attendance statuses that count as "someone was actually there covering
// the shift" for coverage-percent purposes. ABSENT/LEAVE/APPROVED_ABSENCE/
// OTHER do not count toward coverage.
const COVERING_STATUSES: AttendanceStatus[] = ["PRESENT", "REPLACEMENT", "EXTRA_SHIFT"];

interface SiteRequirementRow {
  siteId: string;
  shiftTypeId: string;
  requiredOfficers: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/**
 * Creates a new OperationsRecord ("what happened at this site, on this
 * date, for this shift"). Validates siteId and shiftTypeId first, so a bad
 * id comes back as a clean 400 rather than a raw Prisma foreign-key error.
 * shiftTypeId must be active — same rule already applied to Site
 * Requirements and Roster. clientId is snapshotted from the site's current
 * client at creation time, same reasoning as RosterEntry.clientId.
 *
 * The DB-level @@unique([siteId, date, shiftTypeId]) prevents a duplicate
 * record for the same site/date/shift, surfaced as a clean 409 via the
 * shared error handler's P2002 handling.
 */
export async function createOperationsRecord(input: OperationsRecordCreateInput) {
  const site = await ensureSiteExists(input.siteId);
  await ensureActiveShiftTypeExists(input.shiftTypeId);

  return prisma.operationsRecord.create({
    data: {
      siteId: input.siteId,
      clientId: site.clientId,
      shiftTypeId: input.shiftTypeId,
      date: input.date,
      siteIssues: input.siteIssues,
      incidents: input.incidents,
      incidentTime: input.incidentTime,
      operationalReport: input.operationalReport,
      notes: input.notes,
      submittedBy: input.submittedBy,
    },
  });
}

/** Lists OperationsRecords with optional filters, paginated. */
export async function listOperationsRecords(query: OperationsListQuery) {
  const where = buildWhere(query);

  const [total, rows] = await Promise.all([
    prisma.operationsRecord.count({ where }),
    prisma.operationsRecord.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        site: { select: { id: true, siteName: true } },
        client: { select: { id: true, name: true } },
        shiftType: { select: { id: true, name: true, isActive: true } },
        _count: { select: { attendanceRecords: true } },
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

/**
 * Fetches a single OperationsRecord with its attendance records and a
 * calculated coverage figure — never stored, recomputed on every read,
 * same principle as ContractStatus.
 */
export async function getOperationsRecordById(id: string) {
  const record = await prisma.operationsRecord.findUnique({
    where: { id },
    include: {
      site: { select: { id: true, siteName: true } },
      client: { select: { id: true, name: true } },
      shiftType: { select: { id: true, name: true, isActive: true } },
      attendanceRecords: {
        include: {
          employee: { select: { id: true, fullName: true } },
          replacementForEmployee: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  if (!record) {
    throw ApiError.notFound(`Operations record ${id} not found.`);
  }

  const requirements = await prisma.siteRequirement.findMany({
    where: { siteId: record.siteId, shiftTypeId: record.shiftTypeId },
  });
  const requiredOfficers = findApplicableRequiredOfficers(
    requirements,
    record.siteId,
    record.shiftTypeId,
    record.date
  );
  const coveredCount = record.attendanceRecords.filter((a) => COVERING_STATUSES.includes(a.status)).length;

  return {
    ...record,
    coverage: {
      requiredOfficers,
      coveredCount,
      coveragePercent: requiredOfficers ? Math.round((coveredCount / requiredOfficers) * 100) : null,
    },
  };
}

/**
 * Updates the narrative/free-text fields of an OperationsRecord.
 * siteId, shiftTypeId, and date are NOT editable here — they identify
 * which record this is (enforced by the unique constraint); create a new
 * record instead to correct one of those. reviewStatus is changed only via
 * reviewOperationsRecord, to keep review a single auditable step.
 */
export async function updateOperationsRecord(id: string, input: OperationsRecordUpdateInput) {
  const existing = await prisma.operationsRecord.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Operations record ${id} not found.`);
  }

  return prisma.operationsRecord.update({
    where: { id },
    data: input,
  });
}

/**
 * Moves an OperationsRecord from PENDING to APPROVED or REJECTED. Can only
 * be done once — a record that's already been reviewed cannot be
 * re-reviewed through this endpoint, to keep reviewedBy/reviewedAt a
 * reliable audit trail (same principle as Payroll's stage timestamps).
 */
export async function reviewOperationsRecord(id: string, input: OperationsReviewInput) {
  const existing = await prisma.operationsRecord.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Operations record ${id} not found.`);
  }
  if (existing.reviewStatus !== "PENDING") {
    throw ApiError.badRequest(
      `Operations record ${id} has already been reviewed (${existing.reviewStatus}) and cannot be reviewed again.`
    );
  }

  return prisma.operationsRecord.update({
    where: { id },
    data: {
      reviewStatus: input.reviewStatus,
      reviewedBy: input.reviewedBy,
      reviewedAt: new Date(),
    },
  });
}

/**
 * Coverage summary across OperationsRecords matching the given filters —
 * one row per record, each with a coverage percentage calculated against
 * the matching SiteRequirement.requiredOfficers (if one exists for that
 * site/shiftType/date). Site requirements for the (siteId, shiftTypeId)
 * pairs actually present are batch-fetched once, not per record.
 */
export async function getCoverageSummary(query: OperationsListQuery) {
  const where = buildWhere(query);

  const [total, records] = await Promise.all([
    prisma.operationsRecord.count({ where }),
    prisma.operationsRecord.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        site: { select: { id: true, siteName: true } },
        client: { select: { id: true, name: true } },
        shiftType: { select: { id: true, name: true } },
        attendanceRecords: { select: { status: true } },
      },
    }),
  ]);

  const pairKey = (siteId: string, shiftTypeId: string) => `${siteId}|${shiftTypeId}`;
  const pairs = Array.from(
    new Map(records.map((r) => [pairKey(r.siteId, r.shiftTypeId), { siteId: r.siteId, shiftTypeId: r.shiftTypeId }])).values()
  );
  const requirements: SiteRequirementRow[] = pairs.length
    ? await prisma.siteRequirement.findMany({
        where: { OR: pairs.map((p) => ({ siteId: p.siteId, shiftTypeId: p.shiftTypeId })) },
      })
    : [];

  const data = records.map((r) => {
    const requiredOfficers = findApplicableRequiredOfficers(requirements, r.siteId, r.shiftTypeId, r.date);
    const coveredCount = r.attendanceRecords.filter((a) => COVERING_STATUSES.includes(a.status)).length;
    return {
      operationsRecordId: r.id,
      siteId: r.siteId,
      siteName: r.site.siteName,
      clientId: r.clientId,
      clientName: r.client.name,
      shiftTypeId: r.shiftTypeId,
      shiftTypeName: r.shiftType.name,
      date: r.date,
      reviewStatus: r.reviewStatus,
      requiredOfficers,
      coveredCount,
      coveragePercent: requiredOfficers ? Math.round((coveredCount / requiredOfficers) * 100) : null,
    };
  });

  return {
    data,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

// When an employee has more than one attendance outcome on the same day
// (e.g. day + night shift both logged), the box for that day shows whichever
// status ranks highest here — problems surface first rather than being
// masked by a "worked fine" outcome recorded on a different shift the same
// day. "SCHEDULED" (roster entry exists, no attendance recorded yet) is
// always the lowest priority — any real outcome overrides it.
const CALENDAR_STATUS_PRIORITY: (AttendanceStatus | "SCHEDULED")[] = [
  "ABSENT",
  "LEAVE",
  "APPROVED_ABSENCE",
  "OTHER",
  "REPLACEMENT",
  "EXTRA_SHIFT",
  "PRESENT",
  "SCHEDULED",
];
const CALENDAR_STATUS_RANK = new Map(CALENDAR_STATUS_PRIORITY.map((s, i) => [s, i]));

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Builds a per-employee, day-by-day attendance grid for the given date
 * range — one box per employee per day — so coverage gaps (who was absent,
 * who has no data at all) are visible at a glance instead of buried in the
 * OperationsRecord/AttendanceRecord list views. Never stored, recomputed on
 * every read, same principle as coverage% elsewhere in this module.
 *
 * Each day's box is one of: an AttendanceStatus (an outcome was actually
 * recorded), "SCHEDULED" (a roster entry exists for that day but no
 * attendance was recorded yet — the shift hasn't been logged), or absent
 * from `cells` entirely (nothing scheduled, nothing recorded).
 */
export async function getAttendanceCalendar(query: AttendanceCalendarQuery) {
  const { dateFrom, dateTo, siteId, clientId, employeeId, shiftTypeId } = query;

  const days: string[] = [];
  for (
    let t = new Date(Date.UTC(dateFrom.getUTCFullYear(), dateFrom.getUTCMonth(), dateFrom.getUTCDate()));
    t.getTime() <= dateTo.getTime();
    t.setUTCDate(t.getUTCDate() + 1)
  ) {
    days.push(dateKey(t));
  }

  const attendanceRecords = await prisma.attendanceRecord.findMany({
    where: {
      operationsRecord: {
        date: { gte: dateFrom, lte: dateTo },
        ...(siteId ? { siteId } : {}),
        ...(clientId ? { clientId } : {}),
        ...(shiftTypeId ? { shiftTypeId } : {}),
      },
      ...(employeeId ? { employeeId } : {}),
    },
    select: {
      employeeId: true,
      status: true,
      employee: { select: { id: true, fullName: true } },
      operationsRecord: { select: { date: true } },
    },
  });

  const rosterEntries = await prisma.rosterEntry.findMany({
    where: {
      date: { gte: dateFrom, lte: dateTo },
      status: "SCHEDULED",
      ...(siteId ? { siteId } : {}),
      ...(clientId ? { clientId } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(shiftTypeId ? { shiftTypeId } : {}),
    },
    select: {
      employeeId: true,
      date: true,
      employee: { select: { id: true, fullName: true } },
    },
  });

  const employeesById = new Map<string, { id: string; fullName: string }>();
  for (const a of attendanceRecords) employeesById.set(a.employee.id, a.employee);
  for (const r of rosterEntries) employeesById.set(r.employee.id, r.employee);

  // With no site/client/employee filter at all, still list every ACTIVE
  // employee — a guard with a completely blank month is exactly the gap
  // this view exists to surface, and they'd otherwise never appear.
  if (!siteId && !clientId && !employeeId) {
    const activeEmployees = await prisma.employee.findMany({
      where: { employmentStatus: "ACTIVE" },
      select: { id: true, fullName: true },
    });
    for (const e of activeEmployees) employeesById.set(e.id, e);
  } else if (employeeId && !employeesById.has(employeeId)) {
    const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, fullName: true } });
    if (emp) employeesById.set(emp.id, emp);
  }

  const cellsByEmployee = new Map<string, Map<string, AttendanceStatus | "SCHEDULED">>();

  for (const a of attendanceRecords) {
    const key = dateKey(a.operationsRecord.date);
    if (!cellsByEmployee.has(a.employeeId)) cellsByEmployee.set(a.employeeId, new Map());
    const empCells = cellsByEmployee.get(a.employeeId)!;
    const existing = empCells.get(key);
    if (!existing || (CALENDAR_STATUS_RANK.get(a.status) ?? 99) < (CALENDAR_STATUS_RANK.get(existing) ?? 99)) {
      empCells.set(key, a.status);
    }
  }

  for (const r of rosterEntries) {
    const key = dateKey(r.date);
    if (!cellsByEmployee.has(r.employeeId)) cellsByEmployee.set(r.employeeId, new Map());
    const empCells = cellsByEmployee.get(r.employeeId)!;
    if (!empCells.has(key)) empCells.set(key, "SCHEDULED");
  }

  const employees = Array.from(employeesById.values())
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((emp) => {
      const empCells = cellsByEmployee.get(emp.id) ?? new Map<string, AttendanceStatus | "SCHEDULED">();
      const cells: Record<string, AttendanceStatus | "SCHEDULED"> = {};
      const summary = {
        present: 0, absent: 0, leave: 0, approvedAbsence: 0,
        replacement: 0, extraShift: 0, other: 0, scheduledNoData: 0,
      };

      for (const day of days) {
        const status = empCells.get(day);
        if (!status) continue;
        cells[day] = status;
        switch (status) {
          case "PRESENT": summary.present++; break;
          case "ABSENT": summary.absent++; break;
          case "LEAVE": summary.leave++; break;
          case "APPROVED_ABSENCE": summary.approvedAbsence++; break;
          case "REPLACEMENT": summary.replacement++; break;
          case "EXTRA_SHIFT": summary.extraShift++; break;
          case "OTHER": summary.other++; break;
          case "SCHEDULED": summary.scheduledNoData++; break;
        }
      }

      return { employeeId: emp.id, employeeName: emp.fullName, cells, summary };
    });

  return {
    dateFrom: dateKey(dateFrom),
    dateTo: dateKey(dateTo),
    days,
    employees,
  };
}

/**
 * Picks the SiteRequirement in force for a given siteId/shiftTypeId/date —
 * the most recent one (by effectiveFrom) whose effective range covers that
 * date. Returns null (not 0) when no requirement is configured at all, so
 * callers can distinguish "not covered" from "no target was ever set."
 */
function findApplicableRequiredOfficers(
  requirements: SiteRequirementRow[],
  siteId: string,
  shiftTypeId: string,
  date: Date
): number | null {
  const applicable = requirements
    .filter((r) => r.siteId === siteId && r.shiftTypeId === shiftTypeId)
    .filter((r) => r.effectiveFrom.getTime() <= date.getTime())
    .filter((r) => !r.effectiveTo || r.effectiveTo.getTime() >= date.getTime())
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());

  return applicable.length > 0 ? applicable[0].requiredOfficers : null;
}

/**
 * Creates an AttendanceRecord under an OperationsRecord ("who actually
 * showed up, and how"). Validates the parent OperationsRecord (URL path,
 * 404 if missing — same treatment as every other :id lookup), then the
 * body-provided foreign keys (400 if missing, same treatment as siteId/
 * shiftTypeId on OperationsRecord create): employeeId always; rosterEntryId
 * and replacementForEmployeeId only if provided. The
 * replacementForEmployeeId required/blocked rule itself is enforced in
 * validation, not here.
 *
 * The DB-level @@unique([operationsRecordId, employeeId]) prevents a
 * second attendance row for the same person on the same operations
 * record; that violation surfaces as a clean 409 via the shared error
 * handler's P2002 handling, same as every other unique-constraint case
 * in this codebase.
 */
export async function createAttendanceRecord(
  operationsRecordId: string,
  input: AttendanceRecordCreateInput
) {
  await ensureOperationsRecordExists(operationsRecordId);
  await ensureEmployeeExists(input.employeeId);
  if (input.rosterEntryId) {
    await ensureRosterEntryExists(input.rosterEntryId);
  }
  if (input.replacementForEmployeeId) {
    await ensureEmployeeExists(input.replacementForEmployeeId);
  }

  return prisma.attendanceRecord.create({
    data: {
      operationsRecordId,
      employeeId: input.employeeId,
      status: input.status,
      rosterEntryId: input.rosterEntryId ?? null,
      replacementForEmployeeId: input.replacementForEmployeeId ?? null,
      notes: input.notes,
    },
    include: {
      employee: { select: { id: true, fullName: true } },
      replacementForEmployee: { select: { id: true, fullName: true } },
    },
  });
}

/** Lists AttendanceRecords for one OperationsRecord (nested resource — no separate pagination, mirrors the parent record's own attendanceRecords include). */
export async function listAttendanceRecords(operationsRecordId: string) {
  await ensureOperationsRecordExists(operationsRecordId);

  return prisma.attendanceRecord.findMany({
    where: { operationsRecordId },
    orderBy: { dateCreated: "asc" },
    include: {
      employee: { select: { id: true, fullName: true } },
      replacementForEmployee: { select: { id: true, fullName: true } },
      rosterEntry: { select: { id: true, date: true, shiftTypeId: true, status: true } },
    },
  });
}

async function ensureOperationsRecordExists(id: string) {
  const exists = await prisma.operationsRecord.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    throw ApiError.notFound(`Operations record ${id} not found.`);
  }
}

async function ensureEmployeeExists(employeeId: string) {
  const exists = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Employee ${employeeId} does not exist.`);
  }
}

async function ensureRosterEntryExists(rosterEntryId: string) {
  const exists = await prisma.rosterEntry.findUnique({ where: { id: rosterEntryId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Roster entry ${rosterEntryId} does not exist.`);
  }
}

function buildWhere(query: OperationsListQuery): Prisma.OperationsRecordWhereInput {
  const where: Prisma.OperationsRecordWhereInput = {};
  if (query.siteId) where.siteId = query.siteId;
  if (query.clientId) where.clientId = query.clientId;
  if (query.shiftTypeId) where.shiftTypeId = query.shiftTypeId;
  if (query.reviewStatus) where.reviewStatus = query.reviewStatus;
  if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom ? { gte: query.dateFrom } : {}),
      ...(query.dateTo ? { lte: query.dateTo } : {}),
    };
  }
  return where;
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

async function ensureActiveShiftTypeExists(shiftTypeId: string) {
  const shiftType = await prisma.shiftType.findUnique({
    where: { id: shiftTypeId },
    select: { id: true, isActive: true },
  });
  if (!shiftType) {
    throw ApiError.badRequest(`Shift type ${shiftTypeId} does not exist.`);
  }
  if (!shiftType.isActive) {
    throw ApiError.badRequest(
      `Shift type ${shiftTypeId} is not active. Reactivate it first if this operations record needs it.`
    );
  }
}
