import { Router } from "express";
import * as clientsController from "./clients.controller";

const router = Router();

// GET    /api/clients            - list, with ?search=&status=&page=&pageSize=
// POST   /api/clients            - create
// GET    /api/clients/:id        - view one, with related sites/contracts/invoices
// PUT    /api/clients/:id        - edit (name/location/phone/email/address/notes)
// PATCH  /api/clients/:id/status - archive/deactivate/reactivate (status field only)
//
// Intentionally no DELETE route: clients are never hard-deleted, per the
// spec's data-integrity rule (Section 19). Use PATCH .../status instead.

router.get("/", clientsController.listClients);
router.post("/", clientsController.createClient);
router.get("/:id", clientsController.getClient);
router.put("/:id", clientsController.updateClient);
router.patch("/:id/status", clientsController.updateClientStatus);

export default router;
