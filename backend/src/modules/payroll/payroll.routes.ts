import { Router } from "express";
import * as controller from "./payroll.controller";
import {
  generatePayslipsHandler,
  listPayslipsHandler,
  getPayslipHandler,
  validatePayrollRunHandler,
  comparePayrollRunsHandler,
} from "./payroll.controller";

const router = Router();

// GET /api/payroll/shift-pay-preview?employeeId=&periodStart=&periodEnd=
router.get("/shift-pay-preview", controller.getShiftPayPreview);

// ---- Phase 5a: PayrollRun / PayrollLineItem CRUD + workflow ----
router.post("/runs", controller.createPayrollRun);
router.get("/runs", controller.listPayrollRuns);
router.get("/runs/:id", controller.getPayrollRun);

router.put("/runs/:id/line-items/:lineItemId", controller.updateLineItem);
router.post("/runs/:id/line-items/:lineItemId/allowances", controller.addAllowance);
router.delete("/runs/:id/line-items/:lineItemId/allowances/:allowanceId", controller.removeAllowance);
router.post("/runs/:id/line-items/:lineItemId/deductions", controller.addDeduction);
router.delete("/runs/:id/line-items/:lineItemId/deductions/:deductionId", controller.removeDeduction);

router.post("/runs/:id/review", controller.reviewPayrollRun);
router.post("/runs/:id/finalize", controller.finalizePayrollRun);
router.post("/runs/:id/mark-paid", controller.markPayrollRunPaid);
router.post("/runs/:id/apply-statutory-deductions", controller.applyStatutoryDeductions);

// POST /api/payroll/runs/:id/generate-payslips
// GET  /api/payroll/runs/:id/validate
// GET  /api/payroll/runs/:id/compare?previousRunId=
// GET  /api/payroll/payslips
// GET  /api/payroll/payslips/:payslipId
router.post("/runs/:id/generate-payslips", generatePayslipsHandler);
router.get("/runs/:id/validate", validatePayrollRunHandler);
router.get("/runs/:id/compare", comparePayrollRunsHandler);
router.get("/payslips", listPayslipsHandler);
router.get("/payslips/:payslipId", getPayslipHandler);

export default router;
