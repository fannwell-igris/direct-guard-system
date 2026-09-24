import { Router } from "express";
import { getMarketingDashboard } from "./marketing-dashboard.controller";

const router = Router();

// GET /api/marketing-dashboard?period=today|week|month|custom&dateFrom=&dateTo=
// Read-only aggregate — see marketing-dashboard.service.ts for exactly
// what each number means (period-scoped vs. as-of-now).
router.get("/", getMarketingDashboard);

export default router;
