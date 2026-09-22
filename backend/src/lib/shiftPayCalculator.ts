import { prisma } from "./prisma";

// Attendance statuses that count as an "extra" shift — beyond the
// employee's own roster allocation, paid at extraShiftRate. Both a
// REPLACEMENT (covering for an absent colleague) and an EXTRA_SHIFT
// (unscheduled walk-in coverage) are "additional shifts worked" per
// Section 7/8 of the 2026-09-10 scope document.
const EXTRA_STATUSES = ["REPLACEMENT", "EXTRA_SHIFT"] as const;

// Statuses that don't reduce base pay — the employee was scheduled, so
// shiftsScheduled x shiftRate already covers this day. This is what makes
// leave "protected" per the user's confirmed formula (2026-09-10).
const NO_CHARGE_STATUSES = ["LEAVE", "APPROVED_ABSENCE"] as const;

export interface ShiftPayCounts {
  shiftsScheduled: number;
  shiftsCovered: number;
  shiftsExtra: number;
  shiftsAbsent: number;
  shiftsLeave: number;
  shiftsOther: number;
}

export interface ShiftPayCalculation {
  contract: {
    id: string;
    payType: string;
    shiftRate: number | null;
    extraShiftRate: number | null;
  } | null;
  counts: ShiftPayCounts;
  // Raw numbers, not formatted strings — callers decide how to present
  // (the preview endpoint formats to 2dp strings; run generation uses
  // these directly in further arithmetic before rounding once at the end).
  normalShiftPay: number | null;
  extraShiftPay: number | null;
  warnings: string[];
}

/**
 * Calculates shift-based pay counts and amounts for one employee over one
 * period, from Roster + Attendance data. Shared by the read-only
 * shift-pay-preview endpoint AND payroll run generation, so the two can
 * never silently drift out of sync with each other.
 *
 * Only AttendanceRecords belonging to an OperationsRecord with
 * reviewStatus = APPROVED are counted. Pending/rejected records are
 * excluded and surfaced as a warning instead, so payroll never silently
 * pays (or docks) someone based on an unreviewed report.
 *
 * Does NOT look up or validate that the employee exists — callers already
 * have an employee id from a context where that's been established
 * (either validated by the preview endpoint, or because we're iterating
 * live Employee records during run generation).
 */
export async function calculateShiftPay(
  employeeId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<ShiftPayCalculation> {
  const contract = await prisma.employeeContract.findFirst({
    where: {
      employeeId,
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
    },
    // Two contracts can share the same startDate (e.g. a correction
    // superseding an earlier one entered the same day) — dateCreated as
    // a tiebreaker makes the choice deterministic instead of depending on
    // undefined database row order.
    orderBy: [{ startDate: "desc" }, { dateCreated: "desc" }],
  });

  const shiftsScheduled = await prisma.rosterEntry.count({
    where: {
      employeeId,
      status: "SCHEDULED",
      date: { gte: periodStart, lte: periodEnd },
    },
  });

  // Fetch ALL attendance in the period regardless of review status, so we
  // can both count the approved ones AND warn about the excluded ones.
  const attendanceInPeriod = await prisma.attendanceRecord.findMany({
    where: {
      employeeId,
      operationsRecord: {
        date: { gte: periodStart, lte: periodEnd },
      },
    },
    select: {
      status: true,
      operationsRecord: { select: { reviewStatus: true } },
    },
  });

  const approved = attendanceInPeriod.filter((a) => a.operationsRecord.reviewStatus === "APPROVED");
  const unapprovedCount = attendanceInPeriod.length - approved.length;

  const counts: ShiftPayCounts = {
    shiftsScheduled,
    shiftsCovered: approved.filter((a) => a.status === "PRESENT").length,
    shiftsExtra: approved.filter((a) => EXTRA_STATUSES.includes(a.status as any)).length,
    shiftsAbsent: approved.filter((a) => a.status === "ABSENT").length,
    shiftsLeave: approved.filter((a) => NO_CHARGE_STATUSES.includes(a.status as any)).length,
    shiftsOther: approved.filter((a) => a.status === "OTHER").length,
  };

  const warnings: string[] = [];
  if (unapprovedCount > 0) {
    warnings.push(
      `${unapprovedCount} attendance record(s) in this period belong to operations records that are not yet APPROVED and were excluded from these counts.`
    );
  }
  if (counts.shiftsOther > 0) {
    warnings.push(
      `${counts.shiftsOther} attendance record(s) have status OTHER and need manual classification before finalizing payroll.`
    );
  }

  if (!contract) {
    warnings.push("No employee contract covers this period — rate-based pay could not be calculated.");
    return { contract: null, counts, normalShiftPay: null, extraShiftPay: null, warnings };
  }

  if (contract.payType === "MONTHLY") {
    // Not a warning-worthy problem — MONTHLY employees simply don't use
    // this calculation at all. Caller decides what (if anything) to do.
    return {
      contract: { id: contract.id, payType: contract.payType, shiftRate: null, extraShiftRate: null },
      counts,
      normalShiftPay: null,
      extraShiftPay: null,
      warnings,
    };
  }

  // payType === "SHIFT"
  if (!contract.shiftRate) {
    warnings.push("Contract is SHIFT-paid but has no shiftRate set — pay could not be calculated.");
    return {
      contract: { id: contract.id, payType: contract.payType, shiftRate: null, extraShiftRate: null },
      counts,
      normalShiftPay: null,
      extraShiftPay: null,
      warnings,
    };
  }

  const rate = Number(contract.shiftRate);
  const extraRate = contract.extraShiftRate ? Number(contract.extraShiftRate) : rate;

  return {
    contract: { id: contract.id, payType: contract.payType, shiftRate: rate, extraShiftRate: extraRate },
    counts,
    normalShiftPay: counts.shiftsScheduled * rate,
    extraShiftPay: counts.shiftsExtra * extraRate,
    warnings,
  };
}
