/**
 * One-time script to create the first ADMIN user. Run this once, then
 * log in via POST /api/auth/login and use that account to create every
 * subsequent user through the normal (now-authenticated) API.
 *
 * Usage (from backend/):
 *   npx ts-node scripts/seedAdmin.ts
 *
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME from environment
 * variables if set, otherwise falls back to the defaults below — CHANGE
 * THE DEFAULT PASSWORD before running this against anything but a local
 * dev database.
 */
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const fullName = process.env.ADMIN_NAME || "System Administrator";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`A user with email ${email} already exists (id ${existing.id}) — nothing to do.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, passwordHash, fullName, role: "ADMIN" },
  });

  console.log(`Created admin user: ${user.email} (id ${user.id}).`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`Used the DEFAULT password "${password}" — log in and consider changing it.`);
  }
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
