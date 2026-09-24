import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { getDashboard } from "./marketing-dashboard.service";
import { parseDashboardQuery } from "./marketing-dashboard.validation";

export const getMarketingDashboard = asyncHandler(async (req: Request, res: Response) => {
  const query = parseDashboardQuery(req.query as Record<string, unknown>);
  const data = await getDashboard(query);
  res.status(200).json({ status: "ok", data });
});
