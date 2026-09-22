import { Router } from "express";
import * as controller from "./employee-loans.controller";

const router = Router();

// GET  /api/employee-loans              - list, ?employeeId=&status=&page=&pageSize=
// POST /api/employee-loans              - create (one active loan per employee at a time)
// GET  /api/employee-loans/:id          - view one
// PUT  /api/employee-loans/:id          - edit notes/approvedBy/status
// POST /api/employee-loans/:id/repay    - record a repayment; auto-sets FULLY_REPAID when balance hits zero

router.get("/", controller.listEmployeeLoans);
router.post("/", controller.createEmployeeLoan);
router.get("/:id", controller.getEmployeeLoan);
router.put("/:id", controller.updateEmployeeLoan);
router.post("/:id/repay", controller.recordRepayment);

export default router;
