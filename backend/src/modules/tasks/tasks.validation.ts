import { Priority, TaskStatus } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

export interface TaskCreateInput {
  title: string;
  description?: string | null;
  departmentId?: string | null;
  assignedToEmployeeId?: string | null;
  assignedBy?: string | null;
  dueDate?: Date | null;
  priority?: Priority;
  notes?: string | null;
}

export interface TaskUpdateInput {
  title?: string;
  description?: string | null;
  departmentId?: string | null;
  assignedToEmployeeId?: string | null;
  assignedBy?: string | null;
  dueDate?: Date | null;
  priority?: Priority;
  status?: TaskStatus;
  completedAt?: Date | null;
  notes?: string | null;
}

export interface TaskListQuery {
  departmentId?: string;
  assignedToEmployeeId?: string;
  status?: TaskStatus;
  priority?: Priority;
  page: number;
  pageSize: number;
}

const VALID_PRIORITIES: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"];
// OVERDUE is deliberately excluded here - it's a calculated label (see
// tasks.service.ts), never a status a caller sets directly. A task is
// "really" OPEN/IN_PROGRESS/ON_HOLD/COMPLETED/CANCELLED; OVERDUE is
// computed from dueDate at read time for any non-terminal task whose
// due date has passed.
const SETTABLE_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"];
// OVERDUE IS included here - filtering ?status=OVERDUE is a valid,
// meaningful request even though it's never stored directly.
const FILTERABLE_STATUSES: TaskStatus[] = [...SETTABLE_STATUSES, "OVERDUE"];

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function parseOptionalDate(v: unknown, fieldName: string): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest(`\`${fieldName}\` must be a valid date.`);
  return d;
}

export function parseTaskCreate(body: unknown): TaskCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) throw ApiError.badRequest("`title` is required.");

  let priority: Priority | undefined;
  if (b.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(b.priority as Priority)) {
      throw ApiError.badRequest(`\`priority\` must be one of: ${VALID_PRIORITIES.join(", ")}.`);
    }
    priority = b.priority as Priority;
  }

  return {
    title,
    description: trimOrNull(b.description) ?? null,
    departmentId: trimOrNull(b.departmentId) ?? null,
    assignedToEmployeeId: trimOrNull(b.assignedToEmployeeId) ?? null,
    assignedBy: trimOrNull(b.assignedBy) ?? null,
    dueDate: parseOptionalDate(b.dueDate, "dueDate") ?? null,
    priority,
    notes: trimOrNull(b.notes) ?? null,
  };
}

export function parseTaskUpdate(body: unknown): TaskUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: TaskUpdateInput = {};

  if (b.title !== undefined) {
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (!title) throw ApiError.badRequest("`title` cannot be empty.");
    out.title = title;
  }
  if (b.description !== undefined) out.description = trimOrNull(b.description);
  if (b.departmentId !== undefined) out.departmentId = trimOrNull(b.departmentId);
  if (b.assignedToEmployeeId !== undefined) out.assignedToEmployeeId = trimOrNull(b.assignedToEmployeeId);
  if (b.assignedBy !== undefined) out.assignedBy = trimOrNull(b.assignedBy);
  if (b.dueDate !== undefined) out.dueDate = parseOptionalDate(b.dueDate, "dueDate");
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (b.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(b.priority as Priority)) {
      throw ApiError.badRequest(`\`priority\` must be one of: ${VALID_PRIORITIES.join(", ")}.`);
    }
    out.priority = b.priority as Priority;
  }

  if (b.status !== undefined) {
    if (!SETTABLE_STATUSES.includes(b.status as TaskStatus)) {
      throw ApiError.badRequest(
        `\`status\` must be one of: ${SETTABLE_STATUSES.join(", ")}. OVERDUE is calculated automatically from dueDate and cannot be set directly.`
      );
    }
    out.status = b.status as TaskStatus;
    // Auto-set completedAt when status moves to COMPLETED
    if (out.status === "COMPLETED" && b.completedAt === undefined) {
      out.completedAt = new Date();
    }
    // Clear completedAt if status moves away from COMPLETED
    if (out.status !== "COMPLETED" && b.completedAt === undefined) {
      out.completedAt = null;
    }
  }

  if (b.completedAt !== undefined) out.completedAt = parseOptionalDate(b.completedAt, "completedAt");

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }
  return out;
}

export function parseListQuery(query: Record<string, unknown>): TaskListQuery {
  const result: TaskListQuery = { page: 1, pageSize: 20 };

  const strFilter = (key: string): string | undefined => {
    const v = query[key];
    if (v === undefined) return undefined;
    if (typeof v !== "string" || v.trim() === "") throw ApiError.badRequest(`\`${key}\` filter must be a non-empty string.`);
    return v.trim();
  };

  const departmentId = strFilter("departmentId");
  if (departmentId) result.departmentId = departmentId;
  const assignedToEmployeeId = strFilter("assignedToEmployeeId");
  if (assignedToEmployeeId) result.assignedToEmployeeId = assignedToEmployeeId;

  if (query.status !== undefined) {
    if (!FILTERABLE_STATUSES.includes(query.status as TaskStatus)) {
      throw ApiError.badRequest(`\`status\` must be one of: ${FILTERABLE_STATUSES.join(", ")}.`);
    }
    result.status = query.status as TaskStatus;
  }

  if (query.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(query.priority as Priority)) {
      throw ApiError.badRequest(`\`priority\` must be one of: ${VALID_PRIORITIES.join(", ")}.`);
    }
    result.priority = query.priority as Priority;
  }

  if (query.page !== undefined) {
    const page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) throw ApiError.badRequest("`page` must be a positive integer.");
    result.page = page;
  }
  if (query.pageSize !== undefined) {
    const pageSize = Number(query.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw ApiError.badRequest("`pageSize` must be an integer between 1 and 100.");
    }
    result.pageSize = pageSize;
  }

  return result;
}
