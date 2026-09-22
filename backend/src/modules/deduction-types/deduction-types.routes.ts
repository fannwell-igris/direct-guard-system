import { Router } from "express";
import * as controller from "./deduction-types.controller";

const router = Router();

// GET   /api/deduction-types      - list, ?isActive=true|false
// POST  /api/deduction-types      - create (name required; duplicate name,
//                                   case-insensitive, -> 409)
// GET   /api/deduction-types/:id  - view one
// PUT   /api/deduction-types/:id  - edit; no DELETE — deactivate via isActive

router.get("/", controller.listDeductionTypes);
router.post("/", controller.createDeductionType);
router.get("/:id", controller.getDeductionType);
router.put("/:id", controller.updateDeductionType);

export default router;
