import { ApiError } from "../../middleware/errorHandler";

const VALID_ROLES = ["ADMIN", "MANAGER", "HR", "PAYROLL", "OPERATIONS", "MARKETING", "STAFF"];
const MIN_PASSWORD_LENGTH = 8;

function parseOptionalNullableId(v: unknown, fieldName: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") throw ApiError.badRequest(`\${fieldName}\ must be a string.`);
  return v.trim();
}

export interface UserCreateInput {
  email: string;
  password: string;
  fullName: string;
  role: string;
  departmentId?: string | null;
}

export function parseUserCreate(body: unknown): UserCreateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!email) throw ApiError.badRequest("`email` is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw ApiError.badRequest("`email` is not a valid email address.");

  const password = typeof b.password === "string" ? b.password : "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(`\`password\` must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
  if (!fullName) throw ApiError.badRequest("`fullName` is required.");

  const role = typeof b.role === "string" ? b.role : "STAFF";
  if (!VALID_ROLES.includes(role)) {
    throw ApiError.badRequest(`\`role\` must be one of: ${VALID_ROLES.join(", ")}.`);
  }

  const departmentId = parseOptionalNullableId(b.departmentId, "departmentId") ?? null;

  return { email, password, fullName, role, departmentId };
}

export interface UserUpdateInput {
  fullName?: string;
  role?: string;
  isActive?: boolean;
  departmentId?: string | null;
}

export function parseUserUpdate(body: unknown): UserUpdateInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const out: UserUpdateInput = {};

  if (b.fullName !== undefined) {
    const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
    if (!fullName) throw ApiError.badRequest("`fullName` cannot be empty.");
    out.fullName = fullName;
  }
  if (b.role !== undefined) {
    if (typeof b.role !== "string" || !VALID_ROLES.includes(b.role)) {
      throw ApiError.badRequest(`\`role\` must be one of: ${VALID_ROLES.join(", ")}.`);
    }
    out.role = b.role;
  }
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== "boolean") throw ApiError.badRequest("`isActive` must be a boolean.");
    out.isActive = b.isActive;
  }
  if (b.departmentId !== undefined) {
    out.departmentId = parseOptionalNullableId(b.departmentId, "departmentId");
  }

  if (Object.keys(out).length === 0) {
    throw ApiError.badRequest("Request body must include at least one field to update.");
  }

  return out;
}

export interface PasswordChangeInput {
  newPassword: string;
}

export function parsePasswordChange(body: unknown): PasswordChangeInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;
  const newPassword = typeof b.newPassword === "string" ? b.newPassword : "";
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(`\`newPassword\` must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return { newPassword };
}
