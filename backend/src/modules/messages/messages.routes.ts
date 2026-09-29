import { Router } from "express";
import * as controller from "./messages.controller";

const router = Router();

// GET  /api/messages/users              — list all active users (recipient picker)
router.get("/users", controller.getUsers);

// GET  /api/messages/threads            — list threads for the logged-in user
router.get("/threads", controller.getMyThreads);

// POST /api/messages/threads            — create a new thread + first message
router.post("/threads", controller.createThread);

// GET  /api/messages/threads/:threadId/messages  — get messages in a thread (marks read)
router.get("/threads/:threadId/messages", controller.getThreadMessages);

// POST /api/messages/threads/:threadId/messages  — send a message in a thread
router.post("/threads/:threadId/messages", controller.sendMessage);

export default router;
