import { Router } from "express";
import * as sitesController from "./sites.controller";

const router = Router();

// GET    /api/sites            - list, with ?search=&status=&clientId=&page=&pageSize=
// POST   /api/sites            - create (clientId required, must reference an existing Client)
// GET    /api/sites/:id        - view one, with related employees/contracts/invoices
// PUT    /api/sites/:id        - edit (siteName/location/notes/clientId)
// PATCH  /api/sites/:id/status - archive/deactivate/reactivate (status field only)
//
// Intentionally no DELETE route: sites are never hard-deleted, same rule
// as Clients (Section 19). Use PATCH .../status instead.

router.get("/", sitesController.listSites);
router.post("/", sitesController.createSite);
router.get("/:id", sitesController.getSite);
router.put("/:id", sitesController.updateSite);
router.patch("/:id/status", sitesController.updateSiteStatus);

export default router;
