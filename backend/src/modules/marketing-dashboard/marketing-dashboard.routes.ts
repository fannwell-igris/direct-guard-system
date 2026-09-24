import { Router } from "express";
import { getMarketingDashboard, getMarketingTeamBreakdown } from "./marketing-dashboard.controller";

const router = Router();

// GET /api/marketing-dashboard?period=today|week|month|custom&dateFrom=&dateTo=&marketerId=
// Read-only aggregate — see marketing-dashboard.service.ts for exactly
// what each number means (period-scoped vs. as-of-now). marketerId is
// optional and scopes every number to that one marketer (Phase 7/8).
//
// GET /api/marketing-dashboard/team?period=... — one row per active
// marketer, each computed the same way as above (Phase 8, Management
// drill-down: Marketing -> Team -> Individual).
router.get("/team", getMarketingTeamBreakdown);
router.get("/", getMarketingDashboard);

export default router;
