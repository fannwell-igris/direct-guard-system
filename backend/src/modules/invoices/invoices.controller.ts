import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import * as service from "./invoices.service";
import { parseInvoiceCreate, parseInvoiceUpdate, parseListQuery } from "./invoices.validation";

export const createInvoice = asyncHandler(async (req: Request, res: Response) => {
  const input = parseInvoiceCreate(req.body);
  const invoice = await service.createInvoice(input);
  res.status(201).json({ status: "ok", data: invoice });
});

export const listInvoices = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listInvoices(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getInvoice = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await service.getInvoiceById(req.params.id);
  res.status(200).json({ status: "ok", data: invoice });
});

export const updateInvoice = asyncHandler(async (req: Request, res: Response) => {
  const input = parseInvoiceUpdate(req.body);
  const invoice = await service.updateInvoice(req.params.id, input);
  res.status(200).json({ status: "ok", data: invoice });
});

export const issueInvoice = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await service.issueInvoice(req.params.id);
  res.status(200).json({ status: "ok", data: invoice });
});

export const cancelInvoice = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await service.cancelInvoice(req.params.id);
  res.status(200).json({ status: "ok", data: invoice });
});

export const deleteInvoice = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteInvoice(req.params.id);
  res.status(200).json({ status: "ok" });
});

// GET /api/invoices/next-number — peek (does not reserve) the invoice
// number that would be assigned if an invoice were created right now
// (or on the given ?date=). Lets the New Invoice form show it live.
export const peekNextInvoiceNumber = asyncHandler(async (req: Request, res: Response) => {
  const raw = typeof req.query.date === "string" ? new Date(req.query.date) : new Date();
  const invoiceDate = Number.isNaN(raw.getTime()) ? new Date() : raw;
  const invoiceNumber = await service.peekNextInvoiceNumber(invoiceDate);
  res.status(200).json({ status: "ok", data: { invoiceNumber } });
});

// DELETE /api/invoices — wipes EVERY invoice and payment record. ADMIN
// only, requires the exact confirm phrase in the body on top of the
// standard password-reconfirmation (requireDeleteConfirmation, since this
// is still a DELETE by an ADMIN). Added 2026-09-25 so trial/test invoices
// entered before go-live can be cleared out in one action instead of one
// at a time.
export const wipeAllInvoices = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== "ADMIN") {
    throw ApiError.forbidden("Only an Admin can wipe all invoices.");
  }
  if (req.body?.confirm !== "WIPE_ALL_INVOICES") {
    throw ApiError.badRequest(
      'Missing confirmation. Send { "confirm": "WIPE_ALL_INVOICES" } in the request body to proceed.'
    );
  }
  const resetNumberingTo =
    typeof req.body?.resetNumberingTo === "number" && req.body.resetNumberingTo > 0
      ? req.body.resetNumberingTo
      : undefined;
  const result = await service.wipeAllInvoices(resetNumberingTo);
  res.status(200).json({ status: "ok", data: result });
});
