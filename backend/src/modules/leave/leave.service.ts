import { prisma } from "../../lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

// ─── Accrual helpers ────────────────────────────────────────────────────────

/**
 * Returns the calendar month (year, month 1-12) from which accrual should
 * start for an employee. We use contractStartDate if set, else dateAdded.
 * Accrual starts from the FIRST of that month.
 */
function accrualStartDate(employee: {
  contractStartDate: Date | null;
  dateAdded: Date;
}): { year: number; month: number } {
  const d = employee.contractStartDate ?? employee.dateAdded;
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * Returns all year+month pairs from start (inclusive) up to and including
 * the current calendar month.
 */
function monthsBetween(
  start: { year: number; month: number }
): Array<{ year: number; month: number }> {
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const endMonth = now.getUTCMonth() + 1;

  const result: Array<{ year: number; month: number }> = [];
  let y = start.year;
  let m = start.month;

  while (y < endYear || (y === endYear && m <= endMonth)) {
    result.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

/**
 * Lazily writes missing LeaveAccrual rows for every calendar month from the
 * employee's start date up to the current month. Already-existing rows are
 * skipped (unique constraint + createMany skipDuplicates). Returns the number
 * of new rows created.
 */
export async function catchUpAccruals(employeeId: string): Promise<number> {
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { contractStartDate: true, dateAdded: true },
  });

  const start = accrualStartDate(employee);
  const months = monthsBetween(start);

  const result = await prisma.leaveAccrual.createMany({
    data: months.map(({ year, month }) => ({
      employeeId,
      accrualYear: year,
      accrualMonth: month,
      days: new Decimal(2),
    })),
    skipDuplicates: true,
  });

  return result.count;
}

// ─── Balance query ───────────────────────────────────────────────────────────

export interface LeaveBalance {
  accrued: number;   // total days ever accrued
  used: number;      // total days deducted
  balance: number;   // accrued - used
}

export async function getLeaveBalance(employeeId: string): Promise<LeaveBalance> {
  await catchUpAccruals(employeeId);

  const [accruals, deductions] = await Promise.all([
    prisma.leaveAccrual.aggregate({
      where: { employeeId },
      _sum: { days: true },
    }),
    prisma.leaveDeduction.aggregate({
      where: { employeeId },
      _sum: { days: true },
    }),
  ]);

  const accrued = Number(accruals._sum.days ?? 0);
  const used = Number(deductions._sum.days ?? 0);
  return { accrued, used, balance: accrued - used };
}

// ─── Accrual list ────────────────────────────────────────────────────────────

export async function listAccruals(employeeId: string) {
  await catchUpAccruals(employeeId);
  return prisma.leaveAccrual.findMany({
    where: { employeeId },
    orderBy: [{ accrualYear: "desc" }, { accrualMonth: "desc" }],
  });
}

// ─── Deductions ──────────────────────────────────────────────────────────────

export interface DeductionInput {
  days: number;
  deductionDate: Date;
  reason?: string | null;
  recordedBy?: string | null;
}

export async function addDeduction(employeeId: string, input: DeductionInput) {
  // Verify employee exists
  await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { id: true } });

  return prisma.leaveDeduction.create({
    data: {
      employeeId,
      days: new Decimal(input.days),
      deductionDate: input.deductionDate,
      reason: input.reason ?? null,
      recordedBy: input.recordedBy ?? null,
    },
  });
}

export async function listDeductions(employeeId: string) {
  return prisma.leaveDeduction.findMany({
    where: { employeeId },
    orderBy: { deductionDate: "desc" },
  });
}

export async function deleteDeduction(id: string) {
  const existing = await prisma.leaveDeduction.findUnique({ where: { id } });
  if (!existing) throw Object.assign(new Error("Deduction not found"), { status: 404 });
  return prisma.leaveDeduction.delete({ where: { id } });
}
