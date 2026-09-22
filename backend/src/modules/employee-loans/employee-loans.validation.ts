import { ApiError } from "../../middleware/errorHandler";

export interface EmployeeLoanCreateInput {
  employeeId: string;
  loanAmount: number;
  dateIssued: Date;
  monthlyRepayment: number;
  numberOfInstallments: number;
  startDate: Date;
  endDate?: Date | null;
  approvedBy?: string | null;
  notes?: string | null;
}

export interface EmployeeLoanUpdateInput {
  approvedBy?: string | null;
  notes?: string | null;
  status?: string;
}

export interface LoanListQuery {
  employeeId?: string;
  status?: string;
  page: number;
  pageSize: number;
}

export interface LoanRepaymentInput {
  amount: number;
  notes?: string | null;
}

const VALID_STATUSES = ["ACTIVE", "FULLY_REPAID", "DEFAULTED", "CANCELLED"];

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const t = v.trim();
  return t === "" ? null : t;
}

function parseDate(v: unknown, field: string): Date {
  if (!v) throw ApiError.badRequest(`\`${field}\` is required.`);
  const d = new Date(v as string);
  if (isNaN(d.getTime())) throw ApiError.badRequest(`\`${field}\` must be a valid date.`);
  return d;
}

function parseOptionalDate(v: unknown, field: string): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v as string);
  if (isNaN(d.getTime())) throw ApiError.badRequest(`\`${field}\` must be a valid date.`);
  return d;
}

export function parseEmployeeLoanCreate(body: unknown): EmployeeLoanCreateInput {
  if (typeof body !== "object" || body === null)
    throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;

  const employeeId = typeof b.employeeId === "string" ? b.employeeId.trim() : "";
  if (!employeeId) throw ApiError.badRequest("`employeeId` is required.");

  const loanAmount = Number(b.loanAmount);
  if (isNaN(loanAmount) || loanAmount <= 0)
    throw ApiError.badRequest("`loanAmount` must be a positive number.");

  const monthlyRepayment = Number(b.monthlyRepayment);
  if (isNaN(monthlyRepayment) || monthlyRepayment <= 0)
    throw ApiError.badRequest("`monthlyRepayment` must be a positive number.");

  const numberOfInstallments = Number(b.numberOfInstallments);
  if (!Number.isInteger(numberOfInstallments) || numberOfInstallments < 1)
    throw ApiError.badRequest("`numberOfInstallments` must be a positive integer.");

  return {
    employeeId,
    loanAmount,
    dateIssued: parseDate(b.dateIssued, "dateIssued"),
    monthlyRepayment,
    numberOfInstallments,
    startDate: parseDate(b.startDate, "startDate"),
    endDate: parseOptionalDate(b.endDate, "endDate") ?? null,
    approvedBy: trimOrNull(b.approvedBy) ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

export function parseEmployeeLoanUpdate(body: unknown): EmployeeLoanUpdateInput {
  if (typeof body !== "object" || body === null)
    throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;
  const out: EmployeeLoanUpdateInput = {};

  if (b.approvedBy !== undefined) out.approvedBy = trimOrNull(b.approvedBy);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);
  if (b.status !== undefined) {
    if (!VALID_STATUSES.includes(b.status as string))
      throw ApiError.badRequest(`\`status\` must be one of: ${VALID_STATUSES.join(", ")}.`);
    out.status = b.status as string;
  }

  if (Object.keys(out).length === 0)
    throw ApiError.badRequest("Request body must include at least one field to update.");
  return out;
}

export function parseLoanListQuery(query: Record<string, unknown>): LoanListQuery {
  const result: LoanListQuery = { page: 1, pageSize: 20 };

  if (query.employeeId !== undefined) {
    if (typeof query.employeeId !== "string" || !query.employeeId.trim())
      throw ApiError.badRequest("`employeeId` filter must be a non-empty string.");
    result.employeeId = query.employeeId.trim();
  }
  if (query.status !== undefined) {
    if (!VALID_STATUSES.includes(query.status as string))
      throw ApiError.badRequest(`\`status\` must be one of: ${VALID_STATUSES.join(", ")}.`);
    result.status = query.status as string;
  }
  if (query.page !== undefined) {
    const page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) throw ApiError.badRequest("`page` must be a positive integer.");
    result.page = page;
  }
  if (query.pageSize !== undefined) {
    const pageSize = Number(query.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
      throw ApiError.badRequest("`pageSize` must be between 1 and 100.");
    result.pageSize = pageSize;
  }
  return result;
}

export function parseLoanRepaymentInput(body: unknown): LoanRepaymentInput {
  if (typeof body !== "object" || body === null)
    throw ApiError.badRequest("Request body must be a JSON object.");
  const b = body as Record<string, unknown>;

  const amount = Number(b.amount);
  if (isNaN(amount) || amount <= 0) throw ApiError.badRequest("`amount` must be a positive number.");

  const notes = typeof b.notes === "string" ? b.notes.trim() || null : null;
  return { amount, notes };
}
