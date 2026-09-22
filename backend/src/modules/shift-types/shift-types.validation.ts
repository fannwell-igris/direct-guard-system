import { ApiError } from "../../middleware/errorHandler";

export interface ShiftTypeCreateInput {
  name: string;
  isActive?: boolean;
}

export interface ShiftTypeUpdateInput {
  name?: string;
  isActive?: boolean;
}

/** Validates and normalizes the body for POST /shift-types. */
export function parseShiftTypeCreate(body: unknown): ShiftTypeCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) {
    throw ApiError.badRequest("`name` is required.");
  }
  if (name.length > 100) {
    throw ApiError.badRequest("`name` must be 100 characters or fewer.");
  }

  let isActive: boolean | undefined;
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") {
      throw ApiError.badRequest("`isActive` must be a boolean.");
    }
    isActive = b.isActive;
  }

  return { name, isActive };
}

/** Validates and normalizes the body for PUT /shift-types/:id. */
export function parseShiftTypeUpdate(body: unknown): ShiftTypeUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: ShiftTypeUpdateInput = {};

  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) throw ApiError.badRequest("`name` cannot be empty.");
    if (name.length > 100) throw ApiError.badRequest("`name` must be 100 characters or fewer.");
    out.name = name;
  }

  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") {
      throw ApiError.badRequest("`isActive` must be a boolean.");
    }
    out.isActive = b.isActive;
  }

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

export interface ShiftTypeListQuery {
  isActive?: boolean;
}

/** Validates and normalizes query params for GET /shift-types. */
export function parseListQuery(query: Record<string, unknown>): ShiftTypeListQuery {
  const result: ShiftTypeListQuery = {};

  if (query.isActive !== undefined) {
    if (query.isActive === "true") result.isActive = true;
    else if (query.isActive === "false") result.isActive = false;
    else throw ApiError.badRequest("`isActive` filter must be 'true' or 'false'.");
  }

  return result;
}
