import { Request, Response, NextFunction } from "express";
import * as service from "./messages.service";

/** GET /api/messages/threads */
export async function getMyThreads(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated." });
    const threads = await service.listThreadsForUser(userId);
    res.json({ data: threads });
  } catch (err) {
    next(err);
  }
}

/** POST /api/messages/threads */
export async function createThread(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated." });
    const { subject, participantIds, body } = req.body as {
      subject?: string;
      participantIds: string[];
      body: string;
    };
    const thread = await service.createThread(userId, { subject, participantIds, body });
    res.status(201).json({ data: thread });
  } catch (err) {
    next(err);
  }
}

/** GET /api/messages/threads/:threadId/messages */
export async function getThreadMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated." });
    const { threadId } = req.params;
    const messages = await service.getThreadMessages(threadId, userId);
    res.json({ data: messages });
  } catch (err) {
    next(err);
  }
}

/** POST /api/messages/threads/:threadId/messages */
export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated." });
    const { threadId } = req.params;
    const { body } = req.body as { body: string };
    const message = await service.sendMessage(threadId, userId, body);
    res.status(201).json({ data: message });
  } catch (err) {
    next(err);
  }
}

/** GET /api/messages/users */
export async function getUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated." });
    const users = await service.listUsers(userId);
    res.json({ data: users });
  } catch (err) {
    next(err);
  }
}
