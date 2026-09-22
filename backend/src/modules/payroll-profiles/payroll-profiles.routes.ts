import { Router } from "express";
import * as controller from "./payroll-profiles.controller";

const router = Router({ mergeParams: true });

// All routes are nested under /api/employees/:employeeId/payroll-profile
// Mount this router with mergeParams: true

// GET  /api/employees/:employeeId/payroll-profile              - get profile (auto-creates if first access)
// PUT  /api/employees/:employeeId/payroll-profile              - update bank details, statutory IDs etc.
// GET  /api/employees/:employeeId/payroll-profile/salary-history  - full salary history log
// POST /api/employees/:employeeId/payroll-profile/salary-history  - record a salary change

router.get("/", controller.getProfile);
router.put("/", controller.updateProfile);
router.get("/salary-history", controller.getSalaryHistory);
router.post("/salary-history", controller.addSalaryHistory);

export default router;
