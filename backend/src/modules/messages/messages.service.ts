import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";

// ── Thread helpers ────────────────────────────────────────────────────────────

/** Returns all threads the requesting user participates in, newest-activity first. */
export async function listThreadsForUser(userId: string) {
  const participations = await prisma.messageThreadParticipant.findMany({
    where: { userId },
    include: {
      thread: {
        include: {
          participants: {
            include: { user: { select: { id: true, fullName: true } } },
          },
          messages: {
            orderBy: { sentAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { thread: { lastUpdated: "desc" } },
  });

  // For unread counts we need a separate aggregate per thread
  const threadIds = participations.map((p) => p.thread.id);
  const unreadCounts: Record<string, number> = {};
  if (threadIds.length > 0) {
    await Promise.all(
      threadIds.map(async (threadId) => {
        const count = await prisma.message.count({
          where: {
            threadId,
            // Message is unread if userId is NOT in readBy — Prisma doesn't
            // support "not contains" on scalar arrays; filter in JS below.
          },
        });
        // Fetch all message readBy arrays for this thread to count unread
        const msgs = await prisma.message.findMany({
          where: { threadId },
          select: { readBy: true },
        });
        unreadCounts[threadId] = msgs.filter((m) => !m.readBy.includes(userId)).length;
      })
    );
  }

  return participations.map(({ thread }) => {
    const lastMsg = thread.messages[0] ?? null;
    const otherParticipants = thread.participants
      .filter((p) => p.userId !== userId)
      .map((p) => p.user.fullName);

    return {
      id: thread.id,
      subject: thread.subject,
      participantNames: otherParticipants,
      lastMessage: lastMsg?.body ?? null,
      lastMessageAt: lastMsg?.sentAt ?? thread.createdAt,
      unread: unreadCounts[thread.id] ?? 0,
    };
  });
}

/** Creates a new thread with the requesting user + listed participant user IDs. */
export async function createThread(
  creatorId: string,
  input: { subject?: string; participantIds: string[]; body: string }
) {
  if (!input.body.trim()) {
    throw ApiError.badRequest("`body` is required.");
  }
  if (!input.participantIds || input.participantIds.length === 0) {
    throw ApiError.badRequest("At least one `participantId` is required.");
  }

  // Validate all participant IDs exist
  const allParticipantIds = [...new Set([creatorId, ...input.participantIds])];
  const users = await prisma.user.findMany({
    where: { id: { in: allParticipantIds }, isActive: true },
    select: { id: true, fullName: true },
  });
  const foundIds = new Set(users.map((u) => u.id));
  const missing = allParticipantIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw ApiError.badRequest(`User(s) not found: ${missing.join(", ")}`);
  }

  const subject = input.subject?.trim() || "New Conversation";

  const thread = await prisma.messageThread.create({
    data: {
      subject,
      createdById: creatorId,
      participants: {
        create: allParticipantIds.map((uid) => ({ userId: uid })),
      },
      messages: {
        create: {
          senderId: creatorId,
          body: input.body.trim(),
          readBy: [creatorId],
        },
      },
    },
    include: {
      participants: {
        include: { user: { select: { id: true, fullName: true } } },
      },
      messages: {
        include: { sender: { select: { id: true, fullName: true } } },
      },
    },
  });

  const firstMessage = thread.messages[0];
  const otherParticipants = thread.participants
    .filter((p) => p.userId !== creatorId)
    .map((p) => p.user.fullName);

  return {
    thread: {
      id: thread.id,
      subject: thread.subject,
      participantNames: otherParticipants,
      lastMessage: firstMessage?.body ?? null,
      lastMessageAt: firstMessage?.sentAt ?? thread.createdAt,
      unread: 0,
    },
    message: firstMessage
      ? {
          id: firstMessage.id,
          threadId: thread.id,
          senderId: firstMessage.senderId,
          senderName: firstMessage.sender.fullName,
          body: firstMessage.body,
          sentAt: firstMessage.sentAt,
          readBy: firstMessage.readBy,
        }
      : null,
  };
}

// ── Message helpers ───────────────────────────────────────────────────────────

/** Returns all messages in a thread, oldest first. Marks them read for the caller. */
export async function getThreadMessages(threadId: string, userId: string) {
  // Confirm the user is a participant
  const participation = await prisma.messageThreadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId } },
  });
  if (!participation) {
    throw ApiError.forbidden("You are not a participant in this thread.");
  }

  const messages = await prisma.message.findMany({
    where: { threadId },
    orderBy: { sentAt: "asc" },
    include: {
      sender: { select: { id: true, fullName: true } },
    },
  });

  // Mark unread messages as read by this user
  const unreadIds = messages
    .filter((m) => !m.readBy.includes(userId))
    .map((m) => m.id);

  if (unreadIds.length > 0) {
    await Promise.all(
      unreadIds.map((id) =>
        prisma.message.update({
          where: { id },
          data: { readBy: { push: userId } },
        })
      )
    );
  }

  return messages.map((m) => ({
    id: m.id,
    threadId: m.threadId,
    senderId: m.senderId,
    senderName: m.sender.fullName,
    body: m.body,
    sentAt: m.sentAt,
    readBy: unreadIds.includes(m.id) ? [...m.readBy, userId] : m.readBy,
  }));
}

/** Sends a new message in an existing thread. */
export async function sendMessage(
  threadId: string,
  senderId: string,
  body: string
) {
  if (!body.trim()) throw ApiError.badRequest("`body` is required.");

  // Confirm the user is a participant
  const participation = await prisma.messageThreadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: senderId } },
  });
  if (!participation) {
    throw ApiError.forbidden("You are not a participant in this thread.");
  }

  const message = await prisma.message.create({
    data: {
      threadId,
      senderId,
      body: body.trim(),
      readBy: [senderId],
    },
    include: {
      sender: { select: { id: true, fullName: true } },
    },
  });

  // Update thread lastUpdated
  await prisma.messageThread.update({
    where: { id: threadId },
    data: { lastUpdated: new Date() },
  });

  return {
    id: message.id,
    threadId: message.threadId,
    senderId: message.senderId,
    senderName: message.sender.fullName,
    body: message.body,
    sentAt: message.sentAt,
    readBy: message.readBy,
  };
}

/** Lists all users (for the "To:" recipient picker). */
export async function listUsers(excludeUserId: string) {
  return prisma.user.findMany({
    where: { isActive: true, id: { not: excludeUserId } },
    select: { id: true, fullName: true, email: true, role: true },
    orderBy: { fullName: "asc" },
  });
}
