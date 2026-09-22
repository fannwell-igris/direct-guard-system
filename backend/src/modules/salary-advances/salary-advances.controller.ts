import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./salary-advances.service";
import {
  parseSalaryAdvanceCreate,
  parseSalaryAdvanceUpdate,
  parseAdvanceListQuery,
  parseRepaymentInput,
} from "./salary-advances.validation";

export const createSalaryAdvance = asyncHandler(async (req: Request, res: Response) => {
  const input = parseSalaryAdvanceCreate(req.body);
  const result = await service.createSalaryAdvance(input);
  res.status(201).json({ status: "ok", data: result });
});

export const listSalaryAdvances = asyncHandler(async (req: Request, res: Response) => {
  const query = parseAdvanceListQuery(req.query as Record<string, unknown>);
  const result = await service.listSalaryAdvances(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getSalaryAdvance = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getSalaryAdvanceById(req.params.id);
  res.status(200).json({ status: "ok", data: result });
});

export const updateSalaryAdvance = asyncHandler(async (req: Request, res: Response) => {
  const input = parseSalaryAdvanceUpdate(req.body);
  const result = await service.updateSalaryAdvance(req.params.id, input);
  res.status(200).json({ status: "ok", data: result });
});

export const recordRepayment = asyncHandler(async (req: Request, res: Response) => {
  const input = parseRepaymentInput(req.body);
  const result = await service.recordRepayment(req.params.id, input);
  res.status(200).json({ status: "ok", data: result });
});
