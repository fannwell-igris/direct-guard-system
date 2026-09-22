import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { getMainDashboard, getOperationsDashboard, getHRDashboard } from "./dashboard.service";

export const mainDashboard = asyncHandler(async (req: Request, res: Response) => {
  const role = req.user?.role ?? "STAFF";
  const data = await getMainDashboard(role);
  res.status(200).json({ status: "ok", data });
});

export const operationsDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getOperationsDashboard();
  res.status(200).json({ status: "ok", data });
});

export const hrDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getHRDashboard();
  res.status(200).json({ status: "ok", data });
});
