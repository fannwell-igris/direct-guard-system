import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./payments.service";
import { parsePaymentCreate, parsePaymentUpdate } from "./payments.validation";

// Nested under an Invoice: /api/invoices/:id/payments
export const createPayment = asyncHandler(async (req: Request, res: Response) => {
  const input = parsePaymentCreate(req.body);
  const payment = await service.createPayment(req.params.id, input);
  res.status(201).json({ status: "ok", data: payment });
});

export const listPaymentsForInvoice = asyncHandler(async (req: Request, res: Response) => {
  const payments = await service.listPaymentsForInvoice(req.params.id);
  res.status(200).json({ status: "ok", data: payments });
});

// Flat, by payment id: /api/payments/:id
export const getPayment = asyncHandler(async (req: Request, res: Response) => {
  const payment = await service.getPaymentById(req.params.id);
  res.status(200).json({ status: "ok", data: payment });
});

export const updatePayment = asyncHandler(async (req: Request, res: Response) => {
  const input = parsePaymentUpdate(req.body);
  const payment = await service.updatePayment(req.params.id, input);
  res.status(200).json({ status: "ok", data: payment });
});

export const deletePayment = asyncHandler(async (req: Request, res: Response) => {
  await service.deletePayment(req.params.id);
  res.status(204).send();
});
