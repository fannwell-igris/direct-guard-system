import { PrismaClient } from "@prisma/client";

// Prevents creating a new PrismaClient on every hot-reload during
// development (ts-node-dev / nodemon), which otherwise exhausts
// Postgres connections. Standard Prisma+Express recommended pattern.

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV === "development") {
  global.__prisma = prisma;
}
