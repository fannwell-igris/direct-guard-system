import { Prisma, InvoiceStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { InvoiceCreateInput, InvoiceUpdateInput, InvoiceListQuery } from "./invoices.validation";
import * as settingsService from "../settings/settings.service";

/**
 * Creates a new invoice. Validates clientId exists, and — if siteId is
 * given — that the site belongs to that client. invoiceNumber is
 * generated here (format INV-<year>-<0000>, sequential per year, based on
 * the count of invoices already created that year); this is a
 * best-effort sequence, not a hard database guarantee, same caveat as the
 * AllowanceType/DeductionType duplicate-name check elsewhere in this
 * project. amountPaid starts at 0 and outstandingBalance starts equal to
 * the full amount, since no Payment exists yet.
 */
export async function createInvoice(input: InvoiceCreateInput) {
  await ensureClientExists(input.clientId);
  if (input.siteId) await ensureSiteBelongsToClient(input.siteId, input.clientId);

  const invoiceNumber = await generateInvoiceNumber(input.invoiceDate);

  return prisma.invoice.create({
    data: {
      invoiceNumber,
      clientId: input.clientId,
      siteId: input.siteId,
      invoiceDate: input.invoiceDate,
      billingPeriod: input.billingPeriod,
      dueDate: input.dueDate,
      amount: input.amount,
      amountPaid: 0,
      outstandingBalance: input.amount,
      notes: input.notes,
    },
  });
}

/**
 * Flips any ISSUED invoice whose due date has passed into OVERDUE.
 *
 * Invoice status was previously only ever recalculated by
 * `recalculateInvoice` below, which only runs when a payment is
 * created/edited/deleted — so an invoice sat at "Issued" forever once its
 * due date passed, until someone happened to touch a payment on it. This
 * sweep closes that gap: it's called at the top of every read path that
 * surfaces invoice status (list/detail here, plus the dashboard's own
 * invoice queries), so the status is always correct as of "now" rather
 * than as of whenever a payment last changed. Safe to call as often as
 * needed — it's a no-op once nothing is newly overdue. (2026-09-23: added
 * after invoices past their due date were still showing as "Issued".)
 */
export async function syncOverdueInvoices(): Promise<void> {
  await prisma.invoice.updateMany({
    where: { status: "ISSUED", dueDate: { lt: new Date() } },
    data: { status: "OVERDUE" },
  });
}

/** Lists invoices with optional filters, paginated. */
export async function listInvoices(query: InvoiceListQuery) {
  await syncOverdueInvoices();
  const where = buildWhere(query);

  const [total, rows] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: { invoiceDate: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        client: { select: { id: true, name: true } },
        site: { select: { id: true, siteName: true } },
        _count: { select: { payments: true } },
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

/** Fetches a single invoice with its payments. */
export async function getInvoiceById(id: string) {
  await syncOverdueInvoices();
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      site: { select: { id: true, siteName: true } },
      payments: { orderBy: { paymentDate: "asc" } },
    },
  });
  if (!invoice) {
    throw ApiError.notFound(`Invoice ${id} not found.`);
  }
  return invoice;
}

/**
 * Updates an invoice's editable fields. Locked once CANCELLED. If amount
 * changes, it's rejected if the new amount would be less than what's
 * already been paid (would make outstandingBalance negative), and
 * status/outstandingBalance are recalculated against the new amount.
 */
export async function updateInvoice(id: string, input: InvoiceUpdateInput) {
  const existing = await prisma.invoice.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Invoice ${id} not found.`);
  }
  if (existing.status === "CANCELLED") {
    throw ApiError.badRequest(`Invoice ${id} is cancelled and cannot be edited.`);
  }

  if (input.siteId) await ensureSiteBelongsToClient(input.siteId, existing.clientId);

  const newAmount = input.amount !== undefined ? input.amount : Number(existing.amountPaid) + Number(existing.outstandingBalance);
  if (input.amount !== undefined && input.amount < Number(existing.amountPaid)) {
    throw ApiError.badRequest(
      `\`amount\` (${input.amount}) cannot be less than the amount already paid (${existing.amountPaid}).`
    );
  }

  await prisma.invoice.update({ where: { id }, data: input });

  return recalculateInvoice(id, newAmount);
}

/** Moves an invoice from DRAFT to ISSUED. One-way, one-time. */
export async function issueInvoice(id: string) {
  const existing = await prisma.invoice.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Invoice ${id} not found.`);
  }
  if (existing.status !== "DRAFT") {
    throw ApiError.badRequest(`Invoice ${id} is ${existing.status} and cannot be issued (only DRAFT invoices can be).`);
  }
  return prisma.invoice.update({ where: { id }, data: { status: "ISSUED" } });
}

/**
 * Cancels an invoice. Only allowed while no payments have been recorded
 * against it — an invoice someone has already paid against shouldn't be
 * silently cancelled; that needs a real accounting decision, not this
 * endpoint. Terminal — a cancelled invoice cannot be edited or reissued.
 */
export async function cancelInvoice(id: string) {
  const existing = await prisma.invoice.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Invoice ${id} not found.`);
  }
  if (existing.status === "CANCELLED") {
    throw ApiError.badRequest(`Invoice ${id} is already cancelled.`);
  }
  if (Number(existing.amountPaid) > 0) {
    throw ApiError.badRequest(
      `Invoice ${id} has payments recorded against it (${existing.amountPaid} paid) and cannot be cancelled.`
    );
  }
  return prisma.invoice.update({ where: { id }, data: { status: "CANCELLED" } });
}

// A DRAFT, CANCELLED, or OVERDUE invoice can be hard-deleted — ISSUED and
// PAID (and PARTIALLY_PAID, which always has payments recorded) are real
// financial history and must be cancelled first (see cancelInvoice above),
// never deleted outright. The zero-payments check just below is what
// actually protects a PARTIALLY_PAID invoice: an OVERDUE invoice with $0
// paid is allowed through, but the moment any payment exists (whatever the
// status), deletion is refused. Added 2026-09-25, per explicit instruction:
// trial/test invoices created before go-live needed a way to be cleared
// out, and separately the Admin wanted the ability to delete a cancelled
// or overdue-but-unpaid invoice rather than have it linger forever. This
// sits behind the existing Admin password-confirmation middleware
// (requireDeleteConfirmation) like every other delete in the system.
const DELETABLE_STATUSES: InvoiceStatus[] = ["DRAFT", "CANCELLED", "OVERDUE"];

export async function deleteInvoice(id: string) {
  const existing = await prisma.invoice.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Invoice ${id} not found.`);
  }
  if (!DELETABLE_STATUSES.includes(existing.status)) {
    throw ApiError.badRequest(
      `Invoice ${existing.invoiceNumber} is ${existing.status} and cannot be deleted directly — cancel it first (only while it has no payments), then delete.`
    );
  }
  // Belt and suspenders: cancelInvoice already requires amountPaid === 0,
  // but a DRAFT invoice can technically pick up a payment (see
  // recalculateInvoice's comment below), so this is checked independently
  // of status.
  if (Number(existing.amountPaid) > 0) {
    throw ApiError.badRequest(
      `Invoice ${existing.invoiceNumber} has payments recorded against it and cannot be deleted.`
    );
  }

  try {
    await prisma.invoice.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      throw ApiError.badRequest(
        `Invoice ${existing.invoiceNumber} still has related records (e.g. payments) and cannot be deleted.`
      );
    }
    throw err;
  }
}

/**
 * Wipes EVERY invoice and payment record in the system. Added 2026-09-25,
 * per explicit instruction, to clear out trial/test invoices created
 * before go-live so real invoicing can start clean. Payments are deleted
 * first (Payment.invoice is onDelete: Restrict, so an invoice with
 * payments can't be removed until they're gone). Optionally also resets
 * the current year's invoice-number sequence (see peekNextInvoiceNumber /
 * generateInvoiceNumber below) so the very next invoice created picks up
 * at a chosen number instead of continuing wherever it left off.
 *
 * Gated in the controller to ADMIN + an exact confirmation phrase, and
 * sits behind the app-wide requireDeleteConfirmation password re-check
 * like every other delete (this is a DELETE request).
 */
export async function wipeAllInvoices(resetNumberingTo?: number) {
  const [deletedPayments, deletedInvoices] = await prisma.$transaction([
    prisma.payment.deleteMany({}),
    prisma.invoice.deleteMany({}),
  ]);

  let numberingReset: string | undefined;
  if (typeof resetNumberingTo === "number" && resetNumberingTo > 0) {
    const year = new Date().getUTCFullYear();
    numberingReset = await setInvoiceNumberSequence(year, resetNumberingTo);
  }

  return {
    deletedPayments: deletedPayments.count,
    deletedInvoices: deletedInvoices.count,
    numberingReset,
  };
}

/**
 * Recalculates amountPaid/outstandingBalance/status from the invoice's
 * actual Payments — called after every payment create/edit/delete, per
 * the schema's own comment on Invoice.amountPaid. `amountOverride` lets
 * updateInvoice pass in a not-yet-committed new `amount` so this always
 * reads consistent numbers rather than racing its own update.
 *
 * Status logic: CANCELLED is terminal and never overridden here. PAID/
 * PARTIALLY_PAID are driven purely by whether a payment exists, even for
 * a still-DRAFT invoice — money changing hands means it's no longer just
 * a draft, regardless of whether someone clicked "issue." DRAFT with zero
 * payments stays DRAFT (an unissued invoice is never "overdue"). Anything
 * else (ISSUED, zero payments) becomes OVERDUE once past its due date.
 */
export async function recalculateInvoice(invoiceId: string, amountOverride?: number) {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const amount = amountOverride !== undefined ? amountOverride : Number(invoice.amount);

  const paymentsSum = await prisma.payment.aggregate({
    where: { invoiceId },
    _sum: { amount: true },
  });
  const amountPaid = Number(paymentsSum._sum.amount ?? 0);
  const outstandingBalance = Math.max(0, amount - amountPaid);

  let status: InvoiceStatus;
  if (invoice.status === "CANCELLED") {
    status = "CANCELLED";
  } else if (amountPaid >= amount && amount > 0) {
    status = "PAID";
  } else if (amountPaid > 0) {
    status = "PARTIALLY_PAID";
  } else if (invoice.status === "DRAFT") {
    status = "DRAFT";
  } else if (invoice.dueDate.getTime() < Date.now()) {
    status = "OVERDUE";
  } else {
    status = "ISSUED";
  }

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { amountPaid, outstandingBalance, status },
  });
}

function buildWhere(query: InvoiceListQuery): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {};
  if (query.clientId) where.clientId = query.clientId;
  if (query.siteId) where.siteId = query.siteId;
  if (query.status) where.status = query.status as InvoiceStatus;
  if (query.dateFrom || query.dateTo) {
    where.invoiceDate = {
      ...(query.dateFrom ? { gte: query.dateFrom } : {}),
      ...(query.dateTo ? { lte: query.dateTo } : {}),
    };
  }
  return where;
}

// Invoice numbering (format INV-<year>-<0000>) is now a persisted,
// admin-editable counter kept in the "finance" settings section
// (finance.invoiceNumberSequences, e.g. { "2026": 399 }) rather than
// derived from how many invoices happen to exist for the year — that
// count-based approach broke the moment invoices could be deleted (see
// wipeAllInvoices/deleteInvoice above), since removing invoices would
// silently shift every number that came after them. Changed 2026-09-25.
//
// Each key is the year (as a string, since JSON object keys are always
// strings) mapped to the NEXT sequence number to hand out for that year.
// A year with no entry yet starts at 1. Settings > Invoicing lets an
// Admin view/override this directly (e.g. to continue an existing
// paper/manual numbering sequence, or to restart after a bulk wipe).
async function generateInvoiceNumber(invoiceDate: Date): Promise<string> {
  const year = invoiceDate.getUTCFullYear();
  const finance = (await settingsService.getSection("finance")) as {
    invoiceNumberSequences?: Record<string, number>;
  };
  const sequences = { ...(finance.invoiceNumberSequences ?? {}) };
  const next = sequences[String(year)] ?? 1;
  sequences[String(year)] = next + 1;
  await settingsService.updateSection("finance", { invoiceNumberSequences: sequences });
  return `INV-${year}-${String(next).padStart(4, "0")}`;
}

/**
 * Read-only peek at the number the NEXT invoice for this year would get,
 * without reserving/incrementing it — used by the New Invoice form to
 * show the number live before the invoice is actually created.
 */
export async function peekNextInvoiceNumber(invoiceDate: Date): Promise<string> {
  const year = invoiceDate.getUTCFullYear();
  const finance = (await settingsService.getSection("finance")) as {
    invoiceNumberSequences?: Record<string, number>;
  };
  const next = finance.invoiceNumberSequences?.[String(year)] ?? 1;
  return `INV-${year}-${String(next).padStart(4, "0")}`;
}

/** Directly sets the next sequence number to hand out for a given year. */
async function setInvoiceNumberSequence(year: number, nextNumber: number): Promise<string> {
  const finance = (await settingsService.getSection("finance")) as {
    invoiceNumberSequences?: Record<string, number>;
  };
  const sequences = { ...(finance.invoiceNumberSequences ?? {}), [String(year)]: nextNumber };
  await settingsService.updateSection("finance", { invoiceNumberSequences: sequences });
  return `INV-${year}-${String(nextNumber).padStart(4, "0")}`;
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
