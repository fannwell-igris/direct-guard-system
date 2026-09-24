import { Router } from "express";
import * as prospectsController from "./prospects.controller";

const router = Router();

// GET    /api/prospects/assignable-users - MARKETING/MANAGER/ADMIN users, for the assignee dropdown
// GET    /api/prospects            - list, with ?search=&stage=&assignedToId=&followUpDue=true&page=&pageSize=
// POST   /api/prospects            - create (always starts at stage NEW)
// GET    /api/prospects/:id        - view one, with assignee + full stage history
// PUT    /api/prospects/:id        - edit fields (does NOT change stage)
// PATCH  /api/prospects/:id/stage  - move to a new stage; appends a stage-history row
//
// No DELETE route: a lost/not-interested prospect stays in the funnel data
// (for conversion-rate reporting later) instead of being removed, same
// "never hard-delete business records" convention as Clients.
//
// /assignable-users MUST be registered before /:id, or Express would match
// it as a prospect id lookup instead.

router.get("/assignable-users", prospectsController.listAssignableUsers);
router.get("/", prospectsController.listProspects);
router.post("/", prospectsController.createProspect);
router.get("/:id", prospectsController.getProspect);
router.put("/:id", prospectsController.updateProspect);
router.patch("/:id/stage", prospectsController.changeProspectStage);

export default router;
