import { Router } from "express";
import * as controller from "./roster.controller";

const router = Router();

// GET   /api/roster              - list with filters & pagination
// POST  /api/roster              - create single entry
// POST  /api/roster/bulk         - create multiple entries across a date range
// POST  /api/roster/bulk-cancel  - cancel a set of entries by ids[]
// POST  /api/roster/:id/relief   - record a relief officer for this entry
// GET   /api/roster/:id          - view one
// PUT   /api/roster/:id          - edit any field
//
// No DELETE route: set status to CANCELLED instead of deleting, so the
// historical record of what was actually scheduled is never lost.

router.get("/", controller.listRosterEntries);
router.post("/bulk", controller.bulkCreateRosterEntries);
router.post("/bulk-cancel", controller.bulkCancelRosterEntries);
router.post("/", controller.createRosterEntry);
router.post("/:id/relief", controller.recordRelief);
router.get("/:id", controller.getRosterEntry);
router.put("/:id", controller.updateRosterEntry);

export default router;
