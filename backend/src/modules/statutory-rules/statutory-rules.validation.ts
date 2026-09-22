import { StatutoryRuleType } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

const ALL_RULE_TYPES: StatutoryRuleType[] = ["PERCENTAGE", "FIXED", "BRACKETED"];

export interface BracketDef {
  min: number;
  max: number | null;
  rate: number;
}

export interface StatutoryRuleCreateInput {
  name: string;
  description?: string | null;
  ruleType: StatutoryRuleType;
  deductionTypeId: string;
  employeeRate?: number | null;
  employerRate?: number | null;
  config?: { brackets: BracketDef[] } | null;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  isActive?: boolean;
  notes?: string | null;
}

export interface StatutoryRuleUpdateInput {
  name?: string;
  description?: string | null;
  employeeRate?: number | null;
  employerRate?: number | null;
  config?: { brackets: BracketDef[] } | null;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
  isActive?: boolean;
  notes?: string | null;
  // ruleType and deductionTypeId are deliberately NOT editable — changing
  // what a rule fundamentally computes, or which deduction it feeds,
  // should be a new rule with its own effective date range, not a mutation
  // of history. Same reasoning as EmployeeContract's immutable core terms.
}

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function parseRate(v: unknown, fieldName: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a number.`);
  }
  return v;
}

function parseDate(v: unknown, fieldName: string): Date {
  const d = new Date(v as string);
  if (typeof v !== "string" || Number.isNaN(d.getTime())) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a valid date.`);
  }
  return d;
}

function parseBracketConfig(v: unknown): { brackets: BracketDef[] } {
  if (typeof v !== "object" || v === null || !Array.isArray((v as any).brackets)) {
    throw ApiError.badRequest(
      '`config` is required for BRACKETED rules and must be shaped like { "brackets": [{ "min": 0, "max": 4000, "rate": 0 }, ...] }.'
    );
  }
  const brackets = (v as any).brackets as unknown[];
  if (brackets.length === 0) {
    throw ApiError.badRequest("`config.brackets` must contain at least one bracket.");
  }
  const parsed: BracketDef[] = brackets.map((b, i) => {
    if (typeof b !== "object" || b === null) {
      throw ApiError.badRequest(`\`config.brackets[${i}]\` must be an object.`);
    }
    const { min, max, rate } = b as Record<string, unknown>;
    if (typeof min !== "number") throw ApiError.badRequest(`\`config.brackets[${i}].min\` must be a number.`);
    if (max !== null && typeof max !== "number") {
      throw ApiError.badRequest(`\`config.brackets[${i}].max\` must be a number or null.`);
    }
    if (typeof rate !== "number") throw ApiError.badRequest(`\`config.brackets[${i}].rate\` must be a number.`);
    return { min, max: max as number | null, rate };
  });
  return { brackets: parsed };
}

/** Validates and normalizes the body for POST /statutory-rules. */
export function parseStatutoryRuleCreate(body: unknown): StatutoryRuleCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) throw ApiError.badRequest("`name` is required.");

  const deductionTypeId = typeof b.deductionTypeId === "string" ? b.deductionTypeId.trim() : "";
  if (!deductionTypeId) throw ApiError.badRequest("`deductionTypeId` is required.");

  if (typeof b.ruleType !== "string" || !ALL_RULE_TYPES.includes(b.ruleType as StatutoryRuleType)) {
    throw ApiError.badRequest(`\`ruleType\` must be one of: ${ALL_RULE_TYPES.join(", ")}.`);
  }
  const ruleType = b.ruleType as StatutoryRuleType;

  const effectiveFrom = parseDate(b.effectiveFrom, "effectiveFrom");
  const effectiveTo = b.effectiveTo !== undefined && b.effectiveTo !== null ? parseDate(b.effectiveTo, "effectiveTo") : null;
  if (effectiveTo && effectiveTo <= effectiveFrom) {
    throw ApiError.badRequest("`effectiveTo` must be after `effectiveFrom`.");
  }

  let employeeRate: number | null | undefined;
  let employerRate: number | null | undefined;
  let config: { brackets: BracketDef[] } | null = null;

  if (ruleType === "BRACKETED") {
    config = parseBracketConfig(b.config);
    if (b.employeeRate !== undefined || b.employerRate !== undefined) {
      throw ApiError.badRequest("`employeeRate`/`employerRate` do not apply to BRACKETED rules — use `config`.");
    }
  } else {
    employeeRate = parseRate(b.employeeRate, "employeeRate");
    employerRate = parseRate(b.employerRate, "employerRate");
    if (employeeRate === undefined && employerRate === undefined) {
      throw ApiError.badRequest("At least one of `employeeRate`/`employerRate` is required for PERCENTAGE/FIXED rules.");
    }
    if (b.config !== undefined) {
      throw ApiError.badRequest("`config` only applies to BRACKETED rules.");
    }
  }

  let isActive: boolean | undefined;
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") throw ApiError.badRequest("`isActive` must be a boolean.");
    isActive = b.isActive;
  }

  return {
    name,
    description: trimOrNull(b.description) ?? null,
    ruleType,
    deductionTypeId,
    employeeRate: employeeRate ?? null,
    employerRate: employerRate ?? null,
    config,
    effectiveFrom,
    effectiveTo,
    isActive,
    notes: trimOrNull(b.notes) ?? null,
  };
}

/** Validates and normalizes the body for PUT /statutory-rules/:id. */
export function parseStatutoryRuleUpdate(body: unknown): StatutoryRuleUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: StatutoryRuleUpdateInput = {};

  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) throw ApiError.badRequest("`name` cannot be empty.");
    out.name = name;
  }
  if (b.description !== undefined) out.description = trimOrNull(b.description);
  if (b.employeeRate !== undefined) out.employeeRate = parseRate(b.employeeRate, "employeeRate");
  if (b.employerRate !== undefined) out.employerRate = parseRate(b.employerRate, "employerRate");
  if (b.config !== undefined) out.config = b.config === null ? null : parseBracketConfig(b.config);
  if (b.effectiveFrom !== undefined) out.effectiveFrom = parseDate(b.effectiveFrom, "effectiveFrom");
  if (b.effectiveTo !== undefined) out.effectiveTo = b.effectiveTo === null ? null : parseDate(b.effectiveTo, "effectiveTo");
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") throw ApiError.badRequest("`isActive` must be a boolean.");
    out.isActive = b.isActive;
  }
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }
  return out;
}

export interface StatutoryRuleListQuery {
  isActive?: boolean;
}

/** Validates and normalizes query params for GET /statutory-rules. */
export function parseListQuery(query: Record<string, unknown>): StatutoryRuleListQuery {
  const result: StatutoryRuleListQuery = {};
  if (query.isActive !== undefined) {
    if (query.isActive === "true") result.isActive = true;
    else if (query.isActive === "false") result.isActive = false;
    else throw ApiError.badRequest("`isActive` filter must be 'true' or 'false'.");
  }
  return result;
}
