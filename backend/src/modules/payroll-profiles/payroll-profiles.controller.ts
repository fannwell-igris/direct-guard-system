import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./payroll-profiles.service";
import { parsePayrollProfileUpsert, parseSalaryHistoryCreate } from "./payroll-profiles.validation";

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getOrCreateProfile(req.params.employeeId);
  res.status(200).json({ status: "ok", data: result });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const input = parsePayrollProfileUpsert(req.body);
  const result = await service.upsertProfile(req.params.employeeId, input);
  res.status(200).json({ status: "ok", data: result });
});

export const getSalaryHistory = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getSalaryHistory(req.params.employeeId);
  res.status(200).json({ status: "ok", data: result });
});

export const addSalaryHistory = asyncHandler(async (req: Request, res: Response) => {
  const input = parseSalaryHistoryCreate(req.body);
  const result = await service.addSalaryHistory(req.params.employeeId, input);
  res.status(201).json({ status: "ok", data: result });
});
