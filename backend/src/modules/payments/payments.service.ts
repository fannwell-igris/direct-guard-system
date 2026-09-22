import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { recalculateInvoice } from "../invoices/invoices.service";
import { PaymentCreateInput, PaymentUpdateInput } from "./payments.validation";

/**
 * Records a new payment against an invoice. clientId is always
 * snapshotted from the invoice (never accepted from the caller), same
 * pattern as RosterEntry/OperationsRecord clientId. Rejects payments
 * against a CANCELLED invoice. After creating, recalculates the parent
 * invoice's amountPaid/outstandingBalance/status — see
 * invoices.service.ts's recalculateInvoice for the exact status rules.
 */
export async function createPayment(invoiceId: string, input: PaymentCreateInput) {
  const invoice = await ensureInvoiceExists(invoiceId);
  if (invoice.status === "CANCELLED") {
    throw ApiError.badRequest(`Invoice ${invoiceId} is cancelled and cannot accept payments.`);
  }

  const payment = await prisma.payment.create({
    data: {
      invoiceId,
      clientId: invoice.clientId,
      paymentDate: input.paymentDate,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      reference: input.reference,
      notes: input.notes,
    },
  });

  await recalculateInvoice(invoiceId);
  return payment;
}

/** Lists payments for one invoice, oldest first. */
export async function listPaymentsForInvoice(invoiceId: string) {
  await ensureInvoiceExists(invoiceId);
  return prisma.payment.findMany({
    where: { invoiceId },
    orderBy: { paymentDate: "asc" },
  });
}

/** Fetches a single payment. */
export async function getPaymentById(id: string) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { invoice: { select: { id: true, invoiceNumber: true, status: true } } },
  });
  if (!payment) {
    throw ApiError.notFound(`Payment ${id} not found.`);
  }
  return payment;
}

/**
 * Updates a payment. Locked if the parent invoice is CANCELLED. After
 * updating, recalculates the parent invoice's totals/status.
 */
export async function updatePayment(id: string, input: PaymentUpdateInput) {
  const existing = await prisma.payment.findUnique({
    where: { id },
    include: { invoice: { select: { id: true, status: true } } },
  });
  if (!existing) {
    throw ApiError.notFound(`Payment ${id} not found.`);
  }
  if (existing.invoice.status === "CANCELLED") {
    throw ApiError.badRequest(`Payment ${id}'s invoice is cancelled and cannot be edited.`);
  }

  const payment = await prisma.payment.update({ where: { id }, data: input });
  await recalculateInvoice(existing.invoiceId);
  return payment;
}

/**
 * Deletes a payment (a genuine correction, e.g. a data-entry mistake —
 * unlike most of this project, Payment supports real deletion, per the
 * schema's own comment anticipating "recorded/edited/deleted"). Locked if
 * the parent invoice is CANCELLED. Recalculates the parent invoice after.
 */
export async function deletePayment(id: string) {
  const existing = await prisma.payment.findUnique({
    where: { id },
    include: { invoice: { select: { id: true, status: true } } },
  });
  if (!existing) {
    throw ApiError.notFound(`Payment ${id} not found.`);
  }
  if (existing.invoice.status === "CANCELLED") {
    throw ApiError.badRequest(`Payment ${id}'s invoice is cancelled and cannot be edited.`);
  }

  await prisma.payment.delete({ where: { id } });
  await recalculateInvoice(existing.invoiceId);
}

async function ensureInvoiceExists(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, clientId: true, status: true },
  });
  if (!invoice) {
    throw ApiError.notFound(`Invoice ${invoiceId} not found.`);
  }
  return invoice;
}
