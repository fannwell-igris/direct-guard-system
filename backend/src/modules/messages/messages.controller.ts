import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { prisma } from "../../lib/prisma";

// ── GET /api/messages/users ─────────────────────────────────────────────────
// Returns all active system users for the recipient picker.
// Excludes the calling user so you can't message yourself.
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const callerId = (req as any).user?.id as string | undefined;

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(callerId ? { id: { not: callerId } } : {}),
    },
    orderBy: { fullName: "asc" },
    select: {
      id:       true,
      fullName: true,
      email:    true,
      role:     true,
    },
  });

  res.status(200).json({ status: "ok", data: users });
});

// ── GET /api/messages/threads ───────────────────────────────────────────────
export const getMyThreads = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string;

  const threads = await prisma.messageThread.findMany({
    where:   { participants: { some: { userId } } },
    orderBy: { lastUpdated: "desc" },
    include: {
      participants: {
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true } },
        },
      },
      messages: {
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { id: true, body: true, sentAt: true, senderId: true, readBy: true },
      },
    },
  });

  const result = threads.map((t) => {
    const lastMsg = t.messages[0];
    const unread  = lastMsg && lastMsg.senderId !== userId && !lastMsg.readBy.includes(userId) ? 1 : 0;
    const others  = t.participants
      .filter((p) => p.userId !== userId)
      .map((p) => p.user);

    return {
      id:            t.id,
      subject:       t.subject,
      participants:  others,
      lastMessage:   lastMsg?.body ?? "",
      lastMessageAt: t.lastUpdated,
      unread,
    };
  });

  res.status(200).json({ status: "ok", data: result });
});

// ── POST /api/messages/threads ──────────────────────────────────────────────
export const createThread = asyncHandler(async (req: Request, res: Response) => {
  const senderId = (req as any).user?.id as string;
  const { recipientId, subject, body } = req.body as {
    recipientId: string;
    subject:     string;
    body:        string;
  };

  if (!recipientId || !subject?.trim() || !body?.trim()) {
    res.status(400).json({ status: "error", message: "recipientId, subject, and body are required." });
    return;
  }

  const now = new Date();

  const thread = await prisma.messageThread.create({
    data: {
      subject,
      createdById:  senderId,
      lastUpdated:  now,
      participants: {
        create: [{ userId: senderId }, { userId: recipientId }],
      },
      messages: {
        create: {
          senderId,
          body:   body.trim(),
          readBy: [senderId],
          sentAt: now,
        },
      },
    },
    include: {
      participants: {
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true } },
        },
      },
      messages: { orderBy: { sentAt: "asc" } },
    },
  });

  res.status(201).json({ status: "ok", data: thread });
});

// ── GET /api/messages/threads/:threadId/messages ────────────────────────────
export const getThreadMessages = asyncHandler(async (req: Request, res: Response) => {
  const userId   = (req as any).user?.id as string;
  const threadId = req.params.threadId;

  // Verify caller is a participant
  const membership = await prisma.messageThreadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId } },
  });
  if (!membership) {
    res.status(403).json({ status: "error", message: "Not a participant in this thread." });
    return;
  }

  const messages = await prisma.message.findMany({
    where:   { threadId },
    orderBy: { sentAt: "asc" },
    include: { sender: { select: { id: true, fullName: true, role: true } } },
  });

  // Mark unread messages (not sent by caller) as read
  const unreadIds = messages
    .filter((m) => m.senderId !== userId && !m.readBy.includes(userId))
    .map((m) => m.id);

  if (unreadIds.length > 0) {
    await prisma.message.updateMany({
      where: { id: { in: unreadIds } },
      data:  { readBy: { push: userId } },
    });
  }

  res.status(200).json({ status: "ok", data: messages });
});

// ── POST /api/messages/threads/:threadId/messages ───────────────────────────
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const senderId = (req as any).user?.id as string;
  const threadId = req.params.threadId;
  const { body } = req.body as { body: string };

  if (!body?.trim()) {
    res.status(400).json({ status: "error", message: "Message body is required." });
    return;
  }

  // Verify sender is a participant
  const membership = await prisma.messageThreadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: senderId } },
  });
  if (!membership) {
    res.status(403).json({ status: "error", message: "Not a participant in this thread." });
    return;
  }

  const now = new Date();

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId,
        senderId,
        body:   body.trim(),
        readBy: [senderId],
        sentAt: now,
      },
      include: { sender: { select: { id: true, fullName: true, role: true } } },
    }),
    prisma.messageThread.update({
      where: { id: threadId },
      data:  { lastUpdated: now },
    }),
  ]);

  res.status(201).json({ status: "ok", data: message });
});
