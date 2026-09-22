import { Router } from "express";
import * as controller from "./roster.controller";

const router = Router();

// GET   /api/roster   - list, with ?employeeId=&siteId=&clientId=&shiftTypeId=
//                        &status=&dateFrom=&dateTo=&page=&pageSize=
// POST  /api/roster   - create (employeeId + siteId + shiftTypeId + date
//                        required; all three ids must reference existing
//                        records; clientId is always snapshotted server-side
//                        from the site's current client, never accepted from
//                        the caller)
// GET   /api/roster/:id - view one
// PUT   /api/roster/:id - edit any field; re-snapshots clientId if siteId
//                        changes
//
// No DELETE route: set status to CANCELLED instead of deleting, so the
// historical record of what was actually scheduled is never lost (same
// "don't rewrite history" principle used for SiteRequirement/StatutoryRule).

router.get("/", controller.listRosterEntries);
router.post("/", controller.createRosterEntry);
router.get("/:id", controller.getRosterEntry);
router.put("/:id", controller.updateRosterEntry);

export default router;
