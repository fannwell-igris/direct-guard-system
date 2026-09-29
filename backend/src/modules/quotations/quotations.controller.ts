import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./quotations.service";
import { parseQuotationCreate, parseQuotationUpdate, parseListQuery } from "./quotations.validation";

export const createQuotation = asyncHandler(async (req: Request, res: Response) => {
  const input = parseQuotationCreate(req.body);
  const quotation = await service.createQuotation(input);
  res.status(201).json({ status: "ok", data: quotation });
});

export const listQuotations = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listQuotations(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getQuotation = asyncHandler(async (req: Request, res: Response) => {
  const quotation = await service.getQuotationById(req.params.id);
  res.status(200).json({ status: "ok", data: quotation });
});

export const updateQuotation = asyncHandler(async (req: Request, res: Response) => {
  const input = parseQuotationUpdate(req.body);
  const quotation = await service.updateQuotation(req.params.id, input);
  res.status(200).json({ status: "ok", data: quotation });
});

export const sendQuotation = asyncHandler(async (req: Request, res: Response) => {
  const quotation = await service.sendQuotation(req.params.id);
  res.status(200).json({ status: "ok", data: quotation });
});

export const acceptQuotation = asyncHandler(async (req: Request, res: Response) => {
  const quotation = await service.acceptQuotation(req.params.id);
  res.status(200).json({ status: "ok", data: quotation });
});

export const rejectQuotation = asyncHandler(async (req: Request, res: Response) => {
  const quotation = await service.rejectQuotation(req.params.id);
  res.status(200).json({ status: "ok", data: quotation });
});

export const expireQuotation = asyncHandler(async (req: Request, res: Response) => {
  const quotation = await service.expireQuotation(req.params.id);
  res.status(200).json({ status: "ok", data: quotation });
});

export const deleteQuotation = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.deleteQuotation(req.params.id);
  res.status(200).json({ status: "ok", data: result });
});

export const peekNextQuotationNumber = asyncHandler(async (req: Request, res: Response) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const number = await service.peekNextQuotationNumber(date);
  res.status(200).json({ status: "ok", data: { quotationNumber: number } });
});
