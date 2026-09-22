import { Router } from "express";
import * as controller from "./operational-costs.controller";

const router = Router();

// GET   /api/operational-costs      - list, ?clientId=&siteId=&costCategory=
//                                      &monthFrom=&monthTo=&page=&pageSize=
// POST  /api/operational-costs      - create (clientId + siteId + month +
//                                      costCategory + amount required; site
//                                      must belong to the given client)
// GET   /api/operational-costs/:id  - view one
// PUT   /api/operational-costs/:id  - edit; no DELETE — correct via edit,
//                                      same "no hard delete" pattern used
//                                      elsewhere in this project

router.get("/", controller.listOperationalCosts);
router.post("/", controller.createOperationalCost);
router.get("/:id", controller.getOperationalCost);
router.put("/:id", controller.updateOperationalCost);

export default router;
