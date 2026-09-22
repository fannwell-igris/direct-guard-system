import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  EmployeeLoanCreateInput,
  EmployeeLoanUpdateInput,
  LoanListQuery,
  LoanRepaymentInput,
} from "./employee-loans.validation";

export async function createEmployeeLoan(input: EmployeeLoanCreateInput) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, fullName: true },
  });
  if (!employee) throw ApiError.badRequest(`Employee ${input.employeeId} does not exist.`);

  // Check for existing active loan
  const existingActive = await prisma.employeeLoan.findFirst({
    where: { employeeId: input.employeeId, status: "ACTIVE" },
  });
  if (existingActive)
    throw ApiError.badRequest(
      `Employee ${employee.fullName} already has an active loan. It must be fully repaid or cancelled before a new one can be issued.`
    );

  return prisma.employeeLoan.create({
    data: {
      employeeId: input.employeeId,
      loanAmount: input.loanAmount,
      dateIssued: input.dateIssued,
      monthlyRepayment: input.monthlyRepayment,
      numberOfInstallments: input.numberOfInstallments,
      amountPaid: 0,
      outstandingBalance: input.loanAmount,
      startDate: input.startDate,
      endDate: input.endDate,
      status: "ACTIVE",
      approvedBy: input.approvedBy,
      notes: input.notes,
    },
    include: { employee: { select: { id: true, fullName: true } } },
  });
}

export async function listEmployeeLoans(query: LoanListQuery) {
  const where: Prisma.EmployeeLoanWhereInput = {};
  if (query.employeeId) where.employeeId = query.employeeId;
  if (query.status) where.status = query.status;

  const [total, data] = await Promise.all([
    prisma.employeeLoan.count({ where }),
    prisma.employeeLoan.findMany({
      where,
      orderBy: { dateIssued: "desc" },
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

export async function getEmployeeLoanById(id: string) {
  const loan = await prisma.employeeLoan.findUnique({
    where: { id },
    include: { employee: { select: { id: true, fullName: true, position: true } } },
  });
  if (!loan) throw ApiError.notFound(`Employee loan ${id} not found.`);
  return loan;
}

export async function updateEmployeeLoan(id: string, input: EmployeeLoanUpdateInput) {
  const existing = await prisma.employeeLoan.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) throw ApiError.notFound(`Employee loan ${id} not found.`);
  if (existing.status === "FULLY_REPAID")
    throw ApiError.badRequest("A fully repaid loan cannot be edited.");

  return prisma.employeeLoan.update({ where: { id }, data: input });
}

export async function recordLoanRepayment(id: string, input: LoanRepaymentInput) {
  const loan = await prisma.employeeLoan.findUnique({ where: { id } });
  if (!loan) throw ApiError.notFound(`Employee loan ${id} not found.`);
  if (loan.status !== "ACTIVE")
    throw ApiError.badRequest(`Loan ${id} is ${loan.status} — only ACTIVE loans can accept repayments.`);

  const outstandingBalance = Number(loan.outstandingBalance);
  if (input.amount > outstandingBalance)
    throw ApiError.badRequest(
      `Repayment amount (${input.amount}) exceeds outstanding balance (${outstandingBalance}).`
    );

  const newAmountPaid = Number(loan.amountPaid) + input.amount;
  const newBalance = Math.max(0, outstandingBalance - input.amount);
  const newStatus = newBalance === 0 ? "FULLY_REPAID" : "ACTIVE";

  return prisma.employeeLoan.update({
    where: { id },
    data: {
      amountPaid: newAmountPaid,
      outstandingBalance: newBalance,
      status: newStatus,
      notes: input.notes
        ? `${loan.notes ?? ""}\n[Repayment]: ${input.notes}`.trim()
        : loan.notes,
    },
    include: { employee: { select: { id: true, fullName: true } } },
  });
}
