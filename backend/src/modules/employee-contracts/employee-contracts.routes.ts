import { Router } from "express";
import * as controller from "./employee-contracts.controller";

const router = Router();

// GET    /api/employee-contracts                  - list, with ?employeeId=&status=&page=&pageSize=
// POST   /api/employee-contracts                   - create (employeeId required, must reference an existing Employee)
// GET    /api/employee-contracts/:id               - view one
// PUT    /api/employee-contracts/:id               - edit (status is always recalculated server-side, never accepted directly)
// POST   /api/employee-contracts/refresh-statuses   - manually recalculate status on every contract (temporary, until a scheduler exists)
//
// Intentionally no DELETE route and no direct status-set route: contract
// status is ALWAYS derived from startDate/endDate server-side (Section 9),
// never manually entered or hard-deleted.

router.get("/", controller.listEmployeeContracts);
router.post("/", controller.createEmployeeContract);
router.post("/refresh-statuses", controller.refreshStatuses);
router.get("/:id", controller.getEmployeeContract);
router.put("/:id", controller.updateEmployeeContract);

export default router;
