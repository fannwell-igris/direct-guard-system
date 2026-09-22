import { Router } from "express";
import * as controller from "./users.controller";
import { requireRole } from "../../middleware/requireAuth";

const router = Router();

// requireAuth is already applied globally in server.ts (this router is
// mounted after it). requireRole("ADMIN") adds the extra restriction:
// only admins can manage other users. There is currently NO self-service
// path (e.g. a non-admin changing their own password) — that's a
// reasonable near-term addition, not built yet, per the minimal scope
// this auth rollout was deliberately kept to. See PROJECT_HANDOFF.md.

router.post("/", requireRole("ADMIN"), controller.createUser);
router.get("/", requireRole("ADMIN"), controller.listUsers);
router.get("/:id", requireRole("ADMIN"), controller.getUser);
router.put("/:id", requireRole("ADMIN"), controller.updateUser);
router.patch("/:id/password", requireRole("ADMIN"), controller.changePassword);

export default router;
