import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import { getAlerts, getValidCategories, AlertCategory } from "./alerts.service";

export const listAlerts = asyncHandler(async (req: Request, res: Response) => {
  const { category } = req.query as Record<string, string | undefined>;
  const role = (req as any).user?.role ?? "STAFF";

  if (category !== undefined) {
    const valid = getValidCategories();
    if (!valid.includes(category as AlertCategory)) {
      throw ApiError.badRequest(`\`category\` must be one of: ${valid.join(", ")}.`);
    }
  }

  const alerts = await getAlerts(category as AlertCategory | undefined, role);

  // Group by category for easier frontend consumption
  const grouped: Record<string, typeof alerts> = {};
  for (const alert of alerts) {
    if (!grouped[alert.category]) grouped[alert.category] = [];
    grouped[alert.category].push(alert);
  }

  res.status(200).json({
    status: "ok",
    data: {
      total: alerts.length,
      alerts,
      grouped,
    },
  });
});
