import { PayType, ContractType } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

export interface EmployeeContractCreateInput {
  employeeId: string;
  startDate: Date;
  endDate: Date;
  payType: PayType;
  salary?: number | null;
  shiftRate?: number | null;
  extraShiftRate?: number | null;
  contractType?: ContractType | null;
  notes?: string | null;
}

export interface EmployeeContractUpdateInput {
  employeeId?: string;
  startDate?: Date;
  endDate?: Date;
  payType?: PayType;
  salary?: number | null;
  shiftRate?: number | null;
  extraShiftRate?: number | null;
  contractType?: ContractType | null;
  notes?: string | null;
}

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function parseRequiredDate(v: unknown, fieldName: string): Date {
  if (v === undefined || v === null || v === "") {
    throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  }
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a valid date (e.g. "2026-01-31").`);
  }
  return d;
}

function parseOptionalDate(v: unknown, fieldName: string): Date | undefined {
  if (v === undefined) return undefined;
  return parseRequiredDate(v, fieldName);
}

function parseRequiredAmount(v: unknown, fieldName: string): number {
  if (v === undefined || v === null || v === "") {
    throw ApiError.badRequest(`\`${fieldName}\` is required.`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a non-negative number.`);
  }
  return n;
}

function parseOptionalAmount(v: unknown, fieldName: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a non-negative number.`);
  }
  return n;
}

const VALID_PAY_TYPES = Object.values(PayType);
const VALID_CONTRACT_TYPES = Object.values(ContractType);

function parsePayType(v: unknown): PayType {
  if (typeof v !== "string" || !VALID_PAY_TYPES.includes(v as PayType)) {
    throw ApiError.badRequest(`\`payType\` must be one of: ${VALID_PAY_TYPES.join(", ")}.`);
  }
  return v as PayType;
}

function parseContractType(v: unknown): ContractType | null {
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !VALID_CONTRACT_TYPES.includes(v as ContractType)) {
    throw ApiError.badRequest(
      `\`contractType\` must be one of: ${VALID_CONTRACT_TYPES.join(", ")}.`
    );
  }
  return v as ContractType;
}

/**
 * Validates and normalizes the body for POST /employee-contracts.
 * payType defaults to MONTHLY (matches the schema default) if not
 * provided, for backward compatibility with callers written before
 * shift-pay support existed. Enforces exactly the rule documented on the
 * EmployeeContract model: MONTHLY requires salary; SHIFT requires
 * shiftRate (extraShiftRate optional, defaults to shiftRate when null,
 * applied at read time by consumers like the Payroll preview endpoint —
 * NOT defaulted here, so a genuinely unset extraShiftRate stays visibly
 * null in the stored record).
 */
export function parseEmployeeContractCreate(body: unknown): EmployeeContractCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const employeeId = typeof b.employeeId === "string" ? b.employeeId.trim() : "";
  if (!employeeId) {
    throw ApiError.badRequest("`employeeId` is required.");
  }

  const startDate = parseRequiredDate(b.startDate, "startDate");
  const endDate = parseRequiredDate(b.endDate, "endDate");
  if (endDate.getTime() < startDate.getTime()) {
    throw ApiError.badRequest("`endDate` cannot be before `startDate`.");
  }

  const payType = b.payType !== undefined ? parsePayType(b.payType) : "MONTHLY";

  let salary: number | null = null;
  let shiftRate: number | null = null;
  let extraShiftRate: number | null = null;

  if (payType === "MONTHLY") {
    salary = parseRequiredAmount(b.salary, "salary");
    shiftRate = parseOptionalAmount(b.shiftRate, "shiftRate") ?? null;
    extraShiftRate = parseOptionalAmount(b.extraShiftRate, "extraShiftRate") ?? null;
  } else {
    // SHIFT
    shiftRate = parseRequiredAmount(b.shiftRate, "shiftRate");
    extraShiftRate = parseOptionalAmount(b.extraShiftRate, "extraShiftRate") ?? null;
    salary = parseOptionalAmount(b.salary, "salary") ?? null;
  }

  return {
    employeeId,
    startDate,
    endDate,
    payType,
    salary,
    shiftRate,
    extraShiftRate,
    contractType: b.contractType !== undefined ? parseContractType(b.contractType) : null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

/**
 * Validates and normalizes the body for PUT /employee-contracts/:id.
 * Cross-field enforcement (MONTHLY needs salary, SHIFT needs shiftRate)
 * happens in the service layer, not here — this function doesn't have
 * access to the existing record, and a PUT might change payType without
 * resending every other field.
 */
export function parseEmployeeContractUpdate(body: unknown): EmployeeContractUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: EmployeeContractUpdateInput = {};

  if (b.employeeId !== undefined) {
    const employeeId = typeof b.employeeId === "string" ? b.employeeId.trim() : "";
    if (!employeeId) throw ApiError.badRequest("`employeeId` cannot be empty.");
    out.employeeId = employeeId;
  }

  if (b.startDate !== undefined) out.startDate = parseOptionalDate(b.startDate, "startDate");
  if (b.endDate !== undefined) out.endDate = parseOptionalDate(b.endDate, "endDate");
  if (out.startDate && out.endDate && out.endDate.getTime() < out.startDate.getTime()) {
    throw ApiError.badRequest("`endDate` cannot be before `startDate`.");
  }

  if (b.payType !== undefined) out.payType = parsePayType(b.payType);
  if (b.salary !== undefined) out.salary = parseOptionalAmount(b.salary, "salary") ?? null;
  if (b.shiftRate !== undefined) out.shiftRate = parseOptionalAmount(b.shiftRate, "shiftRate") ?? null;
  if (b.extraShiftRate !== undefined)
    out.extraShiftRate = parseOptionalAmount(b.extraShiftRate, "extraShiftRate") ?? null;
  if (b.contractType !== undefined) out.contractType = parseContractType(b.contractType);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

export interface EmployeeContractListQuery {
  employeeId?: string;
  status?: string;
  page: number;
  pageSize: number;
}

const VALID_STATUSES = ["ACTIVE", "EXPIRING_SOON", "EXPIRED", "INACTIVE"];

/** Validates and normalizes query params for GET /employee-contracts. */
export function parseListQuery(query: Record<string, unknown>): EmployeeContractListQuery {
  const result: EmployeeContractListQuery = { page: 1, pageSize: 20 };

  if (query.employeeId !== undefined) {
    if (typeof query.employeeId !== "string" || query.employeeId.trim() === "") {
      throw ApiError.badRequest("`employeeId` filter must be a non-empty string.");
    }
    result.employeeId = query.employeeId.trim();
  }

  if (query.status !== undefined) {
    if (typeof query.status !== "string" || !VALID_STATUSES.includes(query.status)) {
      throw ApiError.badRequest(`\`status\` filter must be one of: ${VALID_STATUSES.join(", ")}.`);
    }
    result.status = query.status;
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
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw ApiError.badRequest("`pageSize` must be an integer between 1 and 100.");
    }
    result.pageSize = pageSize;
  }

  return result;
}
