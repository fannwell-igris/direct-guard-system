import { ProspectStage } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

const VALID_STAGES = Object.values(ProspectStage);

export interface ProspectCreateInput {
  companyName: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  location?: string | null;
  potentialService?: string | null;
  source?: string | null;
  assignedToId?: string | null;
  nextFollowUpDate?: Date | null;
  opportunityValue?: number | null;
  notes?: string | null;
}

export interface ProspectUpdateInput {
  companyName?: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  location?: string | null;
  potentialService?: string | null;
  source?: string | null;
  assignedToId?: string | null;
  lastContactDate?: Date | null;
  nextFollowUpDate?: Date | null;
  opportunityValue?: number | null;
  outcome?: string | null;
  notes?: string | null;
}

export interface StageChangeInput {
  stage: ProspectStage;
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

function parseDateOrNull(v: unknown, field: string): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) {
    throw ApiError.badRequest(`\`${field}\` must be a valid date.`);
  }
  return d;
}

function parseMoneyOrNull(v: unknown, field: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw ApiError.badRequest(`\`${field}\` must be a non-negative number.`);
  }
  return n;
}

/** Validates and normalizes the body for POST /prospects. */
export function parseProspectCreate(body: unknown): ProspectCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const companyName = typeof b.companyName === "string" ? b.companyName.trim() : "";
  if (!companyName) {
    throw ApiError.badRequest("`companyName` is required.");
  }

  const contactEmail = trimOrNull(b.contactEmail);
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    throw ApiError.badRequest("`contactEmail` is not a valid email address.");
  }

  if (b.assignedToId !== undefined && b.assignedToId !== null && typeof b.assignedToId !== "string") {
    throw ApiError.badRequest("`assignedToId` must be a string.");
  }

  return {
    companyName,
    contactName: trimOrNull(b.contactName) ?? null,
    contactPhone: trimOrNull(b.contactPhone) ?? null,
    contactEmail: contactEmail ?? null,
    location: trimOrNull(b.location) ?? null,
    potentialService: trimOrNull(b.potentialService) ?? null,
    source: trimOrNull(b.source) ?? null,
    assignedToId: (b.assignedToId as string | null | undefined) ?? null,
    nextFollowUpDate: parseDateOrNull(b.nextFollowUpDate, "nextFollowUpDate") ?? null,
    opportunityValue: parseMoneyOrNull(b.opportunityValue, "opportunityValue") ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

/** Validates and normalizes the body for PUT /prospects/:id. Every field optional. */
export function parseProspectUpdate(body: unknown): ProspectUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: ProspectUpdateInput = {};

  if (b.companyName !== undefined) {
    const companyName = typeof b.companyName === "string" ? b.companyName.trim() : "";
    if (!companyName) throw ApiError.badRequest("`companyName` cannot be empty.");
    out.companyName = companyName;
  }

  if (b.contactName !== undefined) out.contactName = trimOrNull(b.contactName);
  if (b.contactPhone !== undefined) out.contactPhone = trimOrNull(b.contactPhone);
  if (b.location !== undefined) out.location = trimOrNull(b.location);
  if (b.potentialService !== undefined) out.potentialService = trimOrNull(b.potentialService);
  if (b.source !== undefined) out.source = trimOrNull(b.source);
  if (b.outcome !== undefined) out.outcome = trimOrNull(b.outcome);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (b.contactEmail !== undefined) {
    const contactEmail = trimOrNull(b.contactEmail);
    if (contactEmail && !EMAIL_RE.test(contactEmail)) {
      throw ApiError.badRequest("`contactEmail` is not a valid email address.");
    }
    out.contactEmail = contactEmail;
  }

  if (b.assignedToId !== undefined) {
    if (b.assignedToId !== null && typeof b.assignedToId !== "string") {
      throw ApiError.badRequest("`assignedToId` must be a string.");
    }
    out.assignedToId = b.assignedToId as string | null;
  }

  if (b.lastContactDate !== undefined) out.lastContactDate = parseDateOrNull(b.lastContactDate, "lastContactDate");
  if (b.nextFollowUpDate !== undefined) out.nextFollowUpDate = parseDateOrNull(b.nextFollowUpDate, "nextFollowUpDate");
  if (b.opportunityValue !== undefined) out.opportunityValue = parseMoneyOrNull(b.opportunityValue, "opportunityValue");

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

/** Validates the body for PATCH /prospects/:id/stage. */
export function parseStageChange(body: unknown): StageChangeInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const stage = b.stage;
  if (typeof stage !== "string" || !VALID_STAGES.includes(stage as ProspectStage)) {
    throw ApiError.badRequest(`\`stage\` must be one of: ${VALID_STAGES.join(", ")}.`);
  }
  return {
    stage: stage as ProspectStage,
    notes: trimOrNull(b.notes) ?? null,
  };
}

export interface ProspectListQuery {
  search?: string;
  stage?: ProspectStage;
  assignedToId?: string;
  followUpDue?: boolean;
  page: number;
  pageSize: number;
}

/** Validates and normalizes query params for GET /prospects. */
export function parseListQuery(query: Record<string, unknown>): ProspectListQuery {
  const result: ProspectListQuery = { page: 1, pageSize: 20 };

  if (typeof query.search === "string" && query.search.trim() !== "") {
    result.search = query.search.trim();
  }

  if (query.stage !== undefined) {
    if (typeof query.stage !== "string" || !VALID_STAGES.includes(query.stage as ProspectStage)) {
      throw ApiError.badRequest(`\`stage\` filter must be one of: ${VALID_STAGES.join(", ")}.`);
    }
    result.stage = query.stage as ProspectStage;
  }

  if (typeof query.assignedToId === "string" && query.assignedToId.trim() !== "") {
    result.assignedToId = query.assignedToId.trim();
  }

  if (query.followUpDue !== undefined) {
    result.followUpDue = query.followUpDue === "true" || query.followUpDue === true;
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
