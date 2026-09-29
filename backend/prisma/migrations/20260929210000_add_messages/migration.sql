-- Migration: add internal messaging tables
-- 2026-09-29

CREATE TABLE "message_threads" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "subject"     TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_threads_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "message_thread_participants" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "threadId"  TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "joinedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_thread_participants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_thread_participants_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "message_thread_participants_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "message_thread_participants_threadId_userId_key"
    UNIQUE ("threadId", "userId")
);

CREATE TABLE "messages" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "threadId"  TEXT NOT NULL,
  "senderId"  TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "sentAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readBy"    TEXT[] NOT NULL DEFAULT '{}',
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "messages_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "messages_threadId_idx" ON "messages"("threadId");
CREATE INDEX "messages_sentAt_idx" ON "messages"("sentAt");
CREATE INDEX "message_thread_participants_userId_idx" ON "message_thread_participants"("userId");
