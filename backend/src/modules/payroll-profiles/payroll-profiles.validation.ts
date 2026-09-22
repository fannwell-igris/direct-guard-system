import { ApiError } from "../../middleware/errorHandler";

export interface PayrollProfileUpsertInput {
  bankName?: string | null;
  accountNumber?: string | null;
  branchName?: string | null;
  mobileMoneyProvider?: string | null;
  mobileMoneyNumber?: string | null;
  paymentMethod?: string | null;
  tpin?: string | null;
  napsaNumber?: string | null;
  nhimaNumber?: string | null;
  nrcNumber?: string | null;
  notes?: string | null;
}

export interface SalaryHistoryCreateInput {
  newSalary: number;
  effectiveDate: Date;
  reason?: string | null;
  changedBy?: string | null;
  approvedBy?: string | null;
}

const VALID_PAYMENT_METHODS = ["BANK_TRANSFER", "MOBILE_MONEY", "CASH"];

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const t = v.trim();
  return t === "" ? null : t;
}

export function parsePayrollProfileUpsert(body: unknown): PayrollProfileUpsertInput {
  if (typeof body !== "object" || body === null)
    throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;
  const out: PayrollProfileUpsertInput = {};

  if (b.bankName !== undefined) out.bankName = trimOrNull(b.bankName);
  if (b.accountNumber !== undefined) out.accountNumber = trimOrNull(b.accountNumber);
  if (b.branchName !== undefined) out.branchName = trimOrNull(b.branchName);
  if (b.mobileMoneyProvider !== undefined) out.mobileMoneyProvider = trimOrNull(b.mobileMoneyProvider);
  if (b.mobileMoneyNumber !== undefined) out.mobileMoneyNumber = trimOrNull(b.mobileMoneyNumber);
  if (b.tpin !== undefined) out.tpin = trimOrNull(b.tpin);
  if (b.napsaNumber !== undefined) out.napsaNumber = trimOrNull(b.napsaNumber);
  if (b.nhimaNumber !== undefined) out.nhimaNumber = trimOrNull(b.nhimaNumber);
  if (b.nrcNumber !== undefined) out.nrcNumber = trimOrNull(b.nrcNumber);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (b.paymentMethod !== undefined) {
    if (b.paymentMethod !== null && !VALID_PAYMENT_METHODS.includes(b.paymentMethod as string))
      throw ApiError.badRequest(`\`paymentMethod\` must be one of: ${VALID_PAYMENT_METHODS.join(", ")}.`);
    out.paymentMethod = b.paymentMethod as string | null;
  }

  if (Object.keys(out).length === 0)
    throw ApiError.badRequest("Request body must include at least one field to update.");
  return out;
}

export function parseSalaryHistoryCreate(body: unknown): SalaryHistoryCreateInput {
  if (typeof body !== "object" || body === null)
    throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;

  const newSalary = Number(b.newSalary);
  if (isNaN(newSalary) || newSalary < 0)
    throw ApiError.badRequest("`newSalary` must be a non-negative number.");

  if (!b.effectiveDate) throw ApiError.badRequest("`effectiveDate` is required.");
  const effectiveDate = new Date(b.effectiveDate as string);
  if (isNaN(effectiveDate.getTime()))
    throw ApiError.badRequest("`effectiveDate` must be a valid date.");

  return {
    newSalary,
    effectiveDate,
    reason: trimOrNull(b.reason) ?? null,
    changedBy: trimOrNull(b.changedBy) ?? null,
    approvedBy: trimOrNull(b.approvedBy) ?? null,
  };
}
