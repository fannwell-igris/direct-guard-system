import { Router } from "express";
import * as controller from "./tasks.controller";

const router = Router();

// GET  /api/tasks           - list, ?departmentId=&assignedToEmployeeId=&status=&priority=&page=&pageSize=
// POST /api/tasks           - create
// GET  /api/tasks/:id       - view one, includes statusHistory (most recent first)
// PUT  /api/tasks/:id       - edit; setting status=COMPLETED auto-sets completedAt.
//                             Changing status writes a TaskStatusHistory row
//                             (who/when/old->new + optional statusChangeNote).
//                             No hard delete - set status=CANCELLED instead.

router.get("/", controller.listTasks);
router.post("/", controller.createTask);
router.get("/:id", controller.getTask);
router.put("/:id", controller.updateTask);

export default router;
