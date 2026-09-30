import { EmploymentStatus } from "@prisma/client";
import { ApiError } from "../../middleware/errorHandler";

export interface EmployeeCreateInput {
  fullName: string;
  employeeNumber?: string | null;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  salary?: number | null;
  contractStartDate?: Date | null;
  contractEndDate?: Date | null;
  assignedClientId?: string | null;
  assignedSiteId?: string | null;
  napsaRegistered?: boolean;
  nhimaRegistered?: boolean;
  nextOfKinName?: string | null;
  nextOfKinRelationship?: string | null;
  nextOfKinPhone?: string | null;
  notes?: string | null;
}

export interface EmployeeUpdateInput {
  fullName?: string;
  employeeNumber?: string | null;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  salary?: number | null;
  contractStartDate?: Date | null;
  contractEndDate?: Date | null;
  assignedClientId?: string | null;
  assignedSiteId?: string | null;
  employmentStatus?: EmploymentStatus;
  napsaRegistered?: boolean;
  nhimaRegistered?: boolean;
  nextOfKinName?: string | null;
  nextOfKinRelationship?: string | null;
  nextOfKinPhone?: string | null;
  notes?: string | null;
}

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw ApiError.badRequest("Expected a string value.");
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function parseSalary(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw ApiError.badRequest("`salary` must be a non-negative number.");
  }
  return n;
}

function parseDate(v: unknown, fieldName: string): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) {
    throw ApiError.badRequest(`\`${fieldName}\` must be a valid date (e.g. "2026-01-31").`);
  }
  return d;
}

function checkDateOrder(start: Date | null | undefined, end: Date | null | undefined) {
  if (start && end && start.getTime() > end.getTime()) {
    throw ApiError.badRequest("`contractEndDate` cannot be before `contractStartDate`.");
  }
}

function parseOptionalBoolean(v: unknown, fieldName: string): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") throw ApiError.badRequest(`\`${fieldName}\` must be a boolean.`);
  return v;
}

/** Validates and normalizes the body for POST /employees. Throws ApiError on failure. */
export function parseEmployeeCreate(body: unknown): EmployeeCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
  if (!fullName) {
    throw ApiError.badRequest("`fullName` is required.");
  }
  if (fullName.length > 255) {
    throw ApiError.badRequest("`fullName` must be 255 characters or fewer.");
  }

  const contractStartDate = parseDate(b.contractStartDate, "contractStartDate") ?? null;
  const contractEndDate = parseDate(b.contractEndDate, "contractEndDate") ?? null;
  checkDateOrder(contractStartDate, contractEndDate);

  return {
    fullName,
    employeeNumber: trimOrNull(b.employeeNumber) ?? null,
    position: trimOrNull(b.position) ?? null,
    phone: trimOrNull(b.phone) ?? null,
    email: trimOrNull(b.email) ?? null,
    address: trimOrNull(b.address) ?? null,
    salary: parseSalary(b.salary) ?? null,
    contractStartDate,
    contractEndDate,
    assignedClientId: trimOrNull(b.assignedClientId) ?? null,
    assignedSiteId: trimOrNull(b.assignedSiteId) ?? null,
    napsaRegistered: parseOptionalBoolean(b.napsaRegistered, "napsaRegistered"),
    nhimaRegistered: parseOptionalBoolean(b.nhimaRegistered, "nhimaRegistered"),
    nextOfKinName: trimOrNull(b.nextOfKinName) ?? null,
    nextOfKinRelationship: trimOrNull(b.nextOfKinRelationship) ?? null,
    nextOfKinPhone: trimOrNull(b.nextOfKinPhone) ?? null,
    notes: trimOrNull(b.notes) ?? null,
  };
}

const VALID_EMPLOYMENT_STATUSES = Object.values(EmploymentStatus);

/** Validates and normalizes the body for PUT /employees/:id. Every field optional; only provided fields are updated. */
export function parseEmployeeUpdate(body: unknown): EmployeeUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: EmployeeUpdateInput = {};

  if (b.fullName !== undefined) {
    const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
    if (!fullName) throw ApiError.badRequest("`fullName` cannot be empty.");
    if (fullName.length > 255) throw ApiError.badRequest("`fullName` must be 255 characters or fewer.");
    out.fullName = fullName;
  }

  if (b.employeeNumber !== undefined) out.employeeNumber = trimOrNull(b.employeeNumber);
  if (b.position !== undefined) out.position = trimOrNull(b.position);
  if (b.phone !== undefined) out.phone = trimOrNull(b.phone);
  if (b.email !== undefined) out.email = trimOrNull(b.email);
  if (b.address !== undefined) out.address = trimOrNull(b.address);
  if (b.salary !== undefined) out.salary = parseSalary(b.salary);
  if (b.assignedClientId !== undefined) out.assignedClientId = trimOrNull(b.assignedClientId);
  if (b.assignedSiteId !== undefined) out.assignedSiteId = trimOrNull(b.assignedSiteId);
  if (b.napsaRegistered !== undefined) out.napsaRegistered = parseOptionalBoolean(b.napsaRegistered, "napsaRegistered");
  if (b.nhimaRegistered !== undefined) out.nhimaRegistered = parseOptionalBoolean(b.nhimaRegistered, "nhimaRegistered");
  if (b.nextOfKinName !== undefined) out.nextOfKinName = trimOrNull(b.nextOfKinName);
  if (b.nextOfKinRelationship !== undefined) out.nextOfKinRelationship = trimOrNull(b.nextOfKinRelationship);
  if (b.nextOfKinPhone !== undefined) out.nextOfKinPhone = trimOrNull(b.nextOfKinPhone);
  if (b.notes !== undefined) out.notes = trimOrNull(b.notes);

  if (b.contractStartDate !== undefined) out.contractStartDate = parseDate(b.contractStartDate, "contractStartDate");
  if (b.contractEndDate !== undefined) out.contractEndDate = parseDate(b.contractEndDate, "contractEndDate");
  checkDateOrder(out.contractStartDate, out.contractEndDate);

  if (b.employmentStatus !== undefined) {
    if (
      typeof b.employmentStatus !== "string" ||
      !VALID_EMPLOYMENT_STATUSES.includes(b.employmentStatus as EmploymentStatus)
    ) {
      throw ApiError.badRequest(
        `\`employmentStatus\` must be one of: ${VALID_EMPLOYMENT_STATUSES.join(", ")}.`
      );
    }
    out.employmentStatus = b.employmentStatus as EmploymentStatus;
  }

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

/** Validates the body for PATCH /employees/:id/status. */
export function parseEmploymentStatusUpdate(body: unknown): EmploymentStatus {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const status = (body as Record<string, unknown>).employmentStatus;
  if (typeof status !== "string" || !VALID_EMPLOYMENT_STATUSES.includes(status as EmploymentStatus)) {
    throw ApiError.badRequest(
      `\`employmentStatus\` must be one of: ${VALID_EMPLOYMENT_STATUSES.join(", ")}.`
    );
  }
  return status as EmploymentStatus;
}

export interface EmployeeListQuery {
  search?: string;
  employmentStatus?: EmploymentStatus;
  assignedClientId?: string;
  assignedSiteId?: string;
  page: number;
  pageSize: number;
  sortBy: EmployeeSortField;
  sortOrder: "asc" | "desc";
}

// Added 2026-09-25 for the Employees list "Sort by" control — fullName
// stays the default (matches prior behavior) since spotting duplicate
// names is easiest with same/similar names sitting next to each other.
export type EmployeeSortField =
  | "fullName"
  | "employeeNumber"
  | "position"
  | "salary"
  | "contractStartDate"
  | "dateAdded";

const VALID_SORT_FIELDS: EmployeeSortField[] = [
  "fullName",
  "employeeNumber",
  "position",
  "salary",
  "contractStartDate",
  "dateAdded",
];

/** Validates and normalizes query params for GET /employees. */
export function parseListQuery(query: Record<string, unknown>): EmployeeListQuery {
  const result: EmployeeListQuery = { page: 1, pageSize: 20, sortBy: "fullName", sortOrder: "asc" };

  if (typeof query.search === "string" && query.search.trim() !== "") {
    result.search = query.search.trim();
  }

  if (query.employmentStatus !== undefined) {
    if (
      typeof query.employmentStatus !== "string" ||
      !VALID_EMPLOYMENT_STATUSES.includes(query.employmentStatus as EmploymentStatus)
    ) {
      throw ApiError.badRequest(
        `\`employmentStatus\` filter must be one of: ${VALID_EMPLOYMENT_STATUSES.join(", ")}.`
      );
    }
    result.employmentStatus = query.employmentStatus as EmploymentStatus;
  }

  if (query.assignedClientId !== undefined) {
    if (typeof query.assignedClientId !== "string" || query.assignedClientId.trim() === "") {
      throw ApiError.badRequest("`assignedClientId` filter must be a non-empty string.");
    }
    result.assignedClientId = query.assignedClientId.trim();
  }

  if (query.assignedSiteId !== undefined) {
    if (typeof query.assignedSiteId !== "string" || query.assignedSiteId.trim() === "") {
      throw ApiError.badRequest("`assignedSiteId` filter must be a non-empty string.");
    }
    result.assignedSiteId = query.assignedSiteId.trim();
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

  if (query.sortBy !== undefined) {
    if (typeof query.sortBy !== "string" || !VALID_SORT_FIELDS.includes(query.sortBy as EmployeeSortField)) {
      throw ApiError.badRequest(`\`sortBy\` must be one of: ${VALID_SORT_FIELDS.join(", ")}.`);
    }
    result.sortBy = query.sortBy as EmployeeSortField;
  }

  if (query.sortOrder !== undefined) {
    if (query.sortOrder !== "asc" && query.sortOrder !== "desc") {
      throw ApiError.badRequest('`sortOrder` must be "asc" or "desc".');
    }
    result.sortOrder = query.sortOrder;
  }

  return result;
}
