import { Router } from "express";
import * as controller from "./department-budgets.controller";

const router = Router();

// GET  /api/department-budgets                 - list (own dept only, unless Finance/Management), ?departmentId&month&year&status&page&pageSize
// POST /api/department-budgets                 - create a DRAFT budget (departmentId forced to own dept for non-Finance/Management)
// GET  /api/department-budgets/summary         - Finance/Management only: company-wide totals for one month, ?month&year
// GET  /api/department-budgets/compare         - month-over-month comparison, ?periods=YYYY-MM,YYYY-MM[,...]&departmentId
// GET  /api/department-budgets/:id             - detail, includes lines + live budget-vs-actual figures
// PUT  /api/department-budgets/:id             - edit (DRAFT/RETURNED only; own dept unless Finance/Management)
// PATCH /api/department-budgets/:id/submit     - DRAFT/RETURNED -> SUBMITTED
// PATCH /api/department-budgets/:id/review     - Finance/Management only -> UNDER_REVIEW/APPROVED/RETURNED/REJECTED
// POST /api/department-budgets/:id/copy-forward - clone this budget's lines into a new DRAFT for the next month
//
// /summary and /compare are registered before /:id so they aren't
// swallowed by the :id param route.

router.get("/summary", controller.getBudgetSummary);
router.get("/compare", controller.getBudgetComparison);
router.get("/", controller.listBudgets);
router.post("/", controller.createBudget);
router.get("/:id", controller.getBudget);
router.put("/:id", controller.updateBudget);
router.patch("/:id/submit", controller.submitBudget);
router.patch("/:id/review", controller.reviewBudget);
router.post("/:id/copy-forward", controller.copyForwardBudget);

export default router;
