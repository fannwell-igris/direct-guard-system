import { Router } from "express";
import * as controller from "./weekly-plans.controller";

const router = Router();

// GET    /api/weekly-plans                    - list, ?departmentId&fromWeek&toWeek&page&pageSize
// POST   /api/weekly-plans                    - create a plan for one department + one week
// GET    /api/weekly-plans/:id                - detail: items, week totals, and live budget context
// PUT    /api/weekly-plans/:id                - edit header and/or replace the whole item list
// PATCH  /api/weekly-plans/:id/items/:itemId  - tick one activity DONE / CANCELLED / back to PLANNED
// DELETE /api/weekly-plans/:id                - remove the plan and its items
//
// Any date inside the intended week is accepted as weekStartDate/fromWeek/
// toWeek — the validation layer snaps it to that week's Monday.

router.get("/", controller.listWeeklyPlans);
router.post("/", controller.createWeeklyPlan);
router.get("/:id", controller.getWeeklyPlan);
router.put("/:id", controller.updateWeeklyPlan);
router.patch("/:id/items/:itemId", controller.setItemStatus);
router.delete("/:id", controller.deleteWeeklyPlan);

export default router;
