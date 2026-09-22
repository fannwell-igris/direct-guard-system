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
//
// Photo endpoints:
// POST   /api/employees/:id/photo         - upload or replace photo (multipart/form-data, field: "photo")
// GET    /api/employees/:id/photo         - serve the photo (authenticated, streams the file)
// DELETE /api/employees/:id/photo         - remove the photo
//
// Intentionally no DELETE route: employees are never hard-deleted, same
// rule as Clients and Sites. Use PATCH .../status instead.

router.get("/", employeesController.listEmployees);
router.post("/", employeesController.createEmployee);
router.get("/:id", employeesController.getEmployee);
router.put("/:id", employeesController.updateEmployee);
router.patch("/:id/status", employeesController.updateEmploymentStatus);

router.use("/:employeeId/payroll-profile", payrollProfileRouter);

router.post("/:id/photo", uploadPhoto.single("photo"), employeesController.uploadEmployeePhoto);
router.get("/:id/photo", employeesController.serveEmployeePhoto);
router.delete("/:id/photo", employeesController.deleteEmployeePhoto);

export default router;
