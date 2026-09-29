import { Router } from "express";
import * as ctrl from "./leave.controller";

const router = Router({ mergeParams: true }); // mergeParams lets us read :employeeId from parent

// GET  /api/employees/:employeeId/leave/balance
router.get("/balance", ctrl.getBalance);

// GET  /api/employees/:employeeId/leave/accruals
router.get("/accruals", ctrl.getAccruals);

// GET  /api/employees/:employeeId/leave/deductions
router.get("/deductions", ctrl.getDeductions);

// POST /api/employees/:employeeId/leave/deductions
router.post("/deductions", ctrl.createDeduction);

// DELETE /api/employees/:employeeId/leave/deductions/:id
router.delete("/deductions/:id", ctrl.removeDeduction);

export default router;
