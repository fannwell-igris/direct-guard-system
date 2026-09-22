import { Router } from "express";
import * as controller from "./site-coverage.controller";

const router = Router();

// GET /api/site-coverage?date=YYYY-MM-DD   - every ACTIVE site's coverage
//                                             status for that day, broken
//                                             out per active shift type
//                                             (Day, Night, ...) — defaults
//                                             to today if omitted. A
//                                             site/shift with no row yet
//                                             shows isCovered: null ("not
//                                             marked"), distinct from
//                                             false. Anyone authenticated
//                                             can read this.
// PUT /api/site-coverage                   - set (create or update) one
//                                             site's status for a
//                                             day+shift — upsert, since
//                                             this is meant to be a quick
//                                             repeatable tick. Body:
//                                             { siteId, shiftTypeId, date,
//                                             isCovered, notes? }.
//                                             RESTRICTED: only Admin, or a
//                                             STAFF user in the Operations
//                                             department — see the
//                                             permission check in
//                                             site-coverage.controller.ts.

router.get("/", controller.listSiteCoverage);
router.put("/", controller.setSiteCoverage);

export default router;
