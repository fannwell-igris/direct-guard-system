import { Router } from "express";
import * as controller from "./demo-reset.controller";

const router = Router();

// DELETE /api/demo-reset
//   Wipes all transactional data, keeps master data.
//   ADMIN only + requireDeleteConfirmation (password header) + { "confirm": "WIPE_ALL_DATA" } body.
router.delete("/", controller.wipeAllData);

export default router;
