import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { TargetCreateInput, TargetUpdateInput, TargetListQuery } from "./marketing-targets.validation";

const INCLUDE = {
  marketer: { select: { id: true, fullName: true } },
};

export async function createTarget(input: TargetCreateInput) {
  if (input.marketerId) await ensureUserExists(input.marketerId);

  return prisma.marketingTarget.create({
    data: {
      marketerId: input.marketerId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      targetNewProspects: input.targetNewProspects,
      targetActivities: input.targetActivities,
      targetVisits: input.targetVisits,
      targetConversions: input.targetConversions,
      notes: input.notes,
    },
    include: INCLUDE,
  });
}

export async function updateTarget(id: string, input: TargetUpdateInput) {
  await ensureTargetExists(id);
  if (input.marketerId) await ensureUserExists(input.marketerId);

  return prisma.marketingTarget.update({ where: { id }, data: input, include: INCLUDE });
}

export async function deleteTarget(id: string) {
  await ensureTargetExists(id);
  await prisma.marketingTarget.delete({ where: { id } });
}

/**
 * Lists targets for the given filters, each annotated with its actuals for
 * the same period/marketer — computed at read time from the live data
 * (Prospect/MarketingActivity/FieldVisit/ProspectStageHistory), never
 * stored, so a target set mid-month always compares against the real
 * current numbers.
 */
export async function listTargets(query: TargetListQuery) {
  const where: { marketerId?: string; periodYear?: number; periodMonth?: number } = {};
  if (query.marketerId) where.marketerId = query.marketerId;
  if (query.periodYear !== undefined) where.periodYear = query.periodYear;
  if (query.periodMonth !== undefined) where.periodMonth = query.periodMonth;

  const [total, rows] = await Promise.all([
    prisma.marketingTarget.count({ where }),
    prisma.marketingTarget.findMany({
      where,
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: INCLUDE,
    }),
  ]);

  const data = await Promise.all(rows.map((row) => withActuals(row)));

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

export async function getTargetById(id: string) {
  const row = await prisma.marketingTarget.findUnique({ where: { id }, include: INCLUDE });
  if (!row) throw ApiError.notFound(`Target ${id} not found.`);
  return withActuals(row);
}

async function withActuals<T extends { marketerId: string | null; periodYear: number; periodMonth: number }>(
  target: T
) {
  const from = new Date(target.periodYear, target.periodMonth - 1, 1, 0, 0, 0, 0);
  const to = new Date(target.periodYear, target.periodMonth, 1, 0, 0, 0, 0); // exclusive: first instant of the next month
  const periodFilter = { gte: from, lt: to };
  const marketerId = target.marketerId;

  const [actualNewProspects, actualActivities, actualVisits, actualConversions] = await Promise.all([
    prisma.prospect.count({
      where: { dateAdded: periodFilter, ...(marketerId ? { assignedToId: marketerId } : {}) },
    }),
    prisma.marketingActivity.count({
      where: { activityDate: periodFilter, ...(marketerId ? { performedById: marketerId } : {}) },
    }),
    prisma.fieldVisit.count({
      where: { visitDate: periodFilter, ...(marketerId ? { marketerId } : {}) },
    }),
    prisma.prospectStageHistory.count({
      where: {
        toStage: "WON",
        changedAt: periodFilter,
        ...(marketerId ? { prospect: { assignedToId: marketerId } } : {}),
      },
    }),
  ]);

  return {
    ...target,
    actuals: {
      newProspects: actualNewProspects,
      activities: actualActivities,
      visits: actualVisits,
      conversions: actualConversions,
    },
  };
}

async function ensureTargetExists(id: string) {
  const exists = await prisma.marketingTarget.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.notFound(`Target ${id} not found.`);
}

async function ensureUserExists(id: string) {
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.badRequest(`User ${id} does not exist.`);
}
