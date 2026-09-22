import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  GeneralExpenseCreateInput,
  GeneralExpenseUpdateInput,
  GeneralExpenseListQuery,
} from "./general-expenses.validation";

export async function createGeneralExpense(input: GeneralExpenseCreateInput) {
  await validateForeignKeys(input.departmentId, input.departmentRequestId);

  return prisma.$transaction(async (tx) => {
    const expense = await tx.generalExpense.create({ data: input });

    // Auto-fulfil the linked DepartmentRequest if provided
    if (input.departmentRequestId) {
      await tx.departmentRequest.update({
        where: { id: input.departmentRequestId },
        data: { status: "FULFILLED" },
      });
    }

    return expense;
  });
}

export async function listGeneralExpenses(query: GeneralExpenseListQuery) {
  const where: Prisma.GeneralExpenseWhereInput = {};
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.departmentRequestId) where.departmentRequestId = query.departmentRequestId;
  if (query.category) where.category = { contains: query.category, mode: "insensitive" };

  const [total, rows] = await Promise.all([
    prisma.generalExpense.count({ where }),
    prisma.generalExpense.findMany({
      where,
      orderBy: { expenseDate: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        department: { select: { id: true, name: true } },
        departmentRequest: { select: { id: true, title: true, status: true } },
      },
    }),
  ]);

  return {
    data: rows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getGeneralExpenseById(id: string) {
  const expense = await prisma.generalExpense.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      departmentRequest: { select: { id: true, title: true, status: true, estimatedCost: true } },
    },
  });
  if (!expense) throw ApiError.notFound(`General expense ${id} not found.`);
  return expense;
}

export async function updateGeneralExpense(id: string, input: GeneralExpenseUpdateInput) {
  const existing = await prisma.generalExpense.findUnique({
    where: { id },
    select: { id: true, departmentRequestId: true },
  });
  if (!existing) throw ApiError.notFound(`General expense ${id} not found.`);

  const newDeptReqId =
    input.departmentRequestId !== undefined ? input.departmentRequestId : existing.departmentRequestId;

  await validateForeignKeys(input.departmentId, input.departmentRequestId);

  return prisma.$transaction(async (tx) => {
    const expense = await tx.generalExpense.update({ where: { id }, data: input });

    // If departmentRequestId changed, handle FULFILLED status transitions
    const oldId = existing.departmentRequestId;
    const newId = newDeptReqId;

    if (oldId !== newId) {
      // Un-fulfil the old request if it has no other linked expenses
      if (oldId) {
        const remaining = await tx.generalExpense.count({
          where: { departmentRequestId: oldId, id: { not: id } },
        });
        if (remaining === 0) {
          await tx.departmentRequest.update({
            where: { id: oldId },
            data: { status: "APPROVED" }, // revert to last manual status — safest default
          });
        }
      }
      // Fulfil the new request
      if (newId) {
        await tx.departmentRequest.update({
          where: { id: newId },
          data: { status: "FULFILLED" },
        });
      }
    }

    return expense;
  });
}

export async function deleteGeneralExpense(id: string) {
  const existing = await prisma.generalExpense.findUnique({
    where: { id },
    select: { id: true, departmentRequestId: true },
  });
  if (!existing) throw ApiError.notFound(`General expense ${id} not found.`);

  return prisma.$transaction(async (tx) => {
    await tx.generalExpense.delete({ where: { id } });

    // Un-fulfil the linked request if this was the only expense against it
    if (existing.departmentRequestId) {
      const remaining = await tx.generalExpense.count({
        where: { departmentRequestId: existing.departmentRequestId },
      });
      if (remaining === 0) {
        await tx.departmentRequest.update({
          where: { id: existing.departmentRequestId },
          data: { status: "APPROVED" },
        });
      }
    }
  });
}

// ---- helpers ----

async function validateForeignKeys(
  departmentId?: string | null,
  departmentRequestId?: string | null
) {
  if (departmentId) {
    const exists = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!exists) throw ApiError.badRequest(`Department ${departmentId} does not exist.`);
  }

  if (departmentRequestId) {
    const req = await prisma.departmentRequest.findUnique({
      where: { id: departmentRequestId },
      select: { id: true, status: true },
    });
    if (!req) throw ApiError.badRequest(`Department request ${departmentRequestId} does not exist.`);
    if (req.status === "REJECTED") {
      throw ApiError.badRequest(
        `Department request ${departmentRequestId} has been REJECTED and cannot be fulfilled.`
      );
    }
  }
}
