import { Router } from "express";
import * as controller from "./departments.controller";

const router = Router();

// GET  /api/departments        - list, ?status=&page=&pageSize=
// POST /api/departments        - create (name required, unique)
// GET  /api/departments/:id    - view one, includes employees + counts
// PUT  /api/departments/:id    - edit name/description/headOfDepartment/status
//                                (no hard delete — set status=ARCHIVED instead)

router.get("/", controller.listDepartments);
router.post("/", controller.createDepartment);
router.get("/:id", controller.getDepartment);
router.put("/:id", controller.updateDepartment);

export default router;
