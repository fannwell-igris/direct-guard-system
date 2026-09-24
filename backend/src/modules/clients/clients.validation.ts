import { RecordStatus } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

export interface ClientCreateInput {
  name: string;
  location?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface ClientUpdateInput {
  name?: string;
  location?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/** Validates and normalizes the body for POST /clients. Throws ApiError on failure. */
export function parseClientCreate(body: unknown): ClientCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) {
    throw ApiError.badRequest("`name` is required.");
  }
  if (name.length > 255) {
    throw ApiError.badRequest("`name` must be 255 characters or fewer.");
  }

  const email = trimOrNull(b.email);
  if (email && !EMAIL_RE.test(email)) {
    throw ApiError.badRequest("`email` is not a valid email address.");
  }

  return {
    name,
    location: trimOrNull(b.location) ?? null,
    phone: trimOrNull(b.phone) ?? null,
    email: email ?? null,
    address: trimOrNull(b.address) ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

/** Validates and normalizes the body for PUT /clients/:id. Every field optional; only provided fields are updated. */
export function parseClientUpdate(body: unknown): ClientUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: ClientUpdateInput = {};

  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) throw ApiError.badRequest("`name` cannot be empty.");
    if (name.length > 255) throw ApiError.badRequest("`name` must be 255 characters or fewer.");
    out.name = name;
  }

  if (b.location !== undefined) out.location = trimOrNull(b.location);
  if (b.phone !== undefined) out.phone = trimOrNull(b.phone);
  if (b.address !== undefined) out.address = trimOrNull(b.address);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (b.email !== undefined) {
    const email = trimOrNull(b.email);
    if (email && !EMAIL_RE.test(email)) {
      throw ApiError.badRequest("`email` is not a valid email address.");
    }
    out.email = email;
  }

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

const VALID_STATUSES = Object.values(RecordStatus);

/** Validates the body for PATCH /clients/:id/status. */
export function parseStatusUpdate(body: unknown): RecordStatus {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const status = (body as Record<string, unknown>).status;
  if (typeof status !== "string" || !VALID_STATUSES.includes(status as RecordStatus)) {
    throw ApiError.badRequest(
      `\`status\` must be one of: ${VALID_STATUSES.join(", ")}.`
    );
  }
  return status as RecordStatus;
}

export interface ClientListQuery {
  search?: string;
  status?: RecordStatus;
  page: number;
  pageSize: number;
}

/** Validates and normalizes query params for GET /clients. */
export function parseListQuery(query: Record<string, unknown>): ClientListQuery {
  const result: ClientListQuery = { page: 1, pageSize: 20 };

  if (typeof query.search === "string" && query.search.trim() !== "") {
    result.search = query.search.trim();
  }

  if (query.status !== undefined) {
    if (typeof query.status !== "string" || !VALID_STATUSES.includes(query.status as RecordStatus)) {
      throw ApiError.badRequest(`\`status\` filter must be one of: ${VALID_STATUSES.join(", ")}.`);
    }
    result.status = query.status as RecordStatus;
  }

  if (query.page !== undefined) {
    const page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) {
      throw ApiError.badRequest("`page` must be a positive integer.");
    }
    result.page = page;
  }

  if (query.pageSize !== undefined) {
    const pageSize = Number(query.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
      throw ApiError.badRequest("`pageSize` must be an integer between 1 and 500.");
    }
    result.pageSize = pageSize;
  }

  return result;
}
