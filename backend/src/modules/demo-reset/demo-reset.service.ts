import { prisma } from "../../lib/prisma";

/**
 * Wipes every transactional record from the database while leaving all
 * master / reference data in place.
 *
 * KEPT (master data, configuration):
 *   User, Employee, Client, Site, Department, ShiftType,
 *   SiteRequirement, SiteCoverage, EmployeePayrollProfile,
 *   AllowanceType, DeductionType, StatutoryRule,
 *   ClientContract, EmployeeContract, DepartmentBudget,
 *   DepartmentBudgetLine, InventoryItem, SystemSetting,
 *   DeviceToken (push tokens), SalaryHistory
 *
 * DELETED (transactional data):
 *   Payment, Invoice,
 *   GeneralExpense,
 *   PayslipRecord, PayrollAllowance, PayrollDeduction,
 *   PayrollAuditLog, PayrollLineItem, PayrollRun,
 *   FieldReceiptEntry,
 *   OperationalCost,
 *   SalaryAdvance,
 *   EmployeeLoan,
 *   AttendanceRecord, OperationsRecord,
 *   RosterEntry,
 *   DepartmentRequest,
 *   WeeklyPlanItem, WeeklyPlan,
 *   StockMovement, ItemTakeHomeLog,
 *   ProspectStageHistory, MarketingActivity,
 *   MarketingTarget, FieldVisit,
 *   Prospect,
 *   Task,
 *   SentAlertNotification
 *
 * Order matters: children before parents (FK constraints).
 */
export async function wipeAllTransactionalData() {
  const counts = await prisma.$transaction(async (tx) => {
    // ── Invoices & Payments ──────────────────────────────────────────────
    const payments      = await tx.payment.deleteMany({});
    const invoices      = await tx.invoice.deleteMany({});

    // ── General Expenses ─────────────────────────────────────────────────
    const genExpenses   = await tx.generalExpense.deleteMany({});

    // ── Payroll (children first) ─────────────────────────────────────────
    const payslips      = await tx.payslipRecord.deleteMany({});
    const prAllowances  = await tx.payrollAllowance.deleteMany({});
    const prDeductions  = await tx.payrollDeduction.deleteMany({});
    const prAudit       = await tx.payrollAuditLog.deleteMany({});
    const prLineItems   = await tx.payrollLineItem.deleteMany({});
    const prRuns        = await tx.payrollRun.deleteMany({});

    // ── Field Receipts ───────────────────────────────────────────────────
    const fieldReceipts = await tx.fieldReceiptEntry.deleteMany({});

    // ── Operational Costs ────────────────────────────────────────────────
    const opCosts       = await tx.operationalCost.deleteMany({});

    // ── Salary Advances & Loans ──────────────────────────────────────────
    const salAdv        = await tx.salaryAdvance.deleteMany({});
    const empLoans      = await tx.employeeLoan.deleteMany({});

    // ── Operations (attendance before records) ───────────────────────────
    const attendance    = await tx.attendanceRecord.deleteMany({});
    const opsRecords    = await tx.operationsRecord.deleteMany({});

    // ── Roster ───────────────────────────────────────────────────────────
    const roster        = await tx.rosterEntry.deleteMany({});

    // ── Department Requests ──────────────────────────────────────────────
    const deptRequests  = await tx.departmentRequest.deleteMany({});

    // ── Weekly Plans ─────────────────────────────────────────────────────
    const wpItems       = await tx.weeklyPlanItem.deleteMany({});
    const wps           = await tx.weeklyPlan.deleteMany({});

    // ── Inventory Movements ──────────────────────────────────────────────
    const stockMoves    = await tx.stockMovement.deleteMany({});
    const takeHomeLogs  = await tx.itemTakeHomeLog.deleteMany({});

    // ── Marketing ────────────────────────────────────────────────────────
    const mktHistory    = await tx.prospectStageHistory.deleteMany({});
    const mktActivities = await tx.marketingActivity.deleteMany({});
    const mktTargets    = await tx.marketingTarget.deleteMany({});
    const fieldVisits   = await tx.fieldVisit.deleteMany({});
    const prospects     = await tx.prospect.deleteMany({});

    // ── Tasks ────────────────────────────────────────────────────────────
    const tasks         = await tx.task.deleteMany({});

    // ── Alert notifications ──────────────────────────────────────────────
    const alerts        = await tx.sentAlertNotification.deleteMany({});

    return {
      payments:        payments.count,
      invoices:        invoices.count,
      generalExpenses: genExpenses.count,
      payslips:        payslips.count,
      payrollAllowances: prAllowances.count,
      payrollDeductions: prDeductions.count,
      payrollAuditLogs:  prAudit.count,
      payrollLineItems:  prLineItems.count,
      payrollRuns:       prRuns.count,
      fieldReceipts:     fieldReceipts.count,
      operationalCosts:  opCosts.count,
      salaryAdvances:    salAdv.count,
      employeeLoans:     empLoans.count,
      attendanceRecords: attendance.count,
      operationsRecords: opsRecords.count,
      rosterEntries:     roster.count,
      departmentRequests: deptRequests.count,
      weeklyPlanItems:   wpItems.count,
      weeklyPlans:       wps.count,
      stockMovements:    stockMoves.count,
      itemTakeHomeLogs:  takeHomeLogs.count,
      prospectStageHistory: mktHistory.count,
      marketingActivities:  mktActivities.count,
      marketingTargets:     mktTargets.count,
      fieldVisits:          fieldVisits.count,
      prospects:            prospects.count,
      tasks:                tasks.count,
      alertNotifications:   alerts.count,
    };
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { deleted: counts, total };
}
