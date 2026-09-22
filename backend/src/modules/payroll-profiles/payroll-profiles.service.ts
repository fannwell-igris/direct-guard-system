import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { PayrollProfileUpsertInput, SalaryHistoryCreateInput } from "./payroll-profiles.validation";

async function ensureEmployeeExists(employeeId: string) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!emp) throw ApiError.notFound(`Employee ${employeeId} not found.`);
  return emp;
}

// ---- Profile ----

export async function getOrCreateProfile(employeeId: string) {
  await ensureEmployeeExists(employeeId);

  const existing = await prisma.employeePayrollProfile.findUnique({
    where: { employeeId },
    include: {
      salaryHistory: { orderBy: { effectiveDate: "desc" } },
    },
  });

  if (existing) return existing;

  // Auto-create empty profile on first access
  return prisma.employeePayrollProfile.create({
    data: { employeeId },
    include: {
      salaryHistory: { orderBy: { effectiveDate: "desc" } },
    },
  });
}

export async function upsertProfile(employeeId: string, input: PayrollProfileUpsertInput) {
  await ensureEmployeeExists(employeeId);

  return prisma.employeePayrollProfile.upsert({
    where: { employeeId },
    create: { employeeId, ...input },
    update: input,
    include: {
      salaryHistory: { orderBy: { effectiveDate: "desc" } },
    },
  });
}

// ---- Salary history ----

export async function addSalaryHistory(employeeId: string, input: SalaryHistoryCreateInput) {
  await ensureEmployeeExists(employeeId);

  // Get or create profile
  const profile = await prisma.employeePayrollProfile.upsert({
    where: { employeeId },
    create: { employeeId },
    update: {},
    select: { id: true, salaryHistory: { orderBy: { effectiveDate: "desc" }, take: 1 } },
  });

  // Get the most recent salary as previousSalary
  const previousSalary =
    profile.salaryHistory.length > 0 ? Number(profile.salaryHistory[0].newSalary) : null;

  return prisma.salaryHistory.create({
    data: {
      profileId: profile.id,
      previousSalary,
      newSalary: input.newSalary,
      effectiveDate: input.effectiveDate,
      reason: input.reason,
      changedBy: input.changedBy,
      approvedBy: input.approvedBy,
    },
  });
}

export async function getSalaryHistory(employeeId: string) {
  await ensureEmployeeExists(employeeId);

  const profile = await prisma.employeePayrollProfile.findUnique({
    where: { employeeId },
    select: { id: true },
  });

  if (!profile) return [];

  return prisma.salaryHistory.findMany({
    where: { profileId: profile.id },
    orderBy: { effectiveDate: "desc" },
  });
}
