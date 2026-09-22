import { Router } from "express";
import * as controller from "./site-requirements.controller";

const router = Router();

// GET   /api/site-requirements             - list, with ?siteId=&shiftTypeId=&page=&pageSize=
// POST  /api/site-requirements              - create (siteId + shiftTypeId + requiredOfficers required, both ids must reference existing records)
// GET   /api/site-requirements/:id          - view one
// PUT   /api/site-requirements/:id          - edit any field
//
// No DELETE route: use `effectiveTo` to close out a requirement instead of
// deleting it, so history of what a site required in the past isn't lost
// (same "don't rewrite history" principle used for StatutoryRule).

router.get("/", controller.listSiteRequirements);
router.post("/", controller.createSiteRequirement);
router.get("/:id", controller.getSiteRequirement);
router.put("/:id", controller.updateSiteRequirement);

export default router;
