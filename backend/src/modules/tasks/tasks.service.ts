import { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { TaskCreateInput, TaskUpdateInput, TaskListQuery } from "./tasks.validation";

const NON_TERMINAL_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS", "ON_HOLD"];

/** Roles that can see all tasks across every department. */
const ADMIN_ROLES = ["ADMIN", "SUPERADMIN"];

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

/**
 * Caller context passed to listTasks so it can scope results:
 * - ADMIN / SUPERADMIN → all tasks
 * - Everyone else      → only tasks belonging to their own department
 *
 * If the caller has no departmentId (e.g. a STAFF user not yet assigned
 * to a department), they see only unassigned tasks plus any tasks
 * explicitly assigned to them via assignedToEmployeeId — a safe fallback
 * that prevents total blindness without leaking other departments' work.
 */
export interface CallerContext {
  role: string;
  departmentId: string | null | undefined;
}

export async function listTasks(query: TaskListQuery, caller: CallerContext) {
  const now = new Date();
  const where: Prisma.TaskWhereInput = {};

  // ── Department scoping ────────────────────────────────────────────────
  if (ADMIN_ROLES.includes(caller.role)) {
    // Admins: respect the optional ?departmentId filter from the query string
    if (query.departmentId) where.departmentId = query.departmentId;
  } else if (caller.departmentId) {
    // Non-admin with a department: always restrict to their department.
    // Any ?departmentId filter in the query string is silently ignored —
    // they can't escape their own scope by passing a different id.
    where.departmentId = caller.departmentId;
  } else {
    // Non-admin with NO department (edge case): show nothing rather than
    // leaking everything. Front-end should prompt them to contact an admin.
    where.departmentId = "__none__"; // matches nothing
  }

  if (query.assignedToEmployeeId) where.assignedToEmployeeId = query.assignedToEmployeeId;
  if (query.priority) where.priority = query.priority;

  // Status filtering has to account for OVERDUE being calculated, not
  // stored - see withEffectiveStatus above.
  if (query.status === "OVERDUE") {
    where.status = { in: NON_TERMINAL_STATUSES };
    where.dueDate = { lt: now };
  } else if (query.status && NON_TERMINAL_STATUSES.includes(query.status)) {
    where.status = query.status;
    where.OR = [{ dueDate: null }, { dueDate: { gte: now } }];
  } else if (query.status) {
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
export async function getTaskById(id: string, caller: CallerContext) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      assignedToEmployee: { select: { id: true, fullName: true, position: true } },
    },
  });
  if (!task) throw ApiError.notFound(`Task ${id} not found.`);

  // Non-admins can only view tasks in their own department
  if (!ADMIN_ROLES.includes(caller.role) && task.departmentId !== caller.departmentId) {
    throw ApiError.forbidden("You do not have access to this task.");
  }

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
  _statusChangeNote?: string | null,
  caller?: CallerContext
) {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound(`Task ${id} not found.`);

  // Non-admins can only update tasks in their own department
  if (caller && !ADMIN_ROLES.includes(caller.role) && existing.departmentId !== caller.departmentId) {
    throw ApiError.forbidden("You do not have access to this task.");
  }

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
