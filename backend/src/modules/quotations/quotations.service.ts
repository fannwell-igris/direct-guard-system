import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import * as settingsService from "../settings/settings.service";
import {
  QuotationCreateInput,
  QuotationUpdateInput,
  QuotationListQuery,
  QuotationStatus,
  LineItem,
} from "./quotations.validation";

/**
 * Creates a new quotation with an auto-generated quotation number.
 *
 * If `input.startingNumber` is set, the sequence for that year is first
 * advanced to that number, then the quotation is issued at that number.
 * Subsequent quotations continue from there automatically.
 */
export async function createQuotation(input: QuotationCreateInput) {
  const year = input.quotationDate.getUTCFullYear();

  if (input.startingNumber !== null && input.startingNumber !== undefined) {
    await setQuotationNumberSequence(year, input.startingNumber);
  }

  const quotationNumber = await generateQuotationNumber(input.quotationDate);

  return prisma.quotation.create({
    data: {
      quotationNumber,
      customerName: input.customerName,
      customerLocation: input.customerLocation ?? null,
      quotationDate: input.quotationDate,
      validUntil: input.validUntil ?? null,
      lineItems: input.lineItems as unknown as Prisma.JsonArray,
      discount: input.discount ?? null,
      amount: input.amount,
      preparedBy: input.preparedBy,
      notes: input.notes ?? null,
      // status defaults to DRAFT per schema
    },
  });
}

/** Lists quotations with optional filters and pagination. */
export async function listQuotations(query: QuotationListQuery) {
  const where = buildWhere(query);

  const [total, data] = await Promise.all([
    prisma.quotation.count({ where }),
    prisma.quotation.findMany({
      where,
      orderBy: { quotationDate: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
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

/** Fetches a single quotation by id. */
export async function getQuotationById(id: string) {
  const quotation = await prisma.quotation.findUnique({ where: { id } });
  if (!quotation) throw ApiError.notFound(`Quotation ${id} not found.`);
  return quotation;
}

/** Updates editable fields on a quotation. Only allowed on DRAFT quotations. */
export async function updateQuotation(id: string, input: QuotationUpdateInput) {
  const existing = await prisma.quotation.findUnique({
    where: { id },
    select: { id: true, status: true, lineItems: true, discount: true },
  });
  if (!existing) throw ApiError.notFound(`Quotation ${id} not found.`);
  if (existing.status !== "DRAFT") {
    throw ApiError.badRequest(
      `Quotation is ${existing.status} and can no longer be edited. Only DRAFT quotations can be updated.`
    );
  }

  // If discount changed but lineItems weren't sent, recompute amount from existing line items
  const data: Prisma.QuotationUpdateInput = {};
  if (input.customerName !== undefined) data.customerName = input.customerName;
  if (input.customerLocation !== undefined) data.customerLocation = input.customerLocation;
  if (input.quotationDate !== undefined) data.quotationDate = input.quotationDate;
  if (input.validUntil !== undefined) data.validUntil = input.validUntil;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.lineItems !== undefined) {
    data.lineItems = input.lineItems as unknown as Prisma.JsonArray;
  }
  if (input.discount !== undefined) data.discount = input.discount;

  // Recompute amount when lineItems or discount changes
  if (input.lineItems !== undefined || input.discount !== undefined) {
    const lineItems: LineItem[] =
      input.lineItems !== undefined
        ? input.lineItems
        : (existing.lineItems as unknown as LineItem[]);
    const disc =
      input.discount !== undefined
        ? (input.discount ?? 0)
        : Number(existing.discount ?? 0);
    const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
    data.amount = Math.max(0, subtotal - disc);
  }

  return prisma.quotation.update({ where: { id }, data });
}

/** Transitions DRAFT → SENT. */
export async function sendQuotation(id: string) {
  return transitionStatus(id, "DRAFT", "SENT", "mark as Sent");
}

/** Transitions DRAFT or SENT → ACCEPTED. */
export async function acceptQuotation(id: string) {
  const q = await requireQuotation(id);
  if (q.status !== "DRAFT" && q.status !== "SENT") {
    throw ApiError.badRequest(
      `Quotation is ${q.status}. Only DRAFT or SENT quotations can be accepted.`
    );
  }
  return prisma.quotation.update({ where: { id }, data: { status: "ACCEPTED" } });
}

/** Transitions DRAFT or SENT → REJECTED. */
export async function rejectQuotation(id: string) {
  const q = await requireQuotation(id);
  if (q.status !== "DRAFT" && q.status !== "SENT") {
    throw ApiError.badRequest(
      `Quotation is ${q.status}. Only DRAFT or SENT quotations can be rejected.`
    );
  }
  return prisma.quotation.update({ where: { id }, data: { status: "REJECTED" } });
}

/** Transitions DRAFT or SENT → EXPIRED. */
export async function expireQuotation(id: string) {
  const q = await requireQuotation(id);
  if (q.status !== "DRAFT" && q.status !== "SENT") {
    throw ApiError.badRequest(
      `Quotation is ${q.status}. Only DRAFT or SENT quotations can be expired.`
    );
  }
  return prisma.quotation.update({ where: { id }, data: { status: "EXPIRED" } });
}

/**
 * Hard-deletes a quotation. Only DRAFT quotations may be deleted.
 */
export async function deleteQuotation(id: string) {
  const existing = await prisma.quotation.findUnique({
    where: { id },
    select: { id: true, quotationNumber: true, status: true },
  });
  if (!existing) throw ApiError.notFound(`Quotation ${id} not found.`);
  if (existing.status !== "DRAFT") {
    throw ApiError.badRequest(
      `Quotation ${existing.quotationNumber} is ${existing.status} and cannot be deleted. ` +
        `Only DRAFT quotations can be deleted.`
    );
  }
  await prisma.quotation.delete({ where: { id } });
  return { id, quotationNumber: existing.quotationNumber };
}

/**
 * Read-only peek at the number the NEXT quotation for this year would get,
 * without reserving/incrementing it — used by the New Quotation form.
 */
export async function peekNextQuotationNumber(quotationDate: Date): Promise<string> {
  const year = quotationDate.getUTCFullYear();
  const finance = (await settingsService.getSection("finance")) as {
    quotationNumberSequences?: Record<string, number>;
  };
  const next = finance.quotationNumberSequences?.[String(year)] ?? 1;
  return `QUO-${year}-${String(next).padStart(4, "0")}`;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function buildWhere(query: QuotationListQuery): Prisma.QuotationWhereInput {
  const where: Prisma.QuotationWhereInput = {};
  if (query.status) where.status = query.status as QuotationStatus;
  if (query.dateFrom || query.dateTo) {
    where.quotationDate = {
      ...(query.dateFrom ? { gte: query.dateFrom } : {}),
      ...(query.dateTo ? { lte: query.dateTo } : {}),
    };
  }
  return where;
}

async function requireQuotation(id: string) {
  const q = await prisma.quotation.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!q) throw ApiError.notFound(`Quotation ${id} not found.`);
  return q;
}

async function transitionStatus(
  id: string,
  from: QuotationStatus,
  to: QuotationStatus,
  verb: string
) {
  const q = await requireQuotation(id);
  if (q.status !== from) {
    throw ApiError.badRequest(
      `Quotation is ${q.status}. Only ${from} quotations can be ${verb}ed.`
    );
  }
  return prisma.quotation.update({ where: { id }, data: { status: to } });
}

// Quotation numbering — same pattern as Invoice numbering.
// Counter is stored in the "finance" settings section under
// finance.quotationNumberSequences (e.g. { "2026": 5 }).

async function generateQuotationNumber(quotationDate: Date): Promise<string> {
  const year = quotationDate.getUTCFullYear();
  const finance = (await settingsService.getSection("finance")) as {
    quotationNumberSequences?: Record<string, number>;
  };
  const sequences = { ...(finance.quotationNumberSequences ?? {}) };
  const next = sequences[String(year)] ?? 1;
  sequences[String(year)] = next + 1;
  await settingsService.updateSection("finance", { quotationNumberSequences: sequences });
  return `QUO-${year}-${String(next).padStart(4, "0")}`;
}

async function setQuotationNumberSequence(year: number, nextNumber: number): Promise<void> {
  const finance = (await settingsService.getSection("finance")) as {
    quotationNumberSequences?: Record<string, number>;
  };
  const sequences = { ...(finance.quotationNumberSequences ?? {}), [String(year)]: nextNumber };
  await settingsService.updateSection("finance", { quotationNumberSequences: sequences });
}
