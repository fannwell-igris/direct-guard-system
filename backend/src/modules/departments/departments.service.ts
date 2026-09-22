import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { DepartmentCreateInput, DepartmentUpdateInput, DepartmentListQuery } from "./departments.validation";

export async function createDepartment(input: DepartmentCreateInput) {
  return prisma.department.create({
    data: {
      name: input.name,
      description: input.description,
      headOfDepartment: input.headOfDepartment,
    },
  });
}

export async function listDepartments(query: DepartmentListQuery) {
  const where = query.status ? { status: query.status } : {};

  const [total, rows] = await Promise.all([
    prisma.department.count({ where }),
    prisma.department.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        _count: { select: { employees: true, tasks: true, departmentRequests: true } },
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

export async function getDepartmentById(id: string) {
  const dept = await prisma.department.findUnique({
    where: { id },
    include: {
      employees: { select: { id: true, fullName: true, position: true, employmentStatus: true } },
      _count: { select: { tasks: true, departmentRequests: true, generalExpenses: true } },
    },
  });
  if (!dept) throw ApiError.notFound(`Department ${id} not found.`);
  return dept;
}

export async function updateDepartment(id: string, input: DepartmentUpdateInput) {
  const exists = await prisma.department.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.notFound(`Department ${id} not found.`);
  return prisma.department.update({ where: { id }, data: input });
}
