import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { UserCreateInput, UserUpdateInput, PasswordChangeInput } from "./users.validation";

const SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  dateCreated: true,
  lastUpdated: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  // Optional link to an Employee record (e.g. so the account holder's
  // guard/staff photo can be shown here for recognition) — not every User
  // maps to an Employee, per the schema comment on User.employeeId.
  employeeId: true,
  employee: { select: { id: true, fullName: true, photoFilename: true } },
  // passwordHash deliberately excluded - never returned by any endpoint.
};

const BCRYPT_ROUNDS = 12;

async function ensureDepartmentExists(departmentId: string) {
  const exists = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Department ${departmentId} does not exist.`);
  }
}

async function ensureEmployeeExists(employeeId: string) {
  const exists = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Employee ${employeeId} does not exist.`);
  }
}

export async function createUser(input: UserCreateInput) {
  if (input.departmentId) await ensureDepartmentExists(input.departmentId);
  if (input.employeeId) await ensureEmployeeExists(input.employeeId);

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      role: input.role as any,
      departmentId: input.departmentId,
      employeeId: input.employeeId,
    },
    select: SAFE_SELECT,
  });
}

export async function listUsers() {
  return prisma.user.findMany({ orderBy: { fullName: "asc" }, select: SAFE_SELECT });
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: SAFE_SELECT });
  if (!user) throw ApiError.notFound(`User ${id} not found.`);
  return user;
}

export async function updateUser(id: string, input: UserUpdateInput) {
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound(`User ${id} not found.`);

  if (input.departmentId) await ensureDepartmentExists(input.departmentId);
  if (input.employeeId) await ensureEmployeeExists(input.employeeId);

  return prisma.user.update({ where: { id }, data: input as any, select: SAFE_SELECT });
}

export async function changePassword(id: string, input: PasswordChangeInput) {
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound(`User ${id} not found.`);

  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  return { message: "Password updated." };
}
