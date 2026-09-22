import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { calculateContractStatus, calculateDurationDays } from "../../lib/contractStatus";
import {
  ClientContractCreateInput,
  ClientContractUpdateInput,
  ClientContractListQuery,
} from "./client-contracts.validation";

/** Adds a computed `durationDays` field derived from start/end dates - never stored, always calculated fresh. */
function withDuration<T extends { startDate: Date; endDate: Date }>(contract: T) {
  return { ...contract, durationDays: calculateDurationDays(contract.startDate, contract.endDate) };
}

/**
 * Creates a new client contract. Validates clientId (required) and siteId
 * (optional) reference real records first. Status is always calculated
 * server-side from the dates - never trusted from the request body.
 */
export async function createClientContract(input: ClientContractCreateInput) {
  await ensureClientExists(input.clientId);
  if (input.siteId) await ensureSiteExists(input.siteId);

  const status = calculateContractStatus(input.startDate, input.endDate);

  const contract = await prisma.clientContract.create({
    data: {
      clientId: input.clientId,
      siteId: input.siteId,
      startDate: input.startDate,
      endDate: input.endDate,
      amount: input.amount,
      billingFrequency: input.billingFrequency,
      notes: input.notes,
      status,
    },
  });

  return withDuration(contract);
}

/** Lists client contracts with optional clientId/siteId/status filters, paginated. */
export async function listClientContracts(query: ClientContractListQuery) {
  const where: Prisma.ClientContractWhereInput = {};

  if (query.clientId) where.clientId = query.clientId;
  if (query.siteId) where.siteId = query.siteId;
  if (query.status) where.status = query.status as any;

  const [total, rows] = await Promise.all([
    prisma.clientContract.count({ where }),
    prisma.clientContract.findMany({
      where,
      orderBy: { endDate: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        client: { select: { id: true, name: true } },
        site: { select: { id: true, siteName: true } },
      },
    }),
  ]);

  return {
    data: rows.map(withDuration),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

/** Fetches a single client contract for the detail view. */
export async function getClientContractById(id: string) {
  const contract = await prisma.clientContract.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, status: true } },
      site: { select: { id: true, siteName: true, status: true } },
    },
  });

  if (!contract) {
    throw ApiError.notFound(`Client contract ${id} not found.`);
  }

  return withDuration(contract);
}

/**
 * Updates a client contract. If startDate/endDate change, status is
 * recalculated from the (possibly new) dates - it is never accepted
 * directly from the request body.
 */
export async function updateClientContract(id: string, input: ClientContractUpdateInput) {
  const existing = await prisma.clientContract.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Client contract ${id} not found.`);
  }

  if (input.clientId) await ensureClientExists(input.clientId);
  if (input.siteId) await ensureSiteExists(input.siteId);

  const newStartDate = input.startDate ?? existing.startDate;
  const newEndDate = input.endDate ?? existing.endDate;
  const status = calculateContractStatus(newStartDate, newEndDate);

  const contract = await prisma.clientContract.update({
    where: { id },
    data: { ...input, status },
  });

  return withDuration(contract);
}

/**
 * Recalculates and persists status for every client contract based on
 * today's date. Intended to be called on a schedule (e.g. once daily) once
 * a job scheduler exists - for now, exposed as a manual endpoint so status
 * doesn't silently go stale between edits.
 */
export async function refreshAllStatuses() {
  const contracts = await prisma.clientContract.findMany({
    select: { id: true, startDate: true, endDate: true, status: true },
  });

  let updatedCount = 0;
  for (const c of contracts) {
    const newStatus = calculateContractStatus(c.startDate, c.endDate);
    if (newStatus !== c.status) {
      await prisma.clientContract.update({ where: { id: c.id }, data: { status: newStatus } });
      updatedCount++;
    }
  }

  return { totalChecked: contracts.length, updatedCount };
}

async function ensureClientExists(clientId: string) {
  const exists = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Client ${clientId} does not exist.`);
  }
}

async function ensureSiteExists(siteId: string) {
  const exists = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Site ${siteId} does not exist.`);
  }
}
