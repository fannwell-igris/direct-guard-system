import { Prisma, RecordStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  ClientCreateInput,
  ClientUpdateInput,
  ClientListQuery,
} from "./clients.validation";

/**
 * Creates a new client. `email` has no unique constraint in the current
 * schema, so duplicates are allowed at the DB level; if the business rule
 * later requires uniqueness, add `@unique` to Client.email in schema.prisma
 * and this will surface as a 409 automatically via the shared error handler.
 */
export async function createClient(input: ClientCreateInput) {
  return prisma.client.create({
    data: {
      name: input.name,
      location: input.location,
      phone: input.phone,
      email: input.email,
      address: input.address,
      notes: input.notes,
      // status defaults to ACTIVE per schema
    },
  });
}

/**
 * Lists clients with optional free-text search (name/location/phone/email)
 * and status filter, paginated.
 */
export async function listClients(query: ClientListQuery) {
  const where: Prisma.ClientWhereInput = {};

  if (query.status) {
    where.status = query.status;
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { location: { contains: query.search, mode: "insensitive" } },
      { phone: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [total, data] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      // Lightweight counts so the list view can show activity without
      // pulling full related records.
      include: {
        _count: {
          select: {
            sites: true,
            invoices: true,
            clientContracts: true,
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

/** Fetches a single client with its related records for the detail view. */
export async function getClientById(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      sites: true,
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
          sites: true,
          employees: true,
          clientContracts: true,
          invoices: true,
          payments: true,
          operationalCosts: true,
        },
      },
    },
  });

  if (!client) {
    throw ApiError.notFound(`Client ${id} not found.`);
  }

  return client;
}

/** Updates editable fields on a client. Does not touch `status`. */
export async function updateClient(id: string, input: ClientUpdateInput) {
  await ensureClientExists(id);

  return prisma.client.update({
    where: { id },
    data: input,
  });
}

/**
 * Changes a client's status (ACTIVE / INACTIVE / ARCHIVED). This is the
 * only supported "removal" path per Section 19 — clients are never
 * hard-deleted, since `onDelete: Restrict` on their related records would
 * reject it anyway once any financial history exists.
 */
export async function setClientStatus(id: string, status: RecordStatus) {
  await ensureClientExists(id);

  return prisma.client.update({
    where: { id },
    data: { status },
  });
}

async function ensureClientExists(id: string) {
  const exists = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    throw ApiError.notFound(`Client ${id} not found.`);
  }
}
