import { RecordStatus } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

export interface DepartmentCreateInput {
  name: string;
  description?: string | null;
  headOfDepartment?: string | null;
}

export interface DepartmentUpdateInput {
  name?: string;
  description?: string | null;
  headOfDepartment?: string | null;
  status?: RecordStatus;
}

export interface DepartmentListQuery {
  status?: RecordStatus;
  page: number;
  pageSize: number;
}

const VALID_STATUSES: RecordStatus[] = ["ACTIVE", "INACTIVE", "ARCHIVED"];

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

export function parseDepartmentCreate(body: unknown): DepartmentCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) throw ApiError.badRequest("`name` is required.");

  return {
    name,
    description: trimOrNull(b.description) ?? null,
    headOfDepartment: trimOrNull(b.headOfDepartment) ?? null,
  };
}

export function parseDepartmentUpdate(body: unknown): DepartmentUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: DepartmentUpdateInput = {};

  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) throw ApiError.badRequest("`name` cannot be empty.");
    out.name = name;
  }
  if (b.description !== undefined) out.description = trimOrNull(b.description);
  if (b.headOfDepartment !== undefined) out.headOfDepartment = trimOrNull(b.headOfDepartment);
  if (b.status !== undefined) {
    if (!VALID_STATUSES.includes(b.status as RecordStatus)) {
      throw ApiError.badRequest(`\`status\` must be one of: ${VALID_STATUSES.join(", ")}.`);
    }
    out.status = b.status as RecordStatus;
  }

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }
  return out;
}

export function parseListQuery(query: Record<string, unknown>): DepartmentListQuery {
  const result: DepartmentListQuery = { page: 1, pageSize: 20 };

  if (query.status !== undefined) {
    if (!VALID_STATUSES.includes(query.status as RecordStatus)) {
      throw ApiError.badRequest(`\`status\` must be one of: ${VALID_STATUSES.join(", ")}.`);
    }
    result.status = query.status as RecordStatus;
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
