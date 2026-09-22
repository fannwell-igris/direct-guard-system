import { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { TaskCreateInput, TaskUpdateInput, TaskListQuery } from "./tasks.validation";

const NON_TERMINAL_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS", "ON_HOLD"];

/**
 * OVERDUE is never stored - it's a calculated DISPLAY status, same
 * principle as ContractStatus/coverage %. A task's real, stored status
 * is always one of OPEN/IN_PROGRESS/ON_HOLD/COMPLETED/CANCELLED. This
 * function computes what to actually SHOW the caller: if the stored
 * status is non-terminal and dueDate has passed, show OVERDUE instead.
 * COMPLETED/CANCELLED tasks are never "overdue" - they're finished.
 */
function withEffectiveStatus<T extends { status: TaskStatus; dueDate: Date | null }>(
  task: T,
  now: Date = new Date()
): T {
  if (NON_TERMINAL_STATUSES.includes(task.status) && task.dueDate && task.dueDate.getTime() < now.getTime()) {
    return { ...task, status: "OVERDUE" as TaskStatus };
  }
  return task;
}

/**
 * Creates a task. New tasks always start at the schema default (OPEN) -
 * per-status audit history (who/when moved a task through which status)
 * isn't tracked yet; that needs its own model/migration before it can be
 * logged. `changedBy` is accepted for API-shape compatibility but unused
 * until that lands.
 */
export async function createTask(input: TaskCreateInput, _changedBy: string) {
  if (input.departmentId) await ensureDepartmentExists(input.departmentId);
  if (input.assignedToEmployeeId) await ensureEmployeeExists(input.assignedToEmployeeId);

  const task = await prisma.task.create({
    data: { ...input },
  });
  return withEffectiveStatus(task);
}

export async function listTasks(query: TaskListQuery) {
  const now = new Date();
  const where: Prisma.TaskWhereInput = {};
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.assignedToEmployeeId) where.assignedToEmployeeId = query.assignedToEmployeeId;
  if (query.priority) where.priority = query.priority;

  // Status filtering has to account for OVERDUE being calculated, not
  // stored - see withEffectiveStatus above.
  if (query.status === "OVERDUE") {
    // "Overdue" means: stored status is still non-terminal, AND the due
    // date has already passed.
    where.status = { in: NON_TERMINAL_STATUSES };
    where.dueDate = { lt: now };
  } else if (query.status && NON_TERMINAL_STATUSES.includes(query.status)) {
    // Filtering by a specific non-terminal status (e.g. ?status=OPEN)
    // should EXCLUDE tasks that are now effectively overdue - those only
    // show under ?status=OVERDUE, not under their stored status too.
    where.status = query.status;
    where.OR = [{ dueDate: null }, { dueDate: { gte: now } }];
  } else if (query.status) {
    // COMPLETED / CANCELLED - due date is irrelevant, simple equality.
    where.status = query.status;
  }

  const [total, rows] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: [{ priority: "desc" }, { dateCreated: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        department: { select: { id: true, name: true } },
        assignedToEmployee: { select: { id: true, fullName: true } },
      },
    }),
  ]);

  return {
    data: rows.map((r) => withEffectiveStatus(r, now)),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

/**
 * View one task, including its full status history (most recent first) -
 * this is the monthly-report-friendly view: who moved this task through
 * which statuses, and when.
 */
export async function getTaskById(id: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      assignedToEmployee: { select: { id: true, fullName: true, position: true } },
    },
  });
  if (!task) throw ApiError.notFound(`Task ${id} not found.`);
  return withEffectiveStatus(task);
}

/**
 * Updates a task. `changedBy`/`statusChangeNote` are accepted for API-shape
 * compatibility but unused - per-status audit history (who/when moved a
 * task through which status, with an optional note) isn't tracked yet;
 * that needs its own model/migration before it can be logged.
 */
export async function updateTask(
  id: string,
  input: TaskUpdateInput,
  _changedBy: string,
  _statusChangeNote?: string | null
) {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound(`Task ${id} not found.`);

  if (input.departmentId) await ensureDepartmentExists(input.departmentId);
  if (input.assignedToEmployeeId) await ensureEmployeeExists(input.assignedToEmployeeId);

  const task = await prisma.task.update({
    where: { id },
    data: { ...input },
  });
  return withEffectiveStatus(task);
}

async function ensureDepartmentExists(departmentId: string) {
  const exists = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
  if (!exists) throw ApiError.badRequest(`Department ${departmentId} does not exist.`);
}

async function ensureEmployeeExists(employeeId: string) {
  const exists = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!exists) throw ApiError.badRequest(`Employee ${employeeId} does not exist.`);
}
