import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { signToken } from "../../lib/jwt";
import { ApiError } from "../../middleware/errorHandler";
import { LoginInput } from "./auth.validation";

/**
 * Verifies email+password and issues a JWT on success. Deliberately
 * returns the SAME error message for "no such user" and "wrong
 * password" — distinguishing them lets an attacker enumerate valid
 * email addresses.
 *
 * UPDATED (2026-09-14, MB.2): now includes departmentId + the
 * department's name in both the returned user object and getCurrentUser
 * — needed so the frontend can tell whether a STAFF user belongs to the
 * "Operations" department, for the Site Coverage edit-permission check.
 */
export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { department: { select: { id: true, name: true } } },
  });

  const genericError = () => ApiError.unauthorized("Invalid email or password.");

  if (!user) throw genericError();
  if (!user.isActive) throw ApiError.forbidden("This account has been deactivated.");

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) throw genericError();

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = signToken({ userId: user.id, email: user.email, fullName: user.fullName, role: user.role, departmentId: user.departmentId });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
    },
  };
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      departmentId: true,
      department: { select: { name: true } },
    },
  });
  if (!user) throw ApiError.notFound("User not found.");
  return {
    ...user,
    departmentName: user.department?.name ?? null,
  };
}
