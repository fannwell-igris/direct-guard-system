import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./employee-loans.service";
import {
  parseEmployeeLoanCreate,
  parseEmployeeLoanUpdate,
  parseLoanListQuery,
  parseLoanRepaymentInput,
} from "./employee-loans.validation";

export const createEmployeeLoan = asyncHandler(async (req: Request, res: Response) => {
  const input = parseEmployeeLoanCreate(req.body);
  const result = await service.createEmployeeLoan(input);
  res.status(201).json({ status: "ok", data: result });
});

export const listEmployeeLoans = asyncHandler(async (req: Request, res: Response) => {
  const query = parseLoanListQuery(req.query as Record<string, unknown>);
  const result = await service.listEmployeeLoans(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getEmployeeLoan = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getEmployeeLoanById(req.params.id);
  res.status(200).json({ status: "ok", data: result });
});

export const updateEmployeeLoan = asyncHandler(async (req: Request, res: Response) => {
  const input = parseEmployeeLoanUpdate(req.body);
  const result = await service.updateEmployeeLoan(req.params.id, input);
  res.status(200).json({ status: "ok", data: result });
});

export const recordRepayment = asyncHandler(async (req: Request, res: Response) => {
  const input = parseLoanRepaymentInput(req.body);
  const result = await service.recordLoanRepayment(req.params.id, input);
  res.status(200).json({ status: "ok", data: result });
});
