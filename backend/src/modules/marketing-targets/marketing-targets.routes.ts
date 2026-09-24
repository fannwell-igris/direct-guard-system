import { Router } from "express";
import * as controller from "./marketing-targets.controller";

const router = Router();

// GET    /api/marketing-targets       - list, with ?marketerId=&periodYear=&periodMonth=&page=&pageSize=
//                                        each row includes `actuals`, computed live from
//                                        Prospect/MarketingActivity/FieldVisit/ProspectStageHistory
// POST   /api/marketing-targets       - create (marketerId omitted/null = team-wide target)
// GET    /api/marketing-targets/:id   - view one, with actuals
// PUT    /api/marketing-targets/:id   - edit
// DELETE /api/marketing-targets/:id   - remove (a genuine correction, e.g. wrong month set)

router.get("/", controller.listTargets);
router.post("/", controller.createTarget);
router.get("/:id", controller.getTarget);
router.put("/:id", controller.updateTarget);
router.delete("/:id", controller.deleteTarget);

export default router;
