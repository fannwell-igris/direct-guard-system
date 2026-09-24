import { Router } from "express";
import * as controller from "./marketing-activities.controller";

const router = Router();

// GET    /api/marketing-activities            - list, with ?type=&prospectId=&clientId=&performedById=&dateFrom=&dateTo=&page=&pageSize=
// POST   /api/marketing-activities            - create (activityDate defaults to now)
// GET    /api/marketing-activities/:id        - view one
// PUT    /api/marketing-activities/:id        - edit
// DELETE /api/marketing-activities/:id        - hard delete (genuine correction — this is a log, not a financial record)

router.get("/", controller.listActivities);
router.post("/", controller.createActivity);
router.get("/:id", controller.getActivity);
router.put("/:id", controller.updateActivity);
router.delete("/:id", controller.deleteActivity);

export default router;
