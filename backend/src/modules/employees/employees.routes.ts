import { Router } from "express";

import * as employeesController from "./employees.controller";
import { uploadPhoto } from "../../middleware/uploadMiddleware";

const router = Router();
import payrollProfileRouter from "../payroll-profiles/payroll-profiles.routes";
router.use("/:employeeId/payroll-profile", payrollProfileRouter);

// GET    /api/employees                   - list, with ?search=&employmentStatus=&assignedClientId=&assignedSiteId=&page=&pageSize=
// POST   /api/employees                   - create (fullName required; assignedClientId/assignedSiteId optional, must reference existing records if given)
// GET    /api/employees/:id               - view one, with related contracts
// PUT    /api/employees/:id               - edit (any field including employmentStatus)
// PATCH  /api/employees/:id/status        - set employmentStatus only
// DELETE /api/employees/:id               - hard delete; ADMIN only, and only
//                                            when the employee has no real
//                                            history (contracts, payroll,
//                                            attendance, etc.) -- added
//                                            2026-09-25 for genuine
//                                            duplicate/mistaken records.
//                                            Everyone else keeps using PATCH
//                                            .../status (Terminated/
//                                            Absconded) once there's real
//                                            history to preserve.
//
// Photo endpoints:
// POST   /api/employees/:id/photo         - upload or replace photo (multipart/form-data, field: "photo")
// GET    /api/employees/:id/photo         - serve the photo (authenticated, streams the file)
// DELETE /api/employees/:id/photo         - remove the photo

router.get("/", employeesController.listEmployees);
router.post("/", employeesController.createEmployee);
router.get("/:id", employeesController.getEmployee);
router.put("/:id", employeesController.updateEmployee);
router.patch("/:id/status", employeesController.updateEmploymentStatus);
router.delete("/:id", employeesController.deleteEmployee);

router.use("/:employeeId/payroll-profile", payrollProfileRouter);

router.post("/:id/photo", uploadPhoto.single("photo"), employeesController.uploadEmployeePhoto);
router.get("/:id/photo", employeesController.serveEmployeePhoto);
router.delete("/:id/photo", employeesController.deleteEmployeePhoto);

export default router;
