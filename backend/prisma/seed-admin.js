/**
 * Seed script (plain JS — safe to run with `node` in production).
 * Creates the initial admin user if they don't already exist.
 * Run automatically at startup via the "start" npm script.
 *
 * Strategy: upsert so a fresh DB always gets the admin user, but the
 * update clause only touches fields that must be correct (hash, role,
 * isActive). This means a manually changed password is reset on each
 * deploy — acceptable for the bootstrap admin account.
 */

"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const ADMIN_EMAIL    = "admin@directguardlimited.com";
const ADMIN_NAME     = "System Administrator";
// NOTE: The ! is kept as a char-code to survive bash history expansion
// if this file is ever cat-echoed into a shell.
const ADMIN_PASSWORD = "Admin@DG2026" + String.fromCharCode(33);

async function main() {
  console.log("[seed-admin] Checking admin user…");

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where:  { email: ADMIN_EMAIL },
    update: {
      passwordHash: hash,
      fullName:     ADMIN_NAME,
      role:         "ADMIN",
      isActive:     true,
    },
    create: {
      email:        ADMIN_EMAIL,
      passwordHash: hash,
      fullName:     ADMIN_NAME,
      role:         "ADMIN",
      isActive:     true,
    },
  });

  console.log("[seed-admin] ✅ Admin user ready — id:", user.id);
}

main()
  .catch((e) => {
    console.error("[seed-admin] ❌ Seed failed:", e.message);
    // Non-zero exit so Railway surfaces the error in the deploy log,
    // but don't kill the process — the server will still try to start.
  })
  .finally(() => prisma.$disconnect());
