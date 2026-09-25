import { PayrollStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { calculateShiftPay } from "../../lib/shiftPayCalculator";
import { calculateStatutoryAmount, calculateStatutoryEmployerAmount, isEligibleForRule } from "../../lib/statutoryCalculator";
import {
  ShiftPayPreviewQuery,
  PayrollRunCreateInput,
  PayrollRunListQuery,
  LineItemUpdateInput,
  AllowanceCreateInput,
  DeductionCreateInput,
  StatusActionInput,
  ApplyStatutoryDeductionsInput,
} from "./payroll.validation";

// ---------- Shift-pay preview (Phase 4 — unchanged behavior, now backed
// by the shared calculateShiftPay helper instead of its own copy of the
// counting logic) ----------

/**
 * Calculates a READ-ONLY shift-pay preview for one employee over one
 * period. This is deliberately NOT a payroll run — it previews the counts
 * and the one clean formula (scheduled shifts x rate), but does not
 * create any persisted record. See calculateShiftPay for the full
 * counting rules, shared with actual run generation below.
 */
export async function getShiftPayPreview(query: ShiftPayPreviewQuery) {
  const employee = await prisma.employee.findUnique({
    where: { id: query.employeeId },
    select: { id: true, fullName: true },
  });
  if (!employee) {
    throw ApiError.badRequest(`Employee ${query.employeeId} does not exist.`);
  }

  const calc = await calculateShiftPay(query.employeeId, query.periodStart, query.periodEnd);
  const warnings = [...calc.warnings];

  if (calc.contract?.payType === "MONTHLY") {
    warnings.push(
      "This employee's contract for this period is paid MONTHLY, not SHIFT — this shift-pay preview does not apply. Use the monthly salary structure instead."
    );
  }

  const fmt = (n: number | null) => (n === null ? null : n.toFixed(2));
  const gross =
    calc.normalShiftPay !== null && calc.extraShiftPay !== null
      ? calc.normalShiftPay + calc.extraShiftPay
      : null;

  return {
    employee: { id: employee.id, fullName: employee.fullName },
    period: { start: query.periodStart, end: query.periodEnd },
    payType: calc.contract?.payType ?? null,
    shiftRate: fmt(calc.contract?.shiftRate ?? null),
    extraShiftRate: fmt(calc.contract?.extraShiftRate ?? null),
    counts: calc.counts,
    pay: {
      normalShiftPay: fmt(calc.normalShiftPay),
      extraShiftPay: fmt(calc.extraShiftPay),
      estimatedGrossBeforeChargesAndAllowances: fmt(gross),
    },
    note:
      "This is a read-only preview, not a payroll run. Charges (e.g. for ABSENT shifts) and any overtime/extra-pay adjustments beyond the standard extraShiftRate are always entered manually in the Payroll module — never auto-derived from these counts.",
    warnings,
  };
}

// ---------- Shared helpers ----------

/** First and last calendar day of the month containing `period`. */
function getMonthRange(period: Date): { start: Date; end: Date } {
  const start = new Date(period.getFullYear(), period.getMonth(), 1);
  const end = new Date(period.getFullYear(), period.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Recalculates a line item's totalAllowances/totalDeductions/grossPay/netPay
 * from its own fields + related rows, and persists them. Does NOT touch
 * the parent run's totals — call recalcRunTotals after.
 */
async function recalcLineItem(lineItemId: string) {
  const item = await prisma.payrollLineItem.findUniqueOrThrow({
    where: { id: lineItemId },
    include: { allowances: true, deductions: true },
  });

  const totalAllowances = round2(item.allowances.reduce((sum, a) => sum + Number(a.amount), 0));
  const totalDeductions = round2(item.deductions.reduce((sum, d) => sum + Number(d.amount), 0));

  const basicSalary = Number(item.basicSalary);
  const overtime = Number(item.overtime);
  const bonuses = Number(item.bonuses);
  const otherAdjustments = Number(item.otherAdjustments);
  const advances = Number(item.advances);
  const extraShiftPay = item.extraShiftPay ? Number(item.extraShiftPay) : 0;

  // grossPay = basicSalary + extraShiftPay (SHIFT only) + overtime (MONTHLY
  // only, but harmless to include unconditionally since it's 0 for SHIFT)
  // + bonuses + otherAdjustments + totalAllowances.
  // netPay = grossPay - totalDeductions - advances.
  // Matches PHASE_5_PAYROLL_DESIGN.md exactly.
  const grossPay = round2(basicSalary + extraShiftPay + overtime + bonuses + otherAdjustments + totalAllowances);
  const netPay = round2(grossPay - totalDeductions - advances);

  return prisma.payrollLineItem.update({
    where: { id: lineItemId },
    data: { totalAllowances, totalDeductions, grossPay, netPay },
    include: { allowances: { include: { allowanceType: true } }, deductions: { include: { deductionType: true } } },
  });
}

/** Recalculates a run's cached totals from its current line items and persists them. */
async function recalcRunTotals(payrollRunId: string) {
  const items = await prisma.payrollLineItem.findMany({ where: { payrollRunId } });
  const totalGrossPay = round2(items.reduce((sum, i) => sum + Number(i.grossPay), 0));
  const totalDeductions = round2(
    items.reduce((sum, i) => sum + Number(i.totalDeductions) + Number(i.advances), 0)
  );
  const totalNetPay = round2(items.reduce((sum, i) => sum + Number(i.netPay), 0));

  await prisma.payrollRun.update({
    where: { id: payrollRunId },
    data: { totalGrossPay, totalDeductions, totalNetPay },
  });
}

/** Throws a 409 if the run isn't in DRAFT — every line-item-editing operation requires this. */
async function ensureRunIsDraftAndExists(payrollRunId: string) {
  const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
  if (!run) throw ApiError.notFound(`Payroll run ${payrollRunId} not found.`);
  if (run.status !== "DRAFT") {
    throw ApiError.conflict(
      `Payroll run is ${run.status}, not DRAFT — line items can only be edited while a run is in Draft.`
    );
  }
  return run;
}

// ---------- PayrollRun creation (generation) ----------

/**
 * Creates a new PayrollRun and generates one PayrollLineItem per eligible
 * employee, using the exact same shift-counting logic as the preview
 * endpoint (calculateShiftPay). Employees with no contract covering the
 * period are skipped, not defaulted to zero — a payroll run should never
 * silently invent pay data for someone it has no contract for.
 */
export async function createPayrollRun(input: PayrollRunCreateInput) {
  // Prevent two runs for the exact same period + scope, per the schema's
  // own comment on PayrollRun — this is an application-layer rule, not a
  // DB constraint, matching the project's established validation approach.
  const duplicate = await prisma.payrollRun.findFirst({
    where: {
      period: input.period,
      clientId: input.clientId ?? null,
      siteId: input.siteId ?? null,
    },
  });
  if (duplicate) {
    throw ApiError.conflict(
      `A payroll run already exists for this period and scope (run id ${duplicate.id}).`
    );
  }

  if (input.clientId) {
    const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true } });
    if (!client) throw ApiError.badRequest(`Client ${input.clientId} does not exist.`);
  }
  if (input.siteId) {
    const site = await prisma.site.findUnique({ where: { id: input.siteId }, select: { id: true } });
    if (!site) throw ApiError.badRequest(`Site ${input.siteId} does not exist.`);
  }

  const { start: periodStart, end: periodEnd } = getMonthRange(input.period);

  const employees = await prisma.employee.findMany({
    where: {
      employmentStatus: "ACTIVE",
      ...(input.clientId ? { assignedClientId: input.clientId } : {}),
      ...(input.siteId ? { assignedSiteId: input.siteId } : {}),
    },
  });

  const skipped: { employeeId: string; fullName: string; reason: string }[] = [];
  const lineItemsData: any[] = [];

  // Salary advances flagged CURRENT_PERIOD (an early payment of THIS
  // period's wages, e.g. the boss handing a guard cash before the run is
  // generated) are pulled in and netted off automatically here, per
  // employee, so nobody has to remember to type them into `advances` by
  // hand and the employee isn't shown owing/unpaid for money already in
  // their pocket. Keyed by employeeId so we can settle the matching rows
  // once line items exist below. LOAN-type advances are untouched —
  // still manual, unchanged, existing behavior.
  const advancesByEmployee = new Map<string, { ids: string[]; total: number }>();
  for (const employee of employees) {
    const pendingAdvances = await prisma.salaryAdvance.findMany({
      where: {
        employeeId: employee.id,
        status: "ACTIVE",
        advanceType: "CURRENT_PERIOD",
        settledInPayrollLineItemId: null,
        advanceDate: { gte: periodStart, lte: periodEnd },
      },
      select: { id: true, amount: true },
    });
    if (pendingAdvances.length > 0) {
      advancesByEmployee.set(employee.id, {
        ids: pendingAdvances.map((a) => a.id),
        total: pendingAdvances.reduce((sum, a) => sum + Number(a.amount), 0),
      });
    }
  }

  for (const employee of employees) {
    const contract = await prisma.employeeContract.findFirst({
      where: {
        employeeId: employee.id,
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
      },
      orderBy: [{ startDate: "desc" }, { dateCreated: "desc" }],
    });

    if (!contract) {
      skipped.push({
        employeeId: employee.id,
        fullName: employee.fullName,
        reason: "No employee contract covers this period.",
      });
      continue;
    }

    if (contract.payType === "MONTHLY") {
      if (contract.salary === null) {
        skipped.push({
          employeeId: employee.id,
          fullName: employee.fullName,
          reason: "MONTHLY contract has no salary set.",
        });
        continue;
      }
      const basicSalary = Number(contract.salary);
      lineItemsData.push({
        employeeId: employee.id,
        employeeContractId: contract.id,
        fullNameSnapshot: employee.fullName,
        positionSnapshot: employee.position,
        payType: "MONTHLY",
        basicSalary,
        advances: advancesByEmployee.get(employee.id)?.total ?? 0,
        grossPay: basicSalary, // placeholder — recalculated properly via recalcLineItem below
        netPay: basicSalary,
      });
    } else {
      // SHIFT
      const calc = await calculateShiftPay(employee.id, periodStart, periodEnd);
      if (calc.normalShiftPay === null) {
        skipped.push({
          employeeId: employee.id,
          fullName: employee.fullName,
          reason: "SHIFT contract has no shiftRate set — pay could not be calculated.",
        });
        continue;
      }
      lineItemsData.push({
        employeeId: employee.id,
        employeeContractId: contract.id,
        fullNameSnapshot: employee.fullName,
        positionSnapshot: employee.position,
        payType: "SHIFT",
        basicSalary: calc.normalShiftPay,
        shiftsScheduled: calc.counts.shiftsScheduled,
        shiftsCovered: calc.counts.shiftsCovered,
        shiftsExtra: calc.counts.shiftsExtra,
        shiftRate: calc.contract!.shiftRate,
        extraShiftRate: calc.contract!.extraShiftRate,
        normalShiftPay: calc.normalShiftPay,
        extraShiftPay: calc.extraShiftPay,
        advances: advancesByEmployee.get(employee.id)?.total ?? 0,
        grossPay: calc.normalShiftPay + (calc.extraShiftPay ?? 0), // placeholder — recalculated below
        netPay: calc.normalShiftPay + (calc.extraShiftPay ?? 0),
      });
    }
  }

  if (lineItemsData.length === 0) {
    throw ApiError.badRequest(
      `No eligible employees found for this period/scope. ${skipped.length} employee(s) were considered and skipped — check contracts cover this period.`
    );
  }

  const run = await prisma.payrollRun.create({
    data: {
      period: input.period,
      clientId: input.clientId ?? null,
      siteId: input.siteId ?? null,
      createdBy: input.createdBy ?? null,
      notes: input.notes ?? null,
    },
  });

  await prisma.payrollLineItem.createMany({
    data: lineItemsData.map((d) => ({ ...d, payrollRunId: run.id })),
  });

  // Recalculate every line item properly (correct gross/net using the
  // shared formula) now that they all have real ids, then roll up totals.
  const createdItems = await prisma.payrollLineItem.findMany({ where: { payrollRunId: run.id } });
  for (const item of createdItems) {
    await recalcLineItem(item.id);
  }
  await recalcRunTotals(run.id);

  // Now that line items have real ids, mark the CURRENT_PERIOD advances
  // gathered above as settled against this specific line item — this is
  // what stops them being pulled into a later run and prevents the
  // employee showing as unpaid for wages they already received.
  let settledAdvancesCount = 0;
  for (const item of createdItems) {
    const pending = advancesByEmployee.get(item.employeeId);
    if (!pending) continue;
    await prisma.salaryAdvance.updateMany({
      where: { id: { in: pending.ids } },
      data: {
        status: "FULLY_REPAID",
        settledInPayrollLineItemId: item.id,
      },
    });
    // amountRepaid/outstandingBalance need each row's own `amount`, which
    // updateMany can't reference — set them per row.
    for (const advanceId of pending.ids) {
      const advance = await prisma.salaryAdvance.findUnique({ where: { id: advanceId }, select: { amount: true } });
      if (advance) {
        await prisma.salaryAdvance.update({
          where: { id: advanceId },
          data: { amountRepaid: advance.amount, outstandingBalance: 0 },
        });
      }
    }
    settledAdvancesCount += pending.ids.length;
  }

  await prisma.payrollAuditLog.create({
    data: {
      payrollRunId: run.id,
      action: "CREATED",
      performedBy: input.createdBy ?? "unknown",
      details: `Generated ${createdItems.length} line item(s); ${skipped.length} employee(s) skipped.`
        + (settledAdvancesCount > 0 ? ` ${settledAdvancesCount} salary advance(s) auto-settled against this run.` : ""),
    },
  });

  return getPayrollRunById(run.id, { skippedEmployees: skipped });
}

// ---------- Read ----------

export async function listPayrollRuns(query: PayrollRunListQuery) {
  return prisma.payrollRun.findMany({
    where: {
      ...(query.status ? { status: query.status as PayrollStatus } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.siteId ? { siteId: query.siteId } : {}),
    },
    orderBy: { period: "desc" },
    include: { _count: { select: { lineItems: true } } },
  });
}

export async function getPayrollRunById(
  id: string,
  extra?: { skippedEmployees?: { employeeId: string; fullName: string; reason: string }[] }
) {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      lineItems: {
        include: {
          allowances: { include: { allowanceType: true } },
          deductions: { include: { deductionType: true } },
        },
        orderBy: { fullNameSnapshot: "asc" },
      },
      auditLogs: { orderBy: { performedAt: "asc" } },
    },
  });
  if (!run) throw ApiError.notFound(`Payroll run ${id} not found.`);

  return extra?.skippedEmployees ? { ...run, skippedEmployees: extra.skippedEmployees } : run;
}

async function getLineItemOrThrow(payrollRunId: string, lineItemId: string) {
  const item = await prisma.payrollLineItem.findUnique({ where: { id: lineItemId } });
  if (!item || item.payrollRunId !== payrollRunId) {
    throw ApiError.notFound(`Line item ${lineItemId} not found on payroll run ${payrollRunId}.`);
  }
  return item;
}

// ---------- Line item editing (Draft only) ----------

export async function updateLineItem(payrollRunId: string, lineItemId: string, input: LineItemUpdateInput) {
  await ensureRunIsDraftAndExists(payrollRunId);
  await getLineItemOrThrow(payrollRunId, lineItemId);

  await prisma.payrollLineItem.update({
    where: { id: lineItemId },
    data: input,
  });

  const updated = await recalcLineItem(lineItemId);
  await recalcRunTotals(payrollRunId);
  return updated;
}

export async function addAllowance(payrollRunId: string, lineItemId: string, input: AllowanceCreateInput) {
  await ensureRunIsDraftAndExists(payrollRunId);
  await getLineItemOrThrow(payrollRunId, lineItemId);

  const allowanceType = await prisma.allowanceType.findUnique({ where: { id: input.allowanceTypeId } });
  if (!allowanceType) throw ApiError.badRequest(`Allowance type ${input.allowanceTypeId} does not exist.`);

  await prisma.payrollAllowance.create({
    data: {
      payrollLineItemId: lineItemId,
      allowanceTypeId: input.allowanceTypeId,
      amount: input.amount,
      notes: input.notes ?? null,
    },
  });

  const updated = await recalcLineItem(lineItemId);
  await recalcRunTotals(payrollRunId);
  return updated;
}

export async function removeAllowance(payrollRunId: string, lineItemId: string, allowanceId: string) {
  await ensureRunIsDraftAndExists(payrollRunId);
  await getLineItemOrThrow(payrollRunId, lineItemId);

  const allowance = await prisma.payrollAllowance.findUnique({ where: { id: allowanceId } });
  if (!allowance || allowance.payrollLineItemId !== lineItemId) {
    throw ApiError.notFound(`Allowance ${allowanceId} not found on line item ${lineItemId}.`);
  }

  await prisma.payrollAllowance.delete({ where: { id: allowanceId } });

  const updated = await recalcLineItem(lineItemId);
  await recalcRunTotals(payrollRunId);
  return updated;
}

export async function addDeduction(payrollRunId: string, lineItemId: string, input: DeductionCreateInput) {
  await ensureRunIsDraftAndExists(payrollRunId);
  await getLineItemOrThrow(payrollRunId, lineItemId);

  const deductionType = await prisma.deductionType.findUnique({ where: { id: input.deductionTypeId } });
  if (!deductionType) throw ApiError.badRequest(`Deduction type ${input.deductionTypeId} does not exist.`);

  await prisma.payrollDeduction.create({
    data: {
      payrollLineItemId: lineItemId,
      deductionTypeId: input.deductionTypeId,
      amount: input.amount,
      notes: input.notes ?? null,
    },
  });

  const updated = await recalcLineItem(lineItemId);
  await recalcRunTotals(payrollRunId);
  return updated;
}

export async function removeDeduction(payrollRunId: string, lineItemId: string, deductionId: string) {
  await ensureRunIsDraftAndExists(payrollRunId);
  await getLineItemOrThrow(payrollRunId, lineItemId);

  const deduction = await prisma.payrollDeduction.findUnique({ where: { id: deductionId } });
  if (!deduction || deduction.payrollLineItemId !== lineItemId) {
    throw ApiError.notFound(`Deduction ${deductionId} not found on line item ${lineItemId}.`);
  }

  await prisma.payrollDeduction.delete({ where: { id: deductionId } });

  const updated = await recalcLineItem(lineItemId);
  await recalcRunTotals(payrollRunId);
  return updated;
}

// ---------- Workflow: Draft -> Reviewed -> Finalized -> Paid (one-way only) ----------

const NEXT_STATUS: Record<string, string> = {
  DRAFT: "REVIEWED",
  REVIEWED: "FINALIZED",
  FINALIZED: "PAID",
};

async function transition(
  payrollRunId: string,
  fromStatus: "DRAFT" | "REVIEWED" | "FINALIZED",
  input: StatusActionInput,
  stampField: "reviewedBy" | "finalizedBy" | "paidBy",
  atField: "reviewedAt" | "finalizedAt" | "paidAt"
) {
  const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
  if (!run) throw ApiError.notFound(`Payroll run ${payrollRunId} not found.`);
  if (run.status !== fromStatus) {
    throw ApiError.conflict(
      `Payroll run is ${run.status} — this action requires it to be ${fromStatus}. Transitions only move forward, never backward.`
    );
  }

  const toStatus = NEXT_STATUS[fromStatus];
  const updated = await prisma.payrollRun.update({
    where: { id: payrollRunId },
    data: {
      status: toStatus as any,
      [stampField]: input.performedBy,
      [atField]: new Date(),
    },
  });

  if (toStatus === "PAID") {
    await prisma.payrollLineItem.updateMany({
      where: { payrollRunId },
      data: { paymentStatus: "PAID" },
    });
  }

  await prisma.payrollAuditLog.create({
    data: {
      payrollRunId,
      action: "STATUS_CHANGED",
      performedBy: input.performedBy,
      details: `${fromStatus} -> ${toStatus}` + (input.notes ? ` — ${input.notes}` : ""),
    },
  });

  return getPayrollRunById(updated.id);
}

export const reviewPayrollRun = (id: string, input: StatusActionInput) =>
  transition(id, "DRAFT", input, "reviewedBy", "reviewedAt");

export const finalizePayrollRun = (id: string, input: StatusActionInput) =>
  transition(id, "REVIEWED", input, "finalizedBy", "finalizedAt");

export const markPayrollRunPaid = (id: string, input: StatusActionInput) =>
  transition(id, "FINALIZED", input, "paidBy", "paidAt");

// ---------- Phase 5b: statutory deductions (PAYE/NAPSA/NHIMA) ----------

/**
 * Computes and applies PAYE/NAPSA/NHIMA (or any other configured
 * StatutoryRule) as PayrollDeduction rows on every line item in a DRAFT
 * run. Idempotent: re-running this updates the amounts on the deduction
 * rows THIS action created (marked `isStatutory: true`) rather than
 * duplicating them, and never touches a manually-added deduction that
 * happens to share the same DeductionType — see the `isStatutory` field's
 * comment in schema.prisma for why that distinction exists.
 *
 * Applies to gross pay (basicSalary + extraShiftPay + allowances, i.e.
 * PayrollLineItem.grossPay as already computed by recalcLineItem) per the
 * user's explicit 2026-09-11 decision — not basic salary, not per-rule.
 *
 * Only rules active and in effect for the run's period (effectiveFrom <=
 * period <= effectiveTo-or-open-ended) are considered. NAPSA/NHIMA
 * eligibility is gated by the employee's registration flags; every other
 * rule (including PAYE) applies unconditionally — see
 * statutoryCalculator.ts's isEligibleForRule for the exact logic and its
 * known limitation (name-based matching, not a dedicated category field).
 */
export async function applyStatutoryDeductions(payrollRunId: string, input: ApplyStatutoryDeductionsInput) {
  const run = await ensureRunIsDraftAndExists(payrollRunId);

  const applicableRules = await prisma.statutoryRule.findMany({
    where: {
      isActive: true,
      effectiveFrom: { lte: run.period },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.period } }],
    },
    include: { deductionType: true },
  });

  if (applicableRules.length === 0) {
    throw ApiError.badRequest(
      "No active StatutoryRule covers this run's period. Create one via POST /api/statutory-rules first."
    );
  }

  const lineItems = await prisma.payrollLineItem.findMany({
    where: { payrollRunId },
    include: { employee: { select: { napsaRegistered: true, nhimaRegistered: true } } },
  });

  let appliedCount = 0;
  const touchedLineItemIds = new Set<string>();

  for (const item of lineItems) {
    const grossPay = Number(item.grossPay);

    for (const rule of applicableRules) {
      if (!isEligibleForRule(rule, item.employee)) continue;

      const amount = calculateStatutoryAmount(rule, grossPay);

      const existing = await prisma.payrollDeduction.findFirst({
        where: { payrollLineItemId: item.id, deductionTypeId: rule.deductionTypeId, isStatutory: true },
      });

      if (existing) {
        await prisma.payrollDeduction.update({ where: { id: existing.id }, data: { amount } });
      } else {
        await prisma.payrollDeduction.create({
          data: {
            payrollLineItemId: item.id,
            deductionTypeId: rule.deductionTypeId,
            amount,
            isStatutory: true,
            notes: `Auto-applied from statutory rule "${rule.name}".`,
          },
        });
      }
      appliedCount += 1;
      touchedLineItemIds.add(item.id);
    }
  }

  for (const id of touchedLineItemIds) {
    await recalcLineItem(id);
  }
  await recalcRunTotals(payrollRunId);

  await prisma.payrollAuditLog.create({
    data: {
      payrollRunId,
      action: "STATUTORY_DEDUCTIONS_APPLIED",
      performedBy: input.performedBy ?? "unknown",
      details: `Applied ${applicableRules.length} rule(s) across ${touchedLineItemIds.size} line item(s), ${appliedCount} deduction row(s) written/updated.`,
    },
  });

  return getPayrollRunById(payrollRunId);
}
// ---- Payslip generation ----

export async function generatePayslips(runId: string, generatedBy?: string | null) {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: {
      lineItems: {
        include: {
          employee: {
            select: {
              id: true, fullName: true, position: true, employeeNumber: true,
              contractStartDate: true, napsaRegistered: true, nhimaRegistered: true,
              department: { select: { name: true } },
              payrollProfile: { select: { nrcNumber: true } },
            },
          },
          allowances: { include: { allowanceType: { select: { name: true } } } },
          deductions: { include: { deductionType: { select: { name: true } } } },
        },
      },
    },
  });
  if (!run) throw ApiError.notFound(`Payroll run ${runId} not found.`);
  if (!["FINALIZED", "PAID"].includes(run.status))
    throw ApiError.badRequest(`Payslips can only be generated for FINALIZED or PAID runs. Current status: ${run.status}.`);

  const existingCount = await prisma.payslipRecord.count({ where: { payrollRunId: runId } });
  if (existingCount > 0) {
    const existing = await prisma.payslipRecord.findMany({
      where: { payrollRunId: runId },
      include: { employee: { select: { id: true, fullName: true } } },
      orderBy: { employeeName: "asc" },
    });
    return { generated: false, count: existing.length, payslips: existing };
  }

  // Employer-side statutory contributions (NAPSA/NHIMA employer rate) —
  // same rule set applyStatutoryDeductions uses for the employee side.
  const applicableRules = await prisma.statutoryRule.findMany({
    where: {
      isActive: true,
      effectiveFrom: { lte: run.period },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.period } }],
    },
    include: { deductionType: true },
  });

  const period = run.period;
  const prefix = `PSL-${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, "0")}`;
  const payslips = [];
  let seq = 1;

  for (const li of run.lineItems) {
    const grossPay = Number(li.grossPay);
    const allowanceBreakdown = li.allowances.map((a) => ({ name: a.allowanceType.name, amount: Number(a.amount) }));
    const allowancesTotal = round2(allowanceBreakdown.reduce((s, a) => s + a.amount, 0));
    const deductionsTotal = round2(li.deductions.reduce((s, d) => s + Number(d.amount), 0));
    const paye = round2(li.deductions.filter((d) => d.deductionType.name.toUpperCase().includes("PAYE")).reduce((s, d) => s + Number(d.amount), 0));
    const napsa = round2(li.deductions.filter((d) => d.deductionType.name.toUpperCase().includes("NAPSA")).reduce((s, d) => s + Number(d.amount), 0));
    const nhima = round2(li.deductions.filter((d) => d.deductionType.name.toUpperCase().includes("NHIMA")).reduce((s, d) => s + Number(d.amount), 0));

    // Employer contributions — same eligibility gate (napsaRegistered/
    // nhimaRegistered) as the employee-side deductions above.
    let napsaEmployer = 0;
    let nhimaEmployer = 0;
    for (const rule of applicableRules) {
      if (!isEligibleForRule(rule, li.employee)) continue;
      const ruleName = rule.deductionType.name.toUpperCase();
      const employerAmount = calculateStatutoryEmployerAmount(rule, grossPay);
      if (ruleName.includes("NAPSA")) napsaEmployer = round2(napsaEmployer + employerAmount);
      if (ruleName.includes("NHIMA")) nhimaEmployer = round2(nhimaEmployer + employerAmount);
    }
    const totalEmployerContributions = round2(napsaEmployer + nhimaEmployer);

    payslips.push({
      payrollRunId: runId,
      lineItemId: li.id,
      employeeId: li.employeeId,
      employeeName: li.employee.fullName,
      position: li.employee.position,
      department: li.employee.department?.name ?? null,
      period: run.period,
      payslipNumber: `${prefix}-${String(seq++).padStart(4, "0")}`,
      basicSalary: Number(li.basicSalary),
      shiftEarnings: round2(Number(li.extraShiftPay ?? 0)),
      allowanceBreakdown,
      allowances: allowancesTotal,
      overtime: round2(Number(li.overtime ?? 0)),
      bonuses: round2(Number(li.bonuses ?? 0)),
      otherEarnings: round2(Number(li.otherAdjustments ?? 0)),
      grossPay,
      paye,
      napsa,
      nhima,
      loanDeduction: 0,
      advanceDeduction: round2(Number(li.advances ?? 0)),
      otherDeductions: Math.max(0, round2(deductionsTotal - paye - napsa - nhima)),
      totalDeductions: round2(deductionsTotal + Number(li.advances ?? 0)),
      netPay: Number(li.netPay),
      napsaEmployer,
      nhimaEmployer,
      totalEmployerContributions,
      employeeNumber: li.employee.employeeNumber,
      nrcNumber: li.employee.payrollProfile?.nrcNumber ?? null,
      contractStartDate: li.employee.contractStartDate,
    });
  }

  const created = await prisma.$transaction(payslips.map((p) => prisma.payslipRecord.create({ data: p })));
  return { generated: true, count: created.length, payslips: created };
}

export async function getPayslip(payslipId: string) {
  const payslip = await prisma.payslipRecord.findUnique({
    where: { id: payslipId },
    include: {
      employee: { select: { id: true, fullName: true, position: true } },
      payrollRun: { select: { id: true, period: true, status: true, clientId: true, siteId: true } },
      lineItem: {
        include: {
          allowances: { include: { allowanceType: { select: { name: true } } } },
          deductions: { include: { deductionType: { select: { name: true } } } },
        },
      },
    },
  });
  if (!payslip) throw ApiError.notFound(`Payslip ${payslipId} not found.`);
  return payslip;
}

export async function listPayslips(query: { runId?: string; employeeId?: string; page: number; pageSize: number }) {
  const where: { payrollRunId?: string; employeeId?: string } = {};
  if (query.runId) where.payrollRunId = query.runId;
  if (query.employeeId) where.employeeId = query.employeeId;

  const [total, data] = await Promise.all([
    prisma.payslipRecord.count({ where }),
    prisma.payslipRecord.findMany({
      where,
      orderBy: [{ period: "desc" }, { employeeName: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { employee: { select: { id: true, fullName: true } } },
    }),
  ]);

  return { data, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } };
}

export async function validatePayrollRun(runId: string) {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: {
      lineItems: {
        include: {
          employee: {
            select: {
              id: true, fullName: true, employmentStatus: true,
              napsaRegistered: true, nhimaRegistered: true,
              payrollProfile: { select: { bankName: true, accountNumber: true, paymentMethod: true, napsaNumber: true, nhimaNumber: true, tpin: true } },
              employeeContracts: { where: { status: "ACTIVE" }, take: 1 },
            },
          },
          allowances: true,
          deductions: true,
        },
      },
    },
  });
  if (!run) throw ApiError.notFound(`Payroll run ${runId} not found.`);

  const errors: { employeeId: string; employeeName: string; issue: string; blocking: boolean }[] = [];
  let readyCount = 0;

  for (const li of run.lineItems) {
    const emp = li.employee;
    const profile = emp.payrollProfile;
    const issues: { issue: string; blocking: boolean }[] = [];

    if (emp.employmentStatus === "TERMINATED") issues.push({ issue: "Employee is TERMINATED but included in this payroll run", blocking: true });
    if (emp.employeeContracts.length === 0) issues.push({ issue: "No active contract found", blocking: true });
    if (Number(li.netPay) < 0) issues.push({ issue: `Negative net pay: K${Number(li.netPay).toFixed(2)}`, blocking: true });
    if (!profile || (!profile.bankName && !profile.accountNumber && profile.paymentMethod !== "CASH")) issues.push({ issue: "Missing bank/payment details", blocking: false });
    if (emp.napsaRegistered && (!profile || !profile.napsaNumber)) issues.push({ issue: "NAPSA registered but no NAPSA number on file", blocking: false });
    if (emp.nhimaRegistered && (!profile || !profile.nhimaNumber)) issues.push({ issue: "NHIMA registered but no NHIMA number on file", blocking: false });
    if (!profile || !profile.tpin) issues.push({ issue: "No TPIN on file", blocking: false });

    if (issues.length === 0) { readyCount++; }
    else { for (const issue of issues) errors.push({ employeeId: emp.id, employeeName: emp.fullName, ...issue }); }
  }

  const blockingErrors = errors.filter((e) => e.blocking);
  const warnings = errors.filter((e) => !e.blocking);
  const canApprove = blockingErrors.length === 0;

  return {
    runId, period: run.period, status: run.status,
    totalEmployees: run.lineItems.length, readyCount,
    blockingErrorCount: blockingErrors.length, warningCount: warnings.length,
    canApprove, blockingErrors, warnings,
    summary: canApprove
      ? `✓ ${readyCount} employees ready${warnings.length > 0 ? ` · ⚠ ${warnings.length} warning(s)` : ""}`
      : `🔴 ${blockingErrors.length} blocking error(s) — payroll cannot be approved until resolved`,
  };
}

export async function comparePayrollRuns(currentRunId: string, previousRunId: string) {
  const [current, previous] = await Promise.all([
    prisma.payrollRun.findUnique({ where: { id: currentRunId }, include: { lineItems: { include: { employee: { select: { id: true, fullName: true } } } } } }),
    prisma.payrollRun.findUnique({ where: { id: previousRunId }, include: { lineItems: { include: { employee: { select: { id: true, fullName: true } } } } } }),
  ]);
  if (!current) throw ApiError.notFound(`Current payroll run ${currentRunId} not found.`);
  if (!previous) throw ApiError.notFound(`Previous payroll run ${previousRunId} not found.`);

  const currentByEmp = new Map(current.lineItems.map((li) => [li.employeeId, li]));
  const previousByEmp = new Map(previous.lineItems.map((li) => [li.employeeId, li]));

  const newEmployees = current.lineItems.filter((li) => !previousByEmp.has(li.employeeId)).map((li) => ({ employeeId: li.employeeId, name: li.employee.fullName, netPay: Number(li.netPay) }));
  const removedEmployees = previous.lineItems.filter((li) => !currentByEmp.has(li.employeeId)).map((li) => ({ employeeId: li.employeeId, name: li.employee.fullName, netPay: Number(li.netPay) }));
  const payChanges = current.lineItems.filter((li) => previousByEmp.has(li.employeeId)).map((li) => {
    const prev = previousByEmp.get(li.employeeId)!;
    const grossDiff = round2(Number(li.grossPay) - Number(prev.grossPay));
    const netDiff = round2(Number(li.netPay) - Number(prev.netPay));
    return { employeeId: li.employeeId, name: li.employee.fullName, previousGross: Number(prev.grossPay), currentGross: Number(li.grossPay), grossDiff, previousNet: Number(prev.netPay), currentNet: Number(li.netPay), netDiff, changed: grossDiff !== 0 || netDiff !== 0 };
  }).filter((c) => c.changed);

  return {
    current: { id: current.id, period: current.period, status: current.status, headcount: current.lineItems.length, totalGross: Number(current.totalGrossPay), totalNet: Number(current.totalNetPay) },
    previous: { id: previous.id, period: previous.period, status: previous.status, headcount: previous.lineItems.length, totalGross: Number(previous.totalGrossPay), totalNet: Number(previous.totalNetPay) },
    diff: { headcount: current.lineItems.length - previous.lineItems.length, grossPayDiff: round2(Number(current.totalGrossPay) - Number(previous.totalGrossPay)), netPayDiff: round2(Number(current.totalNetPay) - Number(previous.totalNetPay)) },
    newEmployees, removedEmployees, payChanges,
  };
}