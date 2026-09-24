import { Router } from "express";
import { registerToken, unregisterToken } from "./push-tokens.controller";

const router = Router();

// POST /api/push-tokens    - register/refresh this device's FCM token for
//                            the currently logged-in user
// DELETE /api/push-tokens  - unregister a token (e.g. on logout), body { token }
//
// Every authenticated role may hit this — it's per-user self-registration,
// not a data-access endpoint (see permissions.ts).
router.post("/", registerToken);
router.delete("/", unregisterToken);

export default router;
