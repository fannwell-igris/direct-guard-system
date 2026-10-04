/**
 * One-time admin seed script — run from the Railway shell:
 *   npx ts-node prisma/seed-admin.ts
 *
 * Creates or updates the initial admin user so you can log in to the
 * deployed system for the first time. Safe to re-run: uses upsert so it
 * won't create a duplicate if the user already exists.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL    = "admin@directguardlimited.com";
const ADMIN_NAME     = "System Administrator";
const ADMIN_PASSWORD = "Admin@DG2026!";

async function main() {
  console.log("Seeding admin user…");

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where:  { email: ADMIN_EMAIL },
    update: { passwordHash: hash, fullName: ADMIN_NAME, role: "ADMIN", isActive: true },
    create: { email: ADMIN_EMAIL, passwordHash: hash, fullName: ADMIN_NAME, role: "ADMIN", isActive: true },
  });

  console.log("✅ Admin user seeded:");
  console.log("   ID:      ", user.id);
  console.log("   Email:   ", user.email);
  console.log("   Role:    ", user.role);
  console.log("   Active:  ", user.isActive);
  console.log("");
  console.log("Login credentials:");
  console.log("   Email:    ", ADMIN_EMAIL);
  console.log("   Password: ", ADMIN_PASSWORD);
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
