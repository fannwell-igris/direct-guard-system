import { Router } from "express";
import * as controller from "./salary-advances.controller";

const router = Router();

// GET  /api/salary-advances              - list, ?employeeId=&status=&page=&pageSize=
// POST /api/salary-advances              - create (one active advance per employee at a time)
// GET  /api/salary-advances/:id          - view one
// PUT  /api/salary-advances/:id          - edit notes/approvedBy/status
// POST /api/salary-advances/:id/repay    - record a repayment; auto-sets FULLY_REPAID when balance hits zero

router.get("/", controller.listSalaryAdvances);
router.post("/", controller.createSalaryAdvance);
router.get("/:id", controller.getSalaryAdvance);
router.put("/:id", controller.updateSalaryAdvance);
router.post("/:id/repay", controller.recordRepayment);

export default router;
