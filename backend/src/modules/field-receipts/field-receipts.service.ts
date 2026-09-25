import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  FieldReceiptCreateInput,
  FieldReceiptReconcileInput,
  FieldReceiptListQuery,
} from "./field-receipts.validation";

export async function createFieldReceipt(input: FieldReceiptCreateInput) {
  if (input.siteId) {
    const site = await prisma.site.findUnique({ where: { id: input.siteId }, select: { id: true } });
    if (!site) throw ApiError.badRequest(`Site ${input.siteId} does not exist.`);
  }

  return prisma.fieldReceiptEntry.create({
    data: {
      referenceNumber: input.referenceNumber,
      amount: input.amount,
      date: input.date,
      purpose: input.purpose,
      siteId: input.siteId,
      recordedBy: input.recordedBy,
      notes: input.notes,
      status: "PENDING",
    },
    include: { site: { select: { id: true, siteName: true } } },
  });
}

export async function listFieldReceipts(query: FieldReceiptListQuery) {
  const where: Prisma.FieldReceiptEntryWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.siteId) where.siteId = query.siteId;

  const [total, data] = await Promise.all([
    prisma.fieldReceiptEntry.count({ where }),
    prisma.fieldReceiptEntry.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { site: { select: { id: true, siteName: true } } },
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

export async function getFieldReceiptById(id: string) {
  const entry = await prisma.fieldReceiptEntry.findUnique({
    where: { id },
    include: { site: { select: { id: true, siteName: true } } },
  });
  if (!entry) throw ApiError.notFound(`Field receipt entry ${id} not found.`);
  return entry;
}

/**
 * Finance/Admin reconciles a field-entered receipt against the physical
 * one now in hand — RECONCILED if it matches, DISCREPANCY if it doesn't
 * (wrong amount, altered reference number, missing entirely, etc.), so
 * the mismatch is visible rather than silently overwritten.
 */
export async function reconcileFieldReceipt(id: string, input: FieldReceiptReconcileInput) {
  const existing = await prisma.fieldReceiptEntry.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound(`Field receipt entry ${id} not found.`);
  if (existing.status !== "PENDING")
    throw ApiError.badRequest(`Field receipt entry ${id} has already been reconciled (${existing.status}).`);

  return prisma.fieldReceiptEntry.update({
    where: { id },
    data: {
      status: input.status,
      reconciledBy: input.reconciledBy,
      reconciledAt: new Date(),
      reconciliationNotes: input.reconciliationNotes,
    },
    include: { site: { select: { id: true, siteName: true } } },
  });
}
