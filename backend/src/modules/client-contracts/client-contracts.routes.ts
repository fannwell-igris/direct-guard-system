import { Router } from "express";
import * as controller from "./client-contracts.controller";

const router = Router();

// GET    /api/client-contracts                  - list, with ?clientId=&siteId=&status=&page=&pageSize=
// POST   /api/client-contracts                   - create (clientId required, siteId optional, both must reference existing records)
// GET    /api/client-contracts/:id               - view one
// PUT    /api/client-contracts/:id               - edit (status is always recalculated server-side, never accepted directly)
// POST   /api/client-contracts/refresh-statuses   - manually recalculate status on every contract (temporary, until a scheduler exists)
//
// Intentionally no DELETE route and no direct status-set route: contract
// status is ALWAYS derived from startDate/endDate server-side (Section 9),
// never manually entered or hard-deleted.

router.get("/", controller.listClientContracts);
router.post("/", controller.createClientContract);
router.post("/refresh-statuses", controller.refreshStatuses);
router.get("/:id", controller.getClientContract);
router.put("/:id", controller.updateClientContract);

export default router;
