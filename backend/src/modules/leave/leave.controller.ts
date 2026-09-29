import { Request, Response, NextFunction } from "express";
import * as leaveService from "./leave.service";

export async function getBalance(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId } = req.params;
    const balance = await leaveService.getLeaveBalance(employeeId);
    res.json({ data: balance });
  } catch (err) { next(err); }
}

export async function getAccruals(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId } = req.params;
    const accruals = await leaveService.listAccruals(employeeId);
    res.json({ data: accruals });
  } catch (err) { next(err); }
}

export async function getDeductions(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId } = req.params;
    const deductions = await leaveService.listDeductions(employeeId);
    res.json({ data: deductions });
  } catch (err) { next(err); }
}

export async function createDeduction(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId } = req.params;
    const { days, deductionDate, reason, recordedBy } = req.body;

    if (!days || isNaN(Number(days)) || Number(days) <= 0) {
      return res.status(400).json({ message: "days must be a positive number" });
    }
    if (!deductionDate) {
      return res.status(400).json({ message: "deductionDate is required" });
    }

    const deduction = await leaveService.addDeduction(employeeId, {
      days: Number(days),
      deductionDate: new Date(deductionDate),
      reason: reason ?? null,
      recordedBy: recordedBy ?? null,
    });
    res.status(201).json({ data: deduction });
  } catch (err) { next(err); }
}

export async function removeDeduction(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await leaveService.deleteDeduction(id);
    res.json({ message: "Deduction deleted" });
  } catch (err) { next(err); }
}
