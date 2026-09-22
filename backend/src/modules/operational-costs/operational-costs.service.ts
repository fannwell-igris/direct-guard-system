import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  OperationalCostCreateInput,
  OperationalCostUpdateInput,
  OperationalCostListQuery,
} from "./operational-costs.validation";

/**
 * Creates a new operational cost record. Validates clientId and siteId
 * exist, and that the site actually belongs to that client — a cost
 * logged against a site that belongs to a different client would silently
 * misattribute spend, so this is checked rather than trusted.
 */
export async function createOperationalCost(input: OperationalCostCreateInput) {
  await ensureClientExists(input.clientId);
  await ensureSiteBelongsToClient(input.siteId, input.clientId);

  return prisma.operationalCost.create({
    data: {
      clientId: input.clientId,
      siteId: input.siteId,
      month: input.month,
      costCategory: input.costCategory,
      amount: input.amount,
      description: input.description,
      notes: input.notes,
    },
  });
}

/** Lists operational costs with optional filters, paginated. */
export async function listOperationalCosts(query: OperationalCostListQuery) {
  const where = buildWhere(query);

  const [total, rows] = await Promise.all([
    prisma.operationalCost.count({ where }),
    prisma.operationalCost.findMany({
      where,
      orderBy: { month: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        client: { select: { id: true, name: true } },
        site: { select: { id: true, siteName: true } },
      },
    }),
  ]);

  return {
    data: rows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

/** Fetches a single operational cost record. */
export async function getOperationalCostById(id: string) {
  const cost = await prisma.operationalCost.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      site: { select: { id: true, siteName: true } },
    },
  });
  if (!cost) {
    throw ApiError.notFound(`Operational cost ${id} not found.`);
  }
  return cost;
}

/**
 * Updates an operational cost record. If clientId or siteId change, the
 * site-belongs-to-client check is re-run against the *merged* result, so
 * changing just one of the two can't produce a mismatched pair.
 */
export async function updateOperationalCost(id: string, input: OperationalCostUpdateInput) {
  const existing = await prisma.operationalCost.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Operational cost ${id} not found.`);
  }

  const mergedClientId = input.clientId ?? existing.clientId;
  const mergedSiteId = input.siteId ?? existing.siteId;

  if (input.clientId) await ensureClientExists(input.clientId);
  if (input.clientId || input.siteId) {
    await ensureSiteBelongsToClient(mergedSiteId, mergedClientId);
  }

  return prisma.operationalCost.update({
    where: { id },
    data: input,
  });
}

function buildWhere(query: OperationalCostListQuery): Prisma.OperationalCostWhereInput {
  const where: Prisma.OperationalCostWhereInput = {};
  if (query.clientId) where.clientId = query.clientId;
  if (query.siteId) where.siteId = query.siteId;
  if (query.costCategory) where.costCategory = query.costCategory;
  if (query.monthFrom || query.monthTo) {
    where.month = {
      ...(query.monthFrom ? { gte: query.monthFrom } : {}),
      ...(query.monthTo ? { lte: query.monthTo } : {}),
    };
  }
  return where;
}

async function ensureClientExists(clientId: string) {
  const exists = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Client ${clientId} does not exist.`);
  }
}

async function ensureSiteBelongsToClient(siteId: string, clientId: string) {
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true, clientId: true } });
  if (!site) {
    throw ApiError.badRequest(`Site ${siteId} does not exist.`);
  }
  if (site.clientId !== clientId) {
    throw ApiError.badRequest(`Site ${siteId} does not belong to client ${clientId}.`);
  }
}
