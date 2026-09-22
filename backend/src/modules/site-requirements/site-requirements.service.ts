import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  SiteRequirementCreateInput,
  SiteRequirementUpdateInput,
  SiteRequirementListQuery,
} from "./site-requirements.validation";

/**
 * Creates a new site requirement. Validates siteId and shiftTypeId both
 * reference real records first, so a bad id comes back as a clean 400
 * rather than a raw Prisma foreign-key error.
 */
export async function createSiteRequirement(input: SiteRequirementCreateInput) {
  await ensureSiteExists(input.siteId);
  await ensureShiftTypeExists(input.shiftTypeId);

  // effectiveFrom defaults to now() at the DB level when omitted, so use
  // that same default here to catch a past effectiveTo even when the
  // request didn't explicitly send effectiveFrom.
  const effectiveFrom = input.effectiveFrom ?? new Date();
  ensureDateOrder(effectiveFrom, input.effectiveTo);

  return prisma.siteRequirement.create({
    data: {
      siteId: input.siteId,
      shiftTypeId: input.shiftTypeId,
      requiredOfficers: input.requiredOfficers,
      ...(input.effectiveFrom !== undefined && { effectiveFrom: input.effectiveFrom }),
      effectiveTo: input.effectiveTo,
      notes: input.notes,
    },
  });
}

/** Lists site requirements with optional siteId/shiftTypeId filters, paginated. */
export async function listSiteRequirements(query: SiteRequirementListQuery) {
  const where: Prisma.SiteRequirementWhereInput = {};

  if (query.siteId) where.siteId = query.siteId;
  if (query.shiftTypeId) where.shiftTypeId = query.shiftTypeId;

  const [total, rows] = await Promise.all([
    prisma.siteRequirement.count({ where }),
    prisma.siteRequirement.findMany({
      where,
      orderBy: { effectiveFrom: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        site: { select: { id: true, siteName: true } },
        shiftType: { select: { id: true, name: true, isActive: true } },
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

/** Fetches a single site requirement for the detail view. */
export async function getSiteRequirementById(id: string) {
  const requirement = await prisma.siteRequirement.findUnique({
    where: { id },
    include: {
      site: { select: { id: true, siteName: true, status: true } },
      shiftType: { select: { id: true, name: true, isActive: true } },
    },
  });

  if (!requirement) {
    throw ApiError.notFound(`Site requirement ${id} not found.`);
  }

  return requirement;
}

/** Updates a site requirement. Re-validates siteId/shiftTypeId if changed. */
export async function updateSiteRequirement(id: string, input: SiteRequirementUpdateInput) {
  const existing = await prisma.siteRequirement.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Site requirement ${id} not found.`);
  }

  if (input.siteId) await ensureSiteExists(input.siteId);
  if (input.shiftTypeId) await ensureShiftTypeExists(input.shiftTypeId);

  // Merge with the existing record before checking date order, so a
  // partial update (e.g. only effectiveTo) is validated against whichever
  // effectiveFrom actually ends up in force, not just what's in this request.
  const mergedEffectiveFrom = input.effectiveFrom ?? existing.effectiveFrom;
  const mergedEffectiveTo =
    input.effectiveTo !== undefined ? input.effectiveTo : existing.effectiveTo;
  ensureDateOrder(mergedEffectiveFrom, mergedEffectiveTo);

  return prisma.siteRequirement.update({
    where: { id },
    data: input,
  });
}

function ensureDateOrder(effectiveFrom: Date, effectiveTo: Date | null | undefined) {
  if (effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) {
    throw ApiError.badRequest("`effectiveTo` cannot be before `effectiveFrom`.");
  }
}

async function ensureSiteExists(siteId: string) {
  const exists = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Site ${siteId} does not exist.`);
  }
}

async function ensureShiftTypeExists(shiftTypeId: string) {
  const exists = await prisma.shiftType.findUnique({ where: { id: shiftTypeId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Shift type ${shiftTypeId} does not exist.`);
  }
}
