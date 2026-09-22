import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { SiteCoverageSetInput } from "./site-coverage.validation";

// Mirrors operations.service.ts's COVERING_STATUSES — kept as a separate
// local copy rather than a cross-module import, matching this codebase's
// pattern of each module's service.ts being self-contained. If the
// definition of "actually covering the shift" ever changes, update both.
const COVERING_STATUSES = ["PRESENT", "REPLACEMENT", "EXTRA_SHIFT"];

/**
 * Lists every ACTIVE site with its coverage status for a given day, broken
 * out per active shift type (Day, Night, or however many the org runs) —
 * added 2026-09-21 to replace the earlier single-tick-per-day design. That
 * design had one isCovered per site/day, so a supervisor ticking the
 * morning shift and then the evening shift on the same site/day was really
 * just overwriting the same field twice; there was no way to hold "Day:
 * Covered, Night: unmarked" as two separate facts. Now every site gets one
 * row per active ShiftType, each with its own independent tick.
 *
 * A site/shift with no SiteCoverage row yet shows isCovered: null (meaning
 * "not yet marked"), distinct from false ("marked not covered").
 *
 * Each shift entry also carries an `attendanceSignal`, built independently
 * from OperationsRecord/AttendanceRecord for that exact site+date+shift —
 * this manual tick and that recorded attendance are two completely
 * separate systems with no link between them (the tick is often made in
 * real time, before the shift's attendance has been logged), so they can
 * silently disagree. Rather than auto-filling isCovered from attendance
 * (which would either show nothing useful early in the shift or invite
 * rubber-stamping a stale guess), this signal lets the frontend flag a
 * mismatch once real data exists, without changing the manual tick's own
 * behavior.
 */
export async function listCoverageForDate(date: Date) {
  const [sites, shiftTypes, coverageRows, operationsRecords] = await Promise.all([
    prisma.site.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, siteName: true },
      orderBy: { siteName: "asc" },
    }),
    prisma.shiftType.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.siteCoverage.findMany({ where: { date } }),
    prisma.operationsRecord.findMany({
      where: { date },
      select: {
        siteId: true,
        shiftTypeId: true,
        attendanceRecords: { select: { status: true } },
      },
    }),
  ]);

  const key = (siteId: string, shiftTypeId: string) => `${siteId}:${shiftTypeId}`;

  const coverageByKey = new Map(coverageRows.map((row) => [key(row.siteId, row.shiftTypeId), row]));

  interface ShiftAttendance { totalCount: number; coveredCount: number }
  const attendanceByKey = new Map<string, ShiftAttendance>();
  for (const rec of operationsRecords) {
    const k = key(rec.siteId, rec.shiftTypeId);
    const existing = attendanceByKey.get(k) ?? { totalCount: 0, coveredCount: 0 };
    existing.totalCount += rec.attendanceRecords.length;
    existing.coveredCount += rec.attendanceRecords.filter((a) => COVERING_STATUSES.includes(a.status)).length;
    attendanceByKey.set(k, existing);
  }

  return sites.map((site) => ({
    siteId: site.id,
    siteName: site.siteName,
    date,
    shifts: shiftTypes.map((st) => {
      const k = key(site.id, st.id);
      const row = coverageByKey.get(k);
      const attendance = attendanceByKey.get(k);
      return {
        shiftTypeId: st.id,
        shiftTypeName: st.name,
        isCovered: row ? row.isCovered : null,
        notes: row?.notes ?? null,
        markedByUserId: row?.markedByUserId ?? null,
        lastUpdated: row?.lastUpdated ?? null,
        // null = no operations record logged for this site/date/shift at
        // all yet (nothing to compare against); otherwise the real counts.
        attendanceSignal: attendance
          ? { totalCount: attendance.totalCount, coveredCount: attendance.coveredCount }
          : null,
      };
    }),
  }));
}

/**
 * Sets (creates or updates) one site's coverage status for a given
 * day+shift — an upsert keyed on the @@unique([siteId, date, shiftTypeId])
 * constraint, since this is meant to be a quick repeatable tick, not a
 * create-then-separately-edit flow. Validates siteId and shiftTypeId exist
 * first for a clean 400 instead of a raw FK error. `markedByUserId` is
 * passed in by the controller from the authenticated request, not accepted
 * from the request body — who actually ticked it should never be
 * spoofable by the caller.
 */
export async function setSiteCoverage(input: SiteCoverageSetInput, markedByUserId: string | null) {
  const [site, shiftType] = await Promise.all([
    prisma.site.findUnique({ where: { id: input.siteId }, select: { id: true } }),
    prisma.shiftType.findUnique({ where: { id: input.shiftTypeId }, select: { id: true } }),
  ]);
  if (!site) {
    throw ApiError.badRequest(`Site ${input.siteId} does not exist.`);
  }
  if (!shiftType) {
    throw ApiError.badRequest(`Shift type ${input.shiftTypeId} does not exist.`);
  }

  // null means "reset to unmarked" — delete the row so this site/shift
  // shows as "not yet marked" (no row), matching how listCoverageForDate
  // works.
  if (input.isCovered === null) {
    await prisma.siteCoverage.deleteMany({
      where: { siteId: input.siteId, date: input.date, shiftTypeId: input.shiftTypeId },
    });
    return { siteId: input.siteId, date: input.date, shiftTypeId: input.shiftTypeId, isCovered: null };
  }

  return prisma.siteCoverage.upsert({
    where: {
      siteId_date_shiftTypeId: { siteId: input.siteId, date: input.date, shiftTypeId: input.shiftTypeId },
    },
    create: {
      siteId: input.siteId,
      date: input.date,
      shiftTypeId: input.shiftTypeId,
      isCovered: input.isCovered,
      notes: input.notes,
      markedByUserId,
    },
    update: {
      isCovered: input.isCovered,
      notes: input.notes,
      markedByUserId,
    },
  });
}
