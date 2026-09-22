import { Router } from "express";
import * as controller from "./allowance-types.controller";

const router = Router();

// GET   /api/allowance-types      - list, ?isActive=true|false
// POST  /api/allowance-types      - create (name required; duplicate name,
//                                   case-insensitive, -> 409)
// GET   /api/allowance-types/:id  - view one
// PUT   /api/allowance-types/:id  - edit; no DELETE — deactivate via isActive

router.get("/", controller.listAllowanceTypes);
router.post("/", controller.createAllowanceType);
router.get("/:id", controller.getAllowanceType);
router.put("/:id", controller.updateAllowanceType);

export default router;
