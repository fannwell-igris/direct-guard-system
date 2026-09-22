import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  DepartmentRequestCreateInput,
  DepartmentRequestUpdateInput,
  DepartmentRequestListQuery,
} from "./department-requests.validation";

export async function createDepartmentRequest(input: DepartmentRequestCreateInput) {
  const dept = await prisma.department.findUnique({
    where: { id: input.departmentId },
    select: { id: true },
  });
  if (!dept) throw ApiError.badRequest(`Department ${input.departmentId} does not exist.`);

  return prisma.departmentRequest.create({ data: input });
}

export async function listDepartmentRequests(query: DepartmentRequestListQuery) {
  const where: Prisma.DepartmentRequestWhereInput = {};
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;

  const [total, rows] = await Promise.all([
    prisma.departmentRequest.count({ where }),
    prisma.departmentRequest.findMany({
      where,
      orderBy: [{ priority: "desc" }, { dateCreated: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { generalExpenses: true } },
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

export async function getDepartmentRequestById(id: string) {
  const req = await prisma.departmentRequest.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      generalExpenses: {
        select: { id: true, expenseDate: true, amount: true, category: true, description: true },
        orderBy: { expenseDate: "desc" },
      },
    },
  });
  if (!req) throw ApiError.notFound(`Department request ${id} not found.`);
  return req;
}

export async function updateDepartmentRequest(id: string, input: DepartmentRequestUpdateInput) {
  const existing = await prisma.departmentRequest.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) throw ApiError.notFound(`Department request ${id} not found.`);

  // Cannot edit a FULFILLED request except to add notes
  if (existing.status === "FULFILLED") {
    const allowedKeys = new Set(["notes"]);
    const attempted = Object.keys(input).filter((k) => !allowedKeys.has(k));
    if (attempted.length > 0) {
      throw ApiError.badRequest(
        `Department request ${id} is FULFILLED and cannot be edited (only \`notes\` may be updated).`
      );
    }
  }

  return prisma.departmentRequest.update({ where: { id }, data: input });
}
