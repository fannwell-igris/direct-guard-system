import { Prisma, BudgetStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  BudgetCreateInput,
  BudgetUpdateInput,
  BudgetReviewInput,
  BudgetListQuery,
  BudgetSummaryQuery,
  BudgetCompareQuery,
} from "./department-budgets.validation";

// A budget's lines can only be edited while it's in one of these states —
// once submitted, changing the numbers out from under a reviewer would
// defeat the whole point of a review workflow. Finance moves it back to
// RETURNED (which re-opens it) rather than the department editing a
// SUBMITTED/UNDER_REVIEW/APPROVED budget directly.
const EDITABLE_STATUSES: BudgetStatus[] = ["DRAFT", "RETURNED"];

// Valid manual review transitions — a budget can only be reviewed once a
// department has actually submitted it.
const REVIEWABLE_FROM: BudgetStatus[] = ["SUBMITTED", "UNDER_REVIEW"];

const BUDGET_INCLUDE = {
  department: { select: { id: true, name: true } },
  lines: { orderBy: { dateCreated: "asc" as const } },
};

function monthRange(month: number, year: number) {
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

async function assertDepartmentExists(departmentId: string) {
  const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
  if (!dept) throw ApiError.badRequest(`Department ${departmentId} does not exist.`);
}

export async function createBudget(input: BudgetCreateInput) {
  await assertDepartmentExists(input.departmentId);

  const existing = await prisma.departmentBudget.findUnique({
    where: { departmentId_month_year: { departmentId: input.departmentId, month: input.month, year: input.year } },
  });
  if (existing) {
    throw ApiError.conflict(
      `A budget for this department in ${input.month}/${input.year} already exists (id: ${existing.id}). Edit that one instead.`
    );
  }

  return prisma.departmentBudget.create({
    data: {
      departmentId: input.departmentId,
      month: input.month,
      year: input.year,
      preparedBy: input.preparedBy,
      notes: input.notes,
      lines: { create: input.lines },
    },
    include: BUDGET_INCLUDE,
  });
}

export async function listBudgets(query: BudgetListQuery) {
  const where: Prisma.DepartmentBudgetWhereInput = {};
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.month) where.month = query.month;
  if (query.year) where.year = query.year;
  if (query.status) where.status = query.status;

  const [total, rows] = await Promise.all([
    prisma.departmentBudget.count({ where }),
    prisma.departmentBudget.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }, { department: { name: "asc" } }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
  ]);

  // Planned total per row, cheap enough to compute here without a second
  // round trip per row (lines aren't included, just counted, above).
  const totals = await prisma.departmentBudgetLine.groupBy({
    by: ["budgetId"],
    where: { budgetId: { in: rows.map((r) => r.id) } },
    _sum: { plannedAmount: true },
  });
  const totalByBudget = new Map(totals.map((t) => [t.budgetId, Number(t._sum.plannedAmount ?? 0)]));

  return {
    data: rows.map((r) => ({ ...r, totalPlanned: totalByBudget.get(r.id) ?? 0 })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

// ---- Budget vs Actual (Section 4/6 of the brief) ----

async function actualByCategoryForDept(departmentId: string, month: number, year: number) {
  const { start, end } = monthRange(month, year);
  const rows = await prisma.generalExpense.groupBy({
    by: ["category"],
    where: { departmentId, expenseDate: { gte: start, lt: end } },
    _sum: { amount: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.category.trim().toLowerCase(), Number(r._sum.amount ?? 0));
  return map;
}

async function requestTotalsForDept(departmentId: string, month: number, year: number) {
  const { start, end } = monthRange(month, year);
  const [pending, approved] = await Promise.all([
    prisma.departmentRequest.aggregate({
      where: { departmentId, status: "PENDING", dateCreated: { gte: start, lt: end } },
      _sum: { estimatedCost: true },
    }),
    // APPROVED-but-not-yet-FULFILLED is "committed" — once fulfilled, an
    // expense has been logged against it, which already counts toward
    // actual spend, so counting it here too would double it up.
    prisma.departmentRequest.aggregate({
      where: { departmentId, status: "APPROVED", dateCreated: { gte: start, lt: end } },
      _sum: { estimatedCost: true },
    }),
  ]);
  return {
    requested: Number(pending._sum.estimatedCost ?? 0),
    committed: Number(approved._sum.estimatedCost ?? 0),
  };
}

function warningLevel(plannedAmount: number, actual: number): "OK" | "APPROACHING" | "OVER" {
  if (plannedAmount <= 0) return actual > 0 ? "OVER" : "OK";
  const pct = (actual / plannedAmount) * 100;
  if (pct >= 100) return "OVER";
  if (pct >= 80) return "APPROACHING";
  return "OK";
}

async function withBudgetFigures<T extends { departmentId: string; month: number; year: number; lines: { category: string; plannedAmount: Prisma.Decimal }[] }>(
  budget: T
) {
  const [actualByCategory, { requested, committed }] = await Promise.all([
    actualByCategoryForDept(budget.departmentId, budget.month, budget.year),
    requestTotalsForDept(budget.departmentId, budget.month, budget.year),
  ]);

  let totalPlanned = 0;
  let totalActual = 0;
  const lines = budget.lines.map((line) => {
    const planned = Number(line.plannedAmount);
    const actual = actualByCategory.get(line.category.trim().toLowerCase()) ?? 0;
    totalPlanned += planned;
    totalActual += actual;
    return {
      ...line,
      plannedAmount: planned,
      actual,
      remaining: planned - actual,
      percentSpent: planned > 0 ? Math.round((actual / planned) * 1000) / 10 : null,
      warning: warningLevel(planned, actual),
    };
  });

  return {
    ...budget,
    lines,
    figures: {
      totalPlanned,
      totalActual,
      totalRemaining: totalPlanned - totalActual,
      totalPercentSpent: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 1000) / 10 : null,
      warning: warningLevel(totalPlanned, totalActual),
      requested,
      committed,
    },
  };
}

export async function getBudgetById(id: string) {
  const budget = await prisma.departmentBudget.findUnique({ where: { id }, include: BUDGET_INCLUDE });
  if (!budget) throw ApiError.notFound(`Budget ${id} not found.`);
  return withBudgetFigures(budget);
}

export async function updateBudget(id: string, input: BudgetUpdateInput) {
  const existing = await prisma.departmentBudget.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) throw ApiError.notFound(`Budget ${id} not found.`);
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw ApiError.badRequest(
      `Budget ${id} is ${existing.status} and can no longer be edited. Finance must return it for revision first.`
    );
  }

  return prisma.$transaction(async (tx) => {
    if (input.lines) {
      await tx.departmentBudgetLine.deleteMany({ where: { budgetId: id } });
      await tx.departmentBudgetLine.createMany({
        data: input.lines.map((l) => ({ ...l, budgetId: id })),
      });
    }
    return tx.departmentBudget.update({
      where: { id },
      data: {
        preparedBy: input.preparedBy,
        notes: input.notes,
      },
      include: BUDGET_INCLUDE,
    });
  });
}

export async function submitBudget(id: string, submittedBy?: string | null) {
  const existing = await prisma.departmentBudget.findUnique({
    where: { id },
    include: { lines: { select: { id: true } } },
  });
  if (!existing) throw ApiError.notFound(`Budget ${id} not found.`);
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw ApiError.badRequest(`Budget ${id} is already ${existing.status} and cannot be submitted again.`);
  }
  if (existing.lines.length === 0) {
    throw ApiError.badRequest("Cannot submit a budget with no line items.");
  }

  return prisma.departmentBudget.update({
    where: { id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      preparedBy: submittedBy ?? existing.preparedBy,
      // A resubmission after RETURNED should read as a fresh submission,
      // not carry the previous reviewer's comment forward.
      reviewComment: null,
    },
    include: BUDGET_INCLUDE,
  });
}

export async function reviewBudget(id: string, input: BudgetReviewInput, reviewedBy?: string | null) {
  const existing = await prisma.departmentBudget.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) throw ApiError.notFound(`Budget ${id} not found.`);
  if (!REVIEWABLE_FROM.includes(existing.status)) {
    throw ApiError.badRequest(
      `Budget ${id} is ${existing.status} and cannot be reviewed — only a SUBMITTED or UNDER_REVIEW budget can be.`
    );
  }

  return prisma.departmentBudget.update({
    where: { id },
    data: {
      status: input.status,
      reviewComment: input.reviewComment,
      reviewedBy,
      reviewedAt: new Date(),
    },
    include: BUDGET_INCLUDE,
  });
}

// ---- Recurring monthly budgets (Section 7) ----

export async function copyForwardBudget(id: string) {
  const source = await prisma.departmentBudget.findUnique({ where: { id }, include: { lines: true } });
  if (!source) throw ApiError.notFound(`Budget ${id} not found.`);

  const nextMonth = source.month === 12 ? 1 : source.month + 1;
  const nextYear = source.month === 12 ? source.year + 1 : source.year;

  const existing = await prisma.departmentBudget.findUnique({
    where: { departmentId_month_year: { departmentId: source.departmentId, month: nextMonth, year: nextYear } },
  });
  if (existing) {
    throw ApiError.conflict(
      `A budget for ${nextMonth}/${nextYear} already exists for this department (id: ${existing.id}).`
    );
  }

  // Deliberately DRAFT regardless of the source budget's status, and no
  // reviewedBy/reviewedAt/reviewComment carried over — per the brief,
  // "Do not automatically carry over approval status. The new month's
  // budget must go through its own review."
  return prisma.departmentBudget.create({
    data: {
      departmentId: source.departmentId,
      month: nextMonth,
      year: nextYear,
      preparedBy: source.preparedBy,
      notes: null,
      lines: {
        create: source.lines.map((l) => ({
          category: l.category,
          plannedAmount: l.plannedAmount,
          description: l.description,
        })),
      },
    },
    include: BUDGET_INCLUDE,
  });
}

// ---- Finance dashboard (Section 3) ----

export async function getBudgetSummary(query: BudgetSummaryQuery) {
  const [departments, budgets] = await Promise.all([
    prisma.department.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.departmentBudget.findMany({
      where: { month: query.month, year: query.year },
      include: { lines: { select: { plannedAmount: true } } },
    }),
  ]);

  const budgetByDept = new Map(budgets.map((b) => [b.departmentId, b]));

  const departmentRows = await Promise.all(
    departments.map(async (dept) => {
      const budget = budgetByDept.get(dept.id);
      if (!budget) {
        return {
          departmentId: dept.id,
          departmentName: dept.name,
          budgetId: null,
          status: null as BudgetStatus | null,
          totalPlanned: 0,
          totalActual: 0,
        };
      }
      const totalPlanned = budget.lines.reduce((sum, l) => sum + Number(l.plannedAmount), 0);
      const { start, end } = monthRange(query.month, query.year);
      const actualAgg = await prisma.generalExpense.aggregate({
        where: { departmentId: dept.id, expenseDate: { gte: start, lt: end } },
        _sum: { amount: true },
      });
      return {
        departmentId: dept.id,
        departmentName: dept.name,
        budgetId: budget.id,
        status: budget.status,
        totalPlanned,
        totalActual: Number(actualAgg._sum.amount ?? 0),
      };
    })
  );

  const statusCounts: Record<BudgetStatus, number> = {
    DRAFT: 0, SUBMITTED: 0, UNDER_REVIEW: 0, APPROVED: 0, RETURNED: 0, REJECTED: 0,
  };
  for (const b of budgets) statusCounts[b.status]++;

  return {
    month: query.month,
    year: query.year,
    departments: departmentRows,
    companyTotalPlanned: departmentRows.reduce((s, d) => s + d.totalPlanned, 0),
    companyTotalActual: departmentRows.reduce((s, d) => s + d.totalActual, 0),
    statusCounts,
  };
}

// ---- Month-over-month comparison (Section 5) ----

export async function getBudgetComparison(query: BudgetCompareQuery) {
  const departmentWhere = query.departmentId ? { id: query.departmentId } : { status: "ACTIVE" as const };
  const departments = await prisma.department.findMany({ where: departmentWhere, select: { id: true, name: true } });

  const results = await Promise.all(
    departments.map(async (dept) => {
      const periods = await Promise.all(
        query.periods.map(async ({ month, year }) => {
          const budget = await prisma.departmentBudget.findUnique({
            where: { departmentId_month_year: { departmentId: dept.id, month, year } },
            include: { lines: { select: { plannedAmount: true } } },
          });
          const totalPlanned = budget ? budget.lines.reduce((s, l) => s + Number(l.plannedAmount), 0) : 0;
          const { start, end } = monthRange(month, year);
          const actualAgg = await prisma.generalExpense.aggregate({
            where: { departmentId: dept.id, expenseDate: { gte: start, lt: end } },
            _sum: { amount: true },
          });
          const totalActual = Number(actualAgg._sum.amount ?? 0);
          return {
            month,
            year,
            status: budget?.status ?? null,
            totalPlanned,
            totalActual,
            variance: totalPlanned - totalActual,
            percentUsed: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 1000) / 10 : null,
          };
        })
      );
      return { departmentId: dept.id, departmentName: dept.name, periods };
    })
  );

  return { periods: query.periods, departments: results };
}
