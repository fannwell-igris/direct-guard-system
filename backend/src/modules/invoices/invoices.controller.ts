import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
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
