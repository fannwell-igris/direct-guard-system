import { Router } from "express";
import * as controller from "./department-requests.controller";

const router = Router();

// GET  /api/department-requests        - list, ?departmentId=&status=&priority=&page=&pageSize=
// POST /api/department-requests        - create (departmentId + title required)
// GET  /api/department-requests/:id    - view one, includes linked generalExpenses
// PUT  /api/department-requests/:id    - edit; FULFILLED requests locked except notes
//                                        status=APPROVED/REJECTED auto-sets reviewedAt
//                                        status=FULFILLED set automatically via GeneralExpense linkage

router.get("/", controller.listDepartmentRequests);
router.post("/", controller.createDepartmentRequest);
router.get("/:id", controller.getDepartmentRequest);
router.put("/:id", controller.updateDepartmentRequest);

export default router;
