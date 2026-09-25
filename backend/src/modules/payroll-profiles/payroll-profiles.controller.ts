import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import * as service from "./payroll-profiles.service";
import { parsePayrollProfileUpsert, parseSalaryHistoryCreate } from "./payroll-profiles.validation";

// This module is nested under /api/employees/:employeeId/payroll-profile,
// so permissions.ts's coarse "/api/employees" rule is what actually gates
// it (PUT: ADMIN/HR only, at the time this check was added) — too narrow
// for data that's squarely Payroll's job to maintain (bank details, NAPSA/
// NHIMA/TPIN numbers), and too wide for GET, which hands back bank account
// numbers and statutory IDs to every role that can view an employee
// (MANAGER, OPERATIONS included). Added 2026-09-25: an explicit,
// sub-route role check here, same pattern used elsewhere in this codebase
// for a restriction the coarse registry can't express.
const PAYROLL_PROFILE_ROLES = new Set(["ADMIN", "HR", "PAYROLL"]);

function requirePayrollProfileAccess(req: Request) {
  if (!req.user || !PAYROLL_PROFILE_ROLES.has(req.user.role)) {
    throw ApiError.forbidden("Only Admin, HR, or Payroll may access an employee's payroll profile.");
  }
}

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  requirePayrollProfileAccess(req);
  const result = await service.getOrCreateProfile(req.params.employeeId);
  res.status(200).json({ status: "ok", data: result });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  requirePayrollProfileAccess(req);
  const input = parsePayrollProfileUpsert(req.body);
  const result = await service.upsertProfile(req.params.employeeId, input);
  res.status(200).json({ status: "ok", data: result });
});

export const getSalaryHistory = asyncHandler(async (req: Request, res: Response) => {
  requirePayrollProfileAccess(req);
  const result = await service.getSalaryHistory(req.params.employeeId);
  res.status(200).json({ status: "ok", data: result });
});

export const addSalaryHistory = asyncHandler(async (req: Request, res: Response) => {
  requirePayrollProfileAccess(req);
  const input = parseSalaryHistoryCreate(req.body);
  const result = await service.addSalaryHistory(req.params.employeeId, input);
  res.status(201).json({ status: "ok", data: result });
});
