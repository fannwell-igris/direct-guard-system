import { Router } from "express";
import { listAlerts } from "./alerts.controller";

const router = Router();

// GET /api/alerts              - all current alerts, sorted by severity
// GET /api/alerts?category=X   - filter by category:
//   INVOICE_OVERDUE | CONTRACT_EXPIRING | PROPERTY_NOT_RETURNED |
//   TASK_OVERDUE | LOW_STOCK | PAYROLL_DUE | ROSTER_GAP
//
// No POST/PUT/DELETE — alerts are live-calculated, not stored.
// An alert disappears only when the underlying issue is resolved.

router.get("/", listAlerts);

export default router;
