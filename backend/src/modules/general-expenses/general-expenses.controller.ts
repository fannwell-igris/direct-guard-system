import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./general-expenses.service";
import { parseGeneralExpenseCreate, parseGeneralExpenseUpdate, parseListQuery } from "./general-expenses.validation";

export const createGeneralExpense = asyncHandler(async (req: Request, res: Response) => {
  const input = parseGeneralExpenseCreate(req.body);
  const result = await service.createGeneralExpense(input);
  res.status(201).json({ status: "ok", data: result });
});

export const listGeneralExpenses = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listGeneralExpenses(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getGeneralExpense = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getGeneralExpenseById(req.params.id);
  res.status(200).json({ status: "ok", data: result });
});

export const updateGeneralExpense = asyncHandler(async (req: Request, res: Response) => {
  const input = parseGeneralExpenseUpdate(req.body);
  const result = await service.updateGeneralExpense(req.params.id, input);
  res.status(200).json({ status: "ok", data: result });
});

export const deleteGeneralExpense = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteGeneralExpense(req.params.id);
  res.status(200).json({ status: "ok", message: "General expense deleted." });
});
