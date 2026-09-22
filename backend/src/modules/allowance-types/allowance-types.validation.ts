import { ApiError } from "../../middleware/errorHandler";

export interface AllowanceTypeCreateInput {
  name: string;
  description?: string | null;
  isActive?: boolean;
}

export interface AllowanceTypeUpdateInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/** Validates and normalizes the body for POST /allowance-types. */
export function parseAllowanceTypeCreate(body: unknown): AllowanceTypeCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) throw ApiError.badRequest("`name` is required.");
  if (name.length > 100) throw ApiError.badRequest("`name` must be 100 characters or fewer.");

  let isActive: boolean | undefined;
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") throw ApiError.badRequest("`isActive` must be a boolean.");
    isActive = b.isActive;
  }

  return { name, description: trimOrNull(b.description) ?? null, isActive };
}

/** Validates and normalizes the body for PUT /allowance-types/:id. */
export function parseAllowanceTypeUpdate(body: unknown): AllowanceTypeUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: AllowanceTypeUpdateInput = {};

  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) throw ApiError.badRequest("`name` cannot be empty.");
    if (name.length > 100) throw ApiError.badRequest("`name` must be 100 characters or fewer.");
    out.name = name;
  }
  if (b.description !== undefined) out.description = trimOrNull(b.description);
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") throw ApiError.badRequest("`isActive` must be a boolean.");
    out.isActive = b.isActive;
  }

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

export interface AllowanceTypeListQuery {
  isActive?: boolean;
}

/** Validates and normalizes query params for GET /allowance-types. */
export function parseListQuery(query: Record<string, unknown>): AllowanceTypeListQuery {
  const result: AllowanceTypeListQuery = {};
  if (query.isActive !== undefined) {
    if (query.isActive === "true") result.isActive = true;
    else if (query.isActive === "false") result.isActive = false;
    else throw ApiError.badRequest("`isActive` filter must be 'true' or 'false'.");
  }
  return result;
}
