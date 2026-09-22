import { Priority, DepartmentRequestStatus } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

export interface DepartmentRequestCreateInput {
  departmentId: string;
  title: string;
  description?: string | null;
  priority?: Priority;
  submittedBy?: string | null;
  estimatedCost?: number | null;
  notes?: string | null;
}

export interface DepartmentRequestUpdateInput {
  title?: string;
  description?: string | null;
  priority?: Priority;
  status?: DepartmentRequestStatus;
  submittedBy?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  estimatedCost?: number | null;
  notes?: string | null;
}

export interface DepartmentRequestListQuery {
  departmentId?: string;
  status?: DepartmentRequestStatus;
  priority?: Priority;
  page: number;
  pageSize: number;
}

const VALID_PRIORITIES: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"];
// FULFILLED is set automatically by the app layer — not accepted on direct update
const EDITABLE_STATUSES: DepartmentRequestStatus[] = ["PENDING", "APPROVED", "REJECTED"];

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const t = v.trim();
  return t === "" ? null : t;
}

function parseOptionalDecimal(v: unknown, fieldName: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) throw ApiError.badRequest(`\`${fieldName}\` must be a non-negative number.`);
  return n;
}

export function parseDepartmentRequestCreate(body: unknown): DepartmentRequestCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const departmentId = typeof b.departmentId === "string" ? b.departmentId.trim() : "";
  if (!departmentId) throw ApiError.badRequest("`departmentId` is required.");

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
    departmentId,
    title,
    description: trimOrNull(b.description) ?? null,
    priority,
    submittedBy: trimOrNull(b.submittedBy) ?? null,
    estimatedCost: parseOptionalDecimal(b.estimatedCost, "estimatedCost") ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

export function parseDepartmentRequestUpdate(body: unknown): DepartmentRequestUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: DepartmentRequestUpdateInput = {};

  if (b.title !== undefined) {
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (!title) throw ApiError.badRequest("`title` cannot be empty.");
    out.title = title;
  }
  if (b.description !== undefined) out.description = trimOrNull(b.description);
  if (b.submittedBy !== undefined) out.submittedBy = trimOrNull(b.submittedBy);
  if (b.reviewedBy !== undefined) out.reviewedBy = trimOrNull(b.reviewedBy);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);
  if (b.estimatedCost !== undefined) out.estimatedCost = parseOptionalDecimal(b.estimatedCost, "estimatedCost");

  if (b.reviewedAt !== undefined) {
    if (b.reviewedAt === null || b.reviewedAt === "") {
      out.reviewedAt = null;
    } else {
      const d = new Date(b.reviewedAt as string);
      if (Number.isNaN(d.getTime())) throw ApiError.badRequest("`reviewedAt` must be a valid date.");
      out.reviewedAt = d;
    }
  }

  if (b.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(b.priority as Priority)) {
      throw ApiError.badRequest(`\`priority\` must be one of: ${VALID_PRIORITIES.join(", ")}.`);
    }
    out.priority = b.priority as Priority;
  }

  if (b.status !== undefined) {
    // FULFILLED cannot be set manually — only via GeneralExpense linkage
    if (!EDITABLE_STATUSES.includes(b.status as DepartmentRequestStatus)) {
      throw ApiError.badRequest(
        `\`status\` can only be set to: ${EDITABLE_STATUSES.join(", ")}. FULFILLED is set automatically when a GeneralExpense is linked.`
      );
    }
    out.status = b.status as DepartmentRequestStatus;
    // Auto-set reviewedAt when approving/rejecting if not supplied
    if ((out.status === "APPROVED" || out.status === "REJECTED") && b.reviewedAt === undefined) {
      out.reviewedAt = new Date();
    }
  }

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }
  return out;
}

export function parseListQuery(query: Record<string, unknown>): DepartmentRequestListQuery {
  const result: DepartmentRequestListQuery = { page: 1, pageSize: 20 };

  if (query.departmentId !== undefined) {
    if (typeof query.departmentId !== "string" || !query.departmentId.trim()) {
      throw ApiError.badRequest("`departmentId` filter must be a non-empty string.");
    }
    result.departmentId = query.departmentId.trim();
  }

  if (query.status !== undefined) {
    const all: DepartmentRequestStatus[] = ["PENDING", "APPROVED", "REJECTED", "FULFILLED"];
    if (!all.includes(query.status as DepartmentRequestStatus)) {
      throw ApiError.badRequest(`\`status\` must be one of: ${all.join(", ")}.`);
    }
    result.status = query.status as DepartmentRequestStatus;
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
