import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./site-coverage.service";
import { parseSiteCoverageSet, parseDateQuery } from "./site-coverage.validation";

// UPDATED (2026-09-14, MB.2): the department-tag-based permission check
// that used to live here has been removed. A separate, later session
// built a proper global permission registry (src/middleware/permissions.ts)
// using the real UserRole.OPERATIONS enum value, which already restricts
// POST/PUT on this route to ADMIN + OPERATIONS roles, mounted before this
// controller ever runs. Keeping the old department-tag check here would
// have stacked a second, inconsistent gate on top — a legitimate
// OPERATIONS-role user without a matching departmentId would have been
// wrongly blocked. The global registry is the correct, current design;
// this controller no longer does its own authorization.

export const listSiteCoverage = asyncHandler(async (req: Request, res: Response) => {
  const date = parseDateQuery(req.query as Record<string, unknown>);
  const rows = await service.listCoverageForDate(date);
  res.status(200).json({ status: "ok", data: rows });
});

export const setSiteCoverage = asyncHandler(async (req: Request, res: Response) => {
  const input = parseSiteCoverageSet(req.body);
  const userId = (req as any).user?.id ?? null;
  const row = await service.setSiteCoverage(input, userId);
  res.status(200).json({ status: "ok", data: row });
});
