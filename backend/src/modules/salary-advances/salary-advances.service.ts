import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  SalaryAdvanceCreateInput,
  SalaryAdvanceUpdateInput,
  SalaryAdvanceListQuery,
  RepaymentInput,
} from "./salary-advances.validation";

export async function createSalaryAdvance(input: SalaryAdvanceCreateInput) {
  // Verify employee exists
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, fullName: true },
  });
  if (!employee) throw ApiError.badRequest(`Employee ${input.employeeId} does not exist.`);

  // Check for existing active advance — one at a time per employee
  const existingActive = await prisma.salaryAdvance.findFirst({
    where: { employeeId: input.employeeId, status: "ACTIVE" },
  });
  if (existingActive)
    throw ApiError.badRequest(
      `Employee ${employee.fullName} already has an active salary advance. It must be fully repaid or cancelled before a new one can be issued.`
    );

  const monthlyDeduction = Math.ceil((input.amount / input.repaymentMonths) * 100) / 100;

  return prisma.salaryAdvance.create({
    data: {
      employeeId: input.employeeId,
      advanceDate: input.advanceDate,
      amount: input.amount,
      reason: input.reason,
      repaymentMonths: input.repaymentMonths,
      monthlyDeduction,
      amountRepaid: 0,
      outstandingBalance: input.amount,
      status: "ACTIVE",
      approvedBy: input.approvedBy,
      notes: input.notes,
    },
    include: { employee: { select: { id: true, fullName: true } } },
  });
}

export async function listSalaryAdvances(query: SalaryAdvanceListQuery) {
  const where: Prisma.SalaryAdvanceWhereInput = {};
  if (query.employeeId) where.employeeId = query.employeeId;
  if (query.status) where.status = query.status;

  const [total, data] = await Promise.all([
    prisma.salaryAdvance.count({ where }),
    prisma.salaryAdvance.findMany({
      where,
      orderBy: { advanceDate: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { employee: { select: { id: true, fullName: true, position: true } } },
    }),
  ]);

  return {
    data,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getSalaryAdvanceById(id: string) {
  const advance = await prisma.salaryAdvance.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true, position: true } } },
  });
  if (!advance) throw ApiError.notFound(`Salary advance ${id} not found.`);
  return advance;
}

export async function updateSalaryAdvance(id: string, input: SalaryAdvanceUpdateInput) {
  const existing = await prisma.salaryAdvance.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) throw ApiError.notFound(`Salary advance ${id} not found.`);
  if (existing.status === "FULLY_REPAID")
    throw ApiError.badRequest("A fully repaid advance cannot be edited.");

  return prisma.salaryAdvance.update({ where: { id }, data: input });
}

export async function recordRepayment(id: string, input: RepaymentInput) {
  const advance = await prisma.salaryAdvance.findUnique({ where: { id } });
  if (!advance) throw ApiError.notFound(`Salary advance ${id} not found.`);
  if (advance.status !== "ACTIVE")
    throw ApiError.badRequest(`Salary advance ${id} is ${advance.status} — only ACTIVE advances can accept repayments.`);

  const outstandingBalance = Number(advance.outstandingBalance);
  if (input.amount > outstandingBalance)
    throw ApiError.badRequest(
      `Repayment amount (${input.amount}) exceeds outstanding balance (${outstandingBalance}).`
    );

  const newAmountRepaid = Number(advance.amountRepaid) + input.amount;
  const newBalance = Math.max(0, outstandingBalance - input.amount);
  const newStatus = newBalance === 0 ? "FULLY_REPAID" : "ACTIVE";

  return prisma.salaryAdvance.update({
    where: { id },
    data: {
      amountRepaid: newAmountRepaid,
      outstandingBalance: newBalance,
      status: newStatus,
      notes: input.notes
        ? `${advance.notes ?? ""}\n[Repayment]: ${input.notes}`.trim()
        : advance.notes,
    },
    include: { employee: { select: { id: true, fullName: true } } },
  });
}
