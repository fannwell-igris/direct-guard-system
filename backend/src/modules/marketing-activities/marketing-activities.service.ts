import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { ActivityCreateInput, ActivityUpdateInput, ActivityListQuery } from "./marketing-activities.validation";

const INCLUDE = {
  prospect: { select: { id: true, companyName: true } },
  client: { select: { id: true, name: true } },
  performedBy: { select: { id: true, fullName: true } },
};

export async function createActivity(input: ActivityCreateInput, performedById: string | null) {
  if (input.prospectId) await ensureProspectExists(input.prospectId);
  if (input.clientId) await ensureClientExists(input.clientId);

  return prisma.marketingActivity.create({
    data: {
      type: input.type,
      prospectId: input.prospectId,
      clientId: input.clientId,
      purpose: input.purpose,
      outcome: input.outcome,
      nextAction: input.nextAction,
      followUpDate: input.followUpDate,
      notes: input.notes,
      activityDate: input.activityDate ?? new Date(),
      performedById,
    },
    include: INCLUDE,
  });
}

/**
 * Lists activities with optional filters, paginated, most recent first.
 * This is what the "Activity" side of the brief's Activity-vs-Results
 * distinction (and the daily/weekly reports) reads from — count by type
 * over a date range, rather than a single blended number.
 */
export async function listActivities(query: ActivityListQuery) {
  const where: Prisma.MarketingActivityWhereInput = {};

  if (query.type) where.type = query.type;
  if (query.prospectId) where.prospectId = query.prospectId;
  if (query.clientId) where.clientId = query.clientId;
  if (query.performedById) where.performedById = query.performedById;
  if (query.dateFrom || query.dateTo) {
    where.activityDate = {
      ...(query.dateFrom ? { gte: query.dateFrom } : {}),
      ...(query.dateTo ? { lte: query.dateTo } : {}),
    };
  }

  const [total, data] = await Promise.all([
    prisma.marketingActivity.count({ where }),
    prisma.marketingActivity.findMany({
      where,
      orderBy: { activityDate: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: INCLUDE,
    }),
  ]);

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

export async function getActivityById(id: string) {
  const activity = await prisma.marketingActivity.findUnique({ where: { id }, include: INCLUDE });
  if (!activity) throw ApiError.notFound(`Activity ${id} not found.`);
  return activity;
}

export async function updateActivity(id: string, input: ActivityUpdateInput) {
  await ensureActivityExists(id);
  if (input.prospectId) await ensureProspectExists(input.prospectId);
  if (input.clientId) await ensureClientExists(input.clientId);

  return prisma.marketingActivity.update({
    where: { id },
    data: input,
    include: INCLUDE,
  });
}

/**
 * Hard delete — a genuine data-entry correction, same convention as
 * Payments (see payments.service.ts). This is a log of what was done, not
 * a financial record with downstream dependents, so no archive/status
 * dance is needed here.
 */
export async function deleteActivity(id: string) {
  await ensureActivityExists(id);
  await prisma.marketingActivity.delete({ where: { id } });
}

async function ensureActivityExists(id: string) {
  const exists = await prisma.marketingActivity.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.notFound(`Activity ${id} not found.`);
}

async function ensureProspectExists(id: string) {
  const exists = await prisma.prospect.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.badRequest(`Prospect ${id} does not exist.`);
}

async function ensureClientExists(id: string) {
  const exists = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.badRequest(`Client ${id} does not exist.`);
}
