import { Router } from "express";
import * as controller from "./auth.controller";
import { requireAuth } from "../../middleware/requireAuth";

const router = Router();

// PUBLIC — no auth required. This router is mounted BEFORE the global
// requireAuth middleware in server.ts specifically so this route stays
// reachable without a token.
router.post("/login", controller.login);

// PROTECTED — applies requireAuth directly on this one route, since this
// whole router is mounted ahead of the global middleware (see above).
router.get("/me", requireAuth, controller.getMe);

export default router;
