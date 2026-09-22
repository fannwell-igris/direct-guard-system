import { Router } from "express";
import { mainDashboard, operationsDashboard, hrDashboard } from "./dashboard.controller";

const router = Router();

// GET /api/dashboard/main        - Admin/Manager overview
//                                  counts, revenue, expenses, payroll, alerts, recent invoices/payments, 12-month chart
// GET /api/dashboard/operations  - Operations overview
//                                  roster today, officers on duty, pending review, attendance summary
// GET /api/dashboard/hr          - HR overview
//                                  employee counts, expiring contracts, by-department, recent hires, overdue tasks

router.get("/main", mainDashboard);
router.get("/operations", operationsDashboard);
router.get("/hr", hrDashboard);

export default router;
