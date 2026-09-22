import { Router } from "express";
import * as controller from "./settings.controller";

const router = Router();

// GET  /api/settings                    - all sections merged with defaults
// GET  /api/settings/:section           - one section merged with defaults
//                                         sections: company | alerts | finance | inventory | reports | payroll | operations
// PUT  /api/settings/:section           - partial update (only sent keys change, rest preserved)
//                                         pass _updatedBy: "name" to record who changed it
// POST /api/settings/:section/reset     - restore section to factory defaults

router.get("/", controller.getAllSettings);
router.get("/:section", controller.getSection);
router.put("/:section", controller.updateSection);
router.post("/:section/reset", controller.resetSection);

export default router;
