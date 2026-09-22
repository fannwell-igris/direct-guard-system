import { Router } from "express";
import * as shiftTypesController from "./shift-types.controller";

const router = Router();

// GET   /api/shift-types            - list, with optional ?isActive=true|false
// POST  /api/shift-types            - create
// GET   /api/shift-types/:id        - view one
// PUT   /api/shift-types/:id        - edit name and/or isActive
//
// No DELETE route: deactivate via isActive=false instead (SiteRequirement
// and RosterEntry reference ShiftType with onDelete: Restrict, so a
// ShiftType in use couldn't be hard-deleted anyway).

router.get("/", shiftTypesController.listShiftTypes);
router.post("/", shiftTypesController.createShiftType);
router.get("/:id", shiftTypesController.getShiftType);
router.put("/:id", shiftTypesController.updateShiftType);

export default router;
