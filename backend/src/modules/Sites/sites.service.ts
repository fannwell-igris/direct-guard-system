import { Prisma, RecordStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  SiteCreateInput,
  SiteUpdateInput,
  SiteListQuery,
} from "./sites.validation";

/**
 * Creates a new site under a client. Validates that the referenced client
 * exists first so the failure comes back as a clean 404 rather than a raw
 * Prisma foreign-key error.
 */
export async function createSite(input: SiteCreateInput) {
  await ensureClientExists(input.clientId);

  return prisma.site.create({
    data: {
      clientId: input.clientId,
      siteName: input.siteName,
      location: input.location,
      notes: input.notes,
      // status defaults to ACTIVE per schema
    },
  });
}

/**
 * Lists sites with optional free-text search (siteName/location), status
 * filter, and clientId filter, paginated.
 */
export async function listSites(query: SiteListQuery) {
  const where: Prisma.SiteWhereInput = {};

  if (query.status) {
    where.status = query.status;
  }

  if (query.clientId) {
    where.clientId = query.clientId;
  }

  if (query.search) {
    where.OR = [
      { siteName: { contains: query.search, mode: "insensitive" } },
      { location: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [total, data] = await Promise.all([
    prisma.site.count({ where }),
    prisma.site.findMany({
      where,
      orderBy: { siteName: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      // Lightweight client reference + counts so the list view can show
      // context and activity without pulling full related records.
      include: {
        // status included so callers (e.g. Roster's site picker) can hide
        // sites whose client has been archived — a site's own status isn't
        // automatically changed when its client is archived, so this is
        // the only way to tell from the sites list.
        client: {
          select: { id: true, name: true, status: true },
        },
        _count: {
          select: {
            employees: true,
            clientContracts: true,
            invoices: true,
          },
        },
      },
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

/** Fetches a single site with its related records for the detail view. */
export async function getSiteById(id: string) {
  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      client: {
        select: { id: true, name: true, status: true },
      },
      employees: true,
      clientContracts: {
        orderBy: { startDate: "desc" },
        take: 10,
      },
      invoices: {
        orderBy: { invoiceDate: "desc" },
        take: 10,
      },
      _count: {
        select: {
          employees: true,
          clientContracts: true,
          invoices: true,
          operationalCosts: true,
        },
      },
    },
  });

  if (!site) {
    throw ApiError.notFound(`Site ${id} not found.`);
  }

  return site;
}

/** Updates editable fields on a site. Does not touch `status`. */
export async function updateSite(id: string, input: SiteUpdateInput) {
  await ensureSiteExists(id);

  if (input.clientId) {
    await ensureClientExists(input.clientId);
  }

  return prisma.site.update({
    where: { id },
    data: input,
  });
}

/**
 * Changes a site's status (ACTIVE / INACTIVE / ARCHIVED). This is the only
 * supported "removal" path, consistent with the Clients module — sites are
 * never hard-deleted, since `onDelete: Restrict` on their related records
 * would reject it anyway once any operational/financial history exists.
 */
export async function setSiteStatus(id: string, status: RecordStatus) {
  await ensureSiteExists(id);

  return prisma.site.update({
    where: { id },
    data: { status },
  });
}

async function ensureSiteExists(id: string) {
  const exists = await prisma.site.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    throw ApiError.notFound(`Site ${id} not found.`);
  }
}

async function ensureClientExists(clientId: string) {
  const exists = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Client ${clientId} does not exist.`);
  }
}
