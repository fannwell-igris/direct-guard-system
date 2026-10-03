import { RecordStatus, SiteShiftConfig } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

export interface SiteCreateInput {
  clientId: string;
  siteName: string;
  location?: string | null;
  notes?: string | null;
  activeShifts?: SiteShiftConfig;
}

export interface SiteUpdateInput {
  clientId?: string;
  siteName?: string;
  location?: string | null;
  notes?: string | null;
  activeShifts?: SiteShiftConfig;
}

const VALID_SHIFT_CONFIGS = Object.values(SiteShiftConfig);

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/** Validates and normalizes the body for POST /sites. Throws ApiError on failure. */
export function parseSiteCreate(body: unknown): SiteCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
  if (!clientId) {
    throw ApiError.badRequest("`clientId` is required.");
  }

  const siteName = typeof b.siteName === "string" ? b.siteName.trim() : "";
  if (!siteName) {
    throw ApiError.badRequest("`siteName` is required.");
  }
  if (siteName.length > 255) {
    throw ApiError.badRequest("`siteName` must be 255 characters or fewer.");
  }

  let activeShifts: SiteShiftConfig | undefined;
  if (b.activeShifts !== undefined) {
    if (!VALID_SHIFT_CONFIGS.includes(b.activeShifts as SiteShiftConfig)) {
      throw ApiError.badRequest(`\`activeShifts\` must be one of: ${VALID_SHIFT_CONFIGS.join(", ")}.`);
    }
    activeShifts = b.activeShifts as SiteShiftConfig;
  }

  return {
    clientId,
    siteName,
    location: trimOrNull(b.location) ?? null,
    notes: trimOrNull(b.notes) ?? null,
    activeShifts,
  };
}

/** Validates and normalizes the body for PUT /sites/:id. Every field optional; only provided fields are updated. */
export function parseSiteUpdate(body: unknown): SiteUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: SiteUpdateInput = {};

  if (b.clientId !== undefined) {
    const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
    if (!clientId) throw ApiError.badRequest("`clientId` cannot be empty.");
    out.clientId = clientId;
  }

  if (b.siteName !== undefined) {
    const siteName = typeof b.siteName === "string" ? b.siteName.trim() : "";
    if (!siteName) throw ApiError.badRequest("`siteName` cannot be empty.");
    if (siteName.length > 255) throw ApiError.badRequest("`siteName` must be 255 characters or fewer.");
    out.siteName = siteName;
  }

  if (b.location !== undefined) out.location = trimOrNull(b.location);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (b.activeShifts !== undefined) {
    if (!VALID_SHIFT_CONFIGS.includes(b.activeShifts as SiteShiftConfig)) {
      throw ApiError.badRequest(`\`activeShifts\` must be one of: ${VALID_SHIFT_CONFIGS.join(", ")}.`);
    }
    out.activeShifts = b.activeShifts as SiteShiftConfig;
  }

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

const VALID_STATUSES = Object.values(RecordStatus);

/** Validates the body for PATCH /sites/:id/status. */
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

export interface SiteListQuery {
  search?: string;
  status?: RecordStatus;
  clientId?: string;
  page: number;
  pageSize: number;
}

/** Validates and normalizes query params for GET /sites. */
export function parseListQuery(query: Record<string, unknown>): SiteListQuery {
  const result: SiteListQuery = { page: 1, pageSize: 20 };

  if (typeof query.search === "string" && query.search.trim() !== "") {
    result.search = query.search.trim();
  }

  if (query.status !== undefined) {
    if (typeof query.status !== "string" || !VALID_STATUSES.includes(query.status as RecordStatus)) {
      throw ApiError.badRequest(`\`status\` filter must be one of: ${VALID_STATUSES.join(", ")}.`);
    }
    result.status = query.status as RecordStatus;
  }

  if (query.clientId !== undefined) {
    if (typeof query.clientId !== "string" || query.clientId.trim() === "") {
      throw ApiError.badRequest("`clientId` filter must be a non-empty string.");
    }
    result.clientId = query.clientId.trim();
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
