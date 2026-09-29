import { prisma } from "../../lib/prisma";
import { syncOverdueInvoices } from "../invoices/invoices.service";

// ---- helpers ----

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleString("default", { month: "short", year: "numeric" });
}

/**
 * Roles that can see financial data (revenue, expenses, payroll, invoices, payments).
 * Operations, Staff, HR, Marketing see counts and alerts only.
 */
const FINANCE_ROLES = new Set(["ADMIN", "MANAGER", "PAYROLL"]);

// ---- Main Dashboard ----

export async function getMainDashboard(role: string) {
  // Invoice status (OVERDUE in particular) is only ever updated by a
  // payment change or by this sweep — run it here too so dashboard counts
  // reflect invoices that are overdue as of right now, not as of whenever
  // a payment last touched them. See invoices.service.ts for the full
  // explanation.
  await syncOverdueInvoices();
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthEnd = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const canSeeFinance = FINANCE_ROLES.has(role);

  // --- Counts (all roles) ---
  const [activeClients, activeSites, activeEmployees, activeGuards] = await Promise.all([
    prisma.client.count({ where: { status: "ACTIVE" } }),
    prisma.site.count({ where: { status: "ACTIVE" } }),
    prisma.employee.count({ where: { employmentStatus: "ACTIVE" } }),
    prisma.employee.count({
      where: {
        employmentStatus: "ACTIVE",
        OR: [
          { position: { contains: "guard", mode: "insensitive" } },
          { position: { contains: "officer", mode: "insensitive" } },
        ],
      },
    }),
  ]);

  // --- Alert counts (all roles — operational awareness, no financial detail) ---
  const [overdueInvoices, expiringContracts, overdueTasksCount] = await Promise.all([
    canSeeFinance
      ? prisma.invoice.count({
          where: { status: { notIn: ["PAID", "CANCELLED"] }, dueDate: { lt: now } },
        })
      : Promise.resolve(0),
    prisma.clientContract.count({
      where: {
        status: { notIn: ["EXPIRED", "INACTIVE"] },
        endDate: { gte: now, lte: new Date(now.getTime() + 30 * 86_400_000) },
      },
    }),
    prisma.task.count({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] }, dueDate: { lt: now } },
    }),
  ]);

  if (!canSeeFinance) {
    // Non-finance roles get counts + non-financial alerts only
    return {
      counts: { activeClients, activeSites, activeEmployees, activeGuards },
      revenue: null,
      outstandingBalance: null,
      expenses: null,
      payroll: null,
      alerts: {
        overdueInvoices: null,
        expiringContracts,
        overdueTasks: overdueTasksCount,
      },
      recentInvoices: null,
      recentPayments: null,
      monthlyRevenue: null,
    };
  }

  // --- Finance-only queries ---
  const [thisMonthPayments, lastMonthPayments] = await Promise.all([
    prisma.payment.aggregate({
      where: { paymentDate: { gte: thisMonthStart, lte: thisMonthEnd } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { paymentDate: { gte: lastMonthStart, lte: lastMonthEnd } },
      _sum: { amount: true },
    }),
  ]);

  const revenueThisMonth = Number(thisMonthPayments._sum.amount ?? 0);
  const revenueLastMonth = Number(lastMonthPayments._sum.amount ?? 0);
  const revenueChange =
    revenueLastMonth === 0 ? null : ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100;

  const outstandingInvoices = await prisma.invoice.aggregate({
    where: { status: { notIn: ["PAID", "CANCELLED"] } },
    _sum: { amount: true },
  });
  const totalPaidOnOutstanding = await prisma.payment.aggregate({
    where: { invoice: { status: { notIn: ["PAID", "CANCELLED"] } } },
    _sum: { amount: true },
  });
  const outstandingBalance =
    Number(outstandingInvoices._sum.amount ?? 0) - Number(totalPaidOnOutstanding._sum.amount ?? 0);

  const [generalExpenses, operationalCosts] = await Promise.all([
    prisma.generalExpense.aggregate({
      where: { expenseDate: { gte: thisMonthStart, lte: thisMonthEnd } },
      _sum: { amount: true },
    }),
    prisma.operationalCost.aggregate({
      where: { month: { gte: thisMonthStart, lte: thisMonthEnd } },
      _sum: { amount: true },
    }),
  ]);
  const totalExpensesThisMonth =
    Number(generalExpenses._sum.amount ?? 0) + Number(operationalCosts._sum.amount ?? 0);

  const payrollThisMonth = await prisma.payrollRun.aggregate({
    where: {
      status: "PAID",
      period: { gte: thisMonthStart, lte: thisMonthEnd },
    },
    _sum: { totalNetPay: true },
  });
  const payrollPaidThisMonth = Number(payrollThisMonth._sum.totalNetPay ?? 0);

  const recentInvoices = await prisma.invoice.findMany({
    take: 5,
    orderBy: { dateCreated: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      amount: true,
      status: true,
      dueDate: true,
      dateCreated: true,
      client: { select: { name: true } },
    },
  });

  const recentPayments = await prisma.payment.findMany({
    take: 5,
    orderBy: { paymentDate: "desc" },
    select: {
      id: true,
      amount: true,
      paymentDate: true,
      paymentMethod: true,
      invoice: { select: { invoiceNumber: true, client: { select: { name: true } } } },
    },
  });

  // Last 3 months only (revenue + expenses), for the dashboard's
  // Revenue vs Expenses chart — kept short deliberately so the bar row
  // fits its card at a readable width instead of overflowing it.
  const monthlyRevenue: { month: string; revenue: number; expenses: number }[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mStart = startOfMonth(d);
    const mEnd = endOfMonth(d);
    const [paymentAgg, generalExpenseAgg, operationalCostAgg] = await Promise.all([
      prisma.payment.aggregate({
        where: { paymentDate: { gte: mStart, lte: mEnd } },
        _sum: { amount: true },
      }),
      prisma.generalExpense.aggregate({
        where: { expenseDate: { gte: mStart, lte: mEnd } },
        _sum: { amount: true },
      }),
      prisma.operationalCost.aggregate({
        where: { month: { gte: mStart, lte: mEnd } },
        _sum: { amount: true },
      }),
    ]);
    monthlyRevenue.push({
      month: monthLabel(d.getFullYear(), d.getMonth()),
      revenue: Number(paymentAgg._sum.amount ?? 0),
      expenses: Number(generalExpenseAgg._sum.amount ?? 0) + Number(operationalCostAgg._sum.amount ?? 0),
    });
  }

  return {
    counts: { activeClients, activeSites, activeEmployees, activeGuards },
    revenue: {
      thisMonth: revenueThisMonth,
      lastMonth: revenueLastMonth,
      changePercent: revenueChange !== null ? Math.round(revenueChange * 10) / 10 : null,
    },
    outstandingBalance,
    expenses: { thisMonth: totalExpensesThisMonth },
    payroll: { paidThisMonth: payrollPaidThisMonth },
    alerts: {
      overdueInvoices,
      expiringContracts,
      overdueTasks: overdueTasksCount,
    },
    recentInvoices,
    recentPayments,
    monthlyRevenue,
  };
}

// ---- Operations Dashboard ----

export async function getOperationsDashboard() {
  const now = new Date();
  const today = startOfDay(now);
  const todayEnd = endOfDay(now);
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  const activeSites = await prisma.site.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, siteName: true },
  });

  const sitesWithRosterToday = await prisma.rosterEntry.groupBy({
    by: ["siteId"],
    where: {
      date: { gte: today, lte: todayEnd },
      status: "SCHEDULED",
    },
  });

  const sitesRosteredIds = new Set(sitesWithRosterToday.map((r) => r.siteId));
  const sitesWithGap = activeSites.filter((s) => !sitesRosteredIds.has(s.id)).map((s) => s.siteName);

  const officersOnDuty = await prisma.rosterEntry.count({
    where: {
      date: { gte: today, lte: todayEnd },
      status: "SCHEDULED",
    },
  });

  const pendingOperationsRecords = await prisma.operationsRecord.count({
    where: { reviewStatus: "PENDING" },
  });

  const attendanceSummary = await prisma.attendanceRecord.groupBy({
    by: ["status"],
    where: {
      operationsRecord: {
        date: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    },
    _count: { status: true },
  });

  const attendanceByStatus: Record<string, number> = {};
  for (const row of attendanceSummary) {
    attendanceByStatus[row.status] = row._count.status;
  }

  const recentOperations = await prisma.operationsRecord.findMany({
    take: 5,
    orderBy: { date: "desc" },
    select: {
      id: true,
      date: true,
      reviewStatus: true,
      site: { select: { siteName: true } },
      shiftType: { select: { name: true } },
    },
  });

  return {
    roster: {
      activeSitesTotal: activeSites.length,
      sitesRosteredToday: sitesRosteredIds.size,
      sitesWithGapToday: sitesWithGap,
      officersOnDutyToday: officersOnDuty,
    },
    operations: {
      pendingReview: pendingOperationsRecords,
    },
    attendanceThisMonth: attendanceByStatus,
    recentOperations,
  };
}

// ---- HR Dashboard ----

export async function getHRDashboard() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 86_400_000);

  const [totalActive, totalInactive, totalTerminated] = await Promise.all([
    prisma.employee.count({ where: { employmentStatus: "ACTIVE" } }),
    prisma.employee.count({ where: { employmentStatus: "INACTIVE" } }),
    prisma.employee.count({ where: { employmentStatus: "TERMINATED" } }),
  ]);

  const expiringContracts = await prisma.employeeContract.findMany({
    where: {
      status: { notIn: ["EXPIRED", "INACTIVE"] },
      endDate: { gte: now, lte: thirtyDaysFromNow },
    },
    orderBy: { endDate: "asc" },
    select: {
      id: true,
      endDate: true,
      payType: true,
      employee: { select: { fullName: true, position: true } },
    },
  });

  const byDepartment = await prisma.department.findMany({
    where: { status: "ACTIVE" },
    select: {
      name: true,
      _count: { select: { employees: true } },
    },
    orderBy: { name: "asc" },
  });

  const unassigned = await prisma.employee.count({
    where: { employmentStatus: "ACTIVE", departmentId: null },
  });

  const recentHires = await prisma.employee.findMany({
    where: {
      dateAdded: { gte: thirtyDaysAgo },
      employmentStatus: { not: "TERMINATED" },
    },
    orderBy: { dateAdded: "desc" },
    select: { id: true, fullName: true, position: true, dateAdded: true, employmentStatus: true },
  });

  const overdueTasksCount = await prisma.task.count({
    where: {
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      dueDate: { lt: now },
    },
  });
  const overdueTasks = await prisma.task.findMany({
    where: {
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      dueDate: { lt: now },
    },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    take: 5,
    select: {
      id: true,
      title: true,
      priority: true,
      dueDate: true,
      status: true,
      assignedToEmployee: { select: { fullName: true } },
      department: { select: { name: true } },
    },
  });

  const openRequests = await prisma.departmentRequest.count({
    where: { status: { in: ["PENDING", "APPROVED"] } },
  });

  return {
    employees: {
      active: totalActive,
      inactive: totalInactive,
      terminated: totalTerminated,
    },
    expiringContracts,
    byDepartment: [
      ...byDepartment.map((d) => ({ department: d.name, count: d._count.employees })),
      { department: "Unassigned", count: unassigned },
    ],
    recentHires,
    tasks: {
      overdueCount: overdueTasksCount,
      topOverdue: overdueTasks,
    },
    openDepartmentRequests: openRequests,
  };
}
