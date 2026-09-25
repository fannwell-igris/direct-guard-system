import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { getBudgetById } from "../department-budgets/department-budgets.service";
import {
  WeeklyPlanCreateInput,
  WeeklyPlanUpdateInput,
  WeeklyPlanItemStatusInput,
  WeeklyPlanListQuery,
} from "./weekly-plans.validation";

const PLAN_INCLUDE = {
  department: { select: { id: true, name: true } },
  items: { orderBy: [{ plannedDate: "asc" as const }, { dateCreated: "asc" as const }] },
};

/** Sunday 23:59:59.999 of the week that starts on the given Monday. */
function weekEnd(weekStartDate: Date): Date {
  const end = new Date(weekStartDate);
  end.setUTCDate(end.getUTCDate() + 7);
  return end;
}

async function assertDepartmentExists(departmentId: string) {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  if (!dept) throw ApiError.badRequest(`Department ${departmentId} does not exist.`);
}

/**
 * Sums a plan's items, ignoring CANCELLED ones — a cancelled activity isn't
 * going to cost anything, so counting it would overstate the week against
 * the budget and make a perfectly affordable plan look reckless.
 */
function planCost(items: { estimatedCost: Prisma.Decimal | number; status: string }[]): number {
  return items
    .filter((i) => i.status !== "CANCELLED")
    .reduce((sum, i) => sum + Number(i.estimatedCost), 0);
}

/**
 * The budget half of "weekly plans work hand in hand with the budget".
 *
 * This is deliberately READ-ONLY and advisory: it reports what the week
 * intends to spend next to what the department's monthly budget has left,
 * and never blocks or rejects anything. A plan that exceeds the budget is a
 * conversation to have, not an error to throw — the person planning the week
 * often knows something the budget doesn't.
 *
 * The month is taken from the week's Monday, so a week straddling month-end
 * is measured against the month it starts in rather than being split across
 * two budgets (which would make both look wrong).
 */
async function budgetContextFor(departmentId: string, weekStartDate: Date, thisWeekCost: number) {
  const month = weekStartDate.getUTCMonth() + 1;
  const year = weekStartDate.getUTCFullYear();

  const budgetRow = await prisma.departmentBudget.findUnique({
    where: { departmentId_month_year: { departmentId, month, year } },
    select: { id: true },
  });

  // Everything else this department has already planned for other weeks of
  // the same month — without it, every week looks affordable on its own
  // while the month as a whole quietly goes over.
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const siblingPlans = await prisma.weeklyPlan.findMany({
    where: {
      departmentId,
      weekStartDate: { gte: monthStart, lt: monthEnd, not: weekStartDate },
    },
    include: { items: { select: { estimatedCost: true, status: true } } },
  });
  const otherWeeksPlannedCost = siblingPlans.reduce((sum, p) => sum + planCost(p.items), 0);

  if (!budgetRow) {
    return {
      month,
      year,
      hasBudget: false as const,
      thisWeekPlannedCost: thisWeekCost,
      otherWeeksPlannedCost,
      monthPlannedCost: thisWeekCost + otherWeeksPlannedCost,
    };
  }

  // Reuse the budgets module's own figures rather than recomputing them here,
  // so this page can never disagree with the Budgets page about the same
  // numbers.
  const budget = await getBudgetById(budgetRow.id);

  return {
    month,
    year,
    hasBudget: true as const,
    budgetId: budget.id,
    budgetStatus: budget.status,
    budgetTotal: budget.figures.totalPlanned,
    budgetActual: budget.figures.totalActual,
    budgetRemaining: budget.figures.totalRemaining,
    thisWeekPlannedCost: thisWeekCost,
    otherWeeksPlannedCost,
    monthPlannedCost: thisWeekCost + otherWeeksPlannedCost,
    // What would be left if everything currently planned this month were
    // spent on top of what has already gone out. Negative = the month's
    // plans, taken together, don't fit the budget.
    projectedRemaining:
      budget.figures.totalRemaining - (thisWeekCost + otherWeeksPlannedCost),
  };
}

export async function createWeeklyPlan(input: WeeklyPlanCreateInput) {
  await assertDepartmentExists(input.departmentId);

  const existing = await prisma.weeklyPlan.findUnique({
    where: {
      departmentId_weekStartDate: {
        departmentId: input.departmentId,
        weekStartDate: input.weekStartDate,
      },
    },
    select: { id: true },
  });
  if (existing) {
    throw ApiError.conflict(
      `A plan for this department for the week of ${input.weekStartDate.toISOString().slice(0, 10)} already exists (id: ${existing.id}). Edit that one instead.`
    );
  }

  const plan = await prisma.weeklyPlan.create({
    data: {
      departmentId: input.departmentId,
      weekStartDate: input.weekStartDate,
      preparedBy: input.preparedBy,
      notes: input.notes,
      items: { create: input.items },
    },
    include: PLAN_INCLUDE,
  });

  return withPlanFigures(plan);
}

export async function listWeeklyPlans(query: WeeklyPlanListQuery) {
  const where: Prisma.WeeklyPlanWhereInput = {};
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.fromWeek || query.toWeek) {
    const range: Prisma.DateTimeFilter = {};
    if (query.fromWeek) range.gte = query.fromWeek;
    if (query.toWeek) range.lte = query.toWeek;
    where.weekStartDate = range;
  }

  const [total, rows] = await Promise.all([
    prisma.weeklyPlan.count({ where }),
    prisma.weeklyPlan.findMany({
      where,
      orderBy: { weekStartDate: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: PLAN_INCLUDE,
    }),
  ]);

  // List view gets the cheap per-plan totals only — the budget lookup is a
  // handful of extra queries per plan, which is fine for one plan on the
  // detail view but not for twenty rows at once.
  const data = rows.map((plan) => {
    const items = plan.items;
    return {
      ...plan,
      totals: {
        itemCount: items.length,
        doneCount: items.filter((i) => i.status === "DONE").length,
        cancelledCount: items.filter((i) => i.status === "CANCELLED").length,
        plannedCost: planCost(items),
      },
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

async function withPlanFigures<
  T extends {
    departmentId: string;
    weekStartDate: Date;
    items: { estimatedCost: Prisma.Decimal; status: string }[];
  }
>(plan: T) {
  const items = plan.items;
  const plannedCost = planCost(items);
  const budget = await budgetContextFor(plan.departmentId, plan.weekStartDate, plannedCost);

  return {
    ...plan,
    items: items.map((i) => ({ ...i, estimatedCost: Number(i.estimatedCost) })),
    totals: {
      itemCount: items.length,
      doneCount: items.filter((i) => i.status === "DONE").length,
      cancelledCount: items.filter((i) => i.status === "CANCELLED").length,
      plannedCost,
    },
    weekEndDate: weekEnd(plan.weekStartDate),
    budget,
  };
}

export async function getWeeklyPlanById(id: string) {
  const plan = await prisma.weeklyPlan.findUnique({ where: { id }, include: PLAN_INCLUDE });
  if (!plan) throw ApiError.notFound(`Weekly plan ${id} not found.`);
  return withPlanFigures(plan);
}

export async function updateWeeklyPlan(id: string, input: WeeklyPlanUpdateInput) {
  const existing = await prisma.weeklyPlan.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound(`Weekly plan ${id} not found.`);

  const plan = await prisma.$transaction(async (tx) => {
    if (input.items) {
      // Same replace-all approach the budgets module uses for its lines:
      // the client always sends the full intended list, so reconciling
      // individual rows would add complexity with no behavioural gain.
      await tx.weeklyPlanItem.deleteMany({ where: { planId: id } });
      await tx.weeklyPlanItem.createMany({
        data: input.items.map((i) => ({ ...i, planId: id })),
      });
    }
    return tx.weeklyPlan.update({
      where: { id },
      data: { preparedBy: input.preparedBy, notes: input.notes },
      include: PLAN_INCLUDE,
    });
  });

  return withPlanFigures(plan);
}

/**
 * Tick a single activity off (or cancel it) without resending the whole plan
 * — the one edit that happens repeatedly during the week, as opposed to the
 * whole-plan edit that happens once when it's drawn up.
 */
export async function setWeeklyPlanItemStatus(
  planId: string,
  itemId: string,
  input: WeeklyPlanItemStatusInput
) {
  const item = await prisma.weeklyPlanItem.findUnique({
    where: { id: itemId },
    select: { id: true, planId: true },
  });
  if (!item || item.planId !== planId) {
    throw ApiError.notFound(`Item ${itemId} not found on weekly plan ${planId}.`);
  }

  await prisma.weeklyPlanItem.update({ where: { id: itemId }, data: { status: input.status } });
  return getWeeklyPlanById(planId);
}

export async function deleteWeeklyPlan(id: string) {
  const existing = await prisma.weeklyPlan.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound(`Weekly plan ${id} not found.`);
  // Items go with it via onDelete: Cascade — a plan's activities have no
  // meaning once the plan itself is gone.
  await prisma.weeklyPlan.delete({ where: { id } });
}
