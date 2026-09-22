import { Router } from "express";
import * as controller from "./statutory-rules.controller";

const router = Router();

// GET   /api/statutory-rules      - list, ?isActive=true|false
// POST  /api/statutory-rules      - create (name, ruleType, deductionTypeId,
//                                   effectiveFrom required; employeeRate/
//                                   employerRate for PERCENTAGE/FIXED,
//                                   config.brackets for BRACKETED)
// GET   /api/statutory-rules/:id  - view one
// PUT   /api/statutory-rules/:id  - edit rate/config/dates/isActive/notes;
//                                   ruleType and deductionTypeId are NOT
//                                   editable — create a new rule instead
//                                   (see statutory-rules.validation.ts)
// No DELETE — deactivate via isActive, same as AllowanceType/DeductionType.

router.get("/", controller.listStatutoryRules);
router.post("/", controller.createStatutoryRule);
router.get("/:id", controller.getStatutoryRule);
router.put("/:id", controller.updateStatutoryRule);

export default router;
