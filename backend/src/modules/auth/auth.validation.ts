import { ApiError } from "../../middleware/errorHandler";

export interface LoginInput {
  email: string;
  password: string;
}

export function parseLogin(body: unknown): LoginInput {
  if (typeof body !== "object" || body === null) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!email) throw ApiError.badRequest("`email` is required.");

  const password = typeof b.password === "string" ? b.password : "";
  if (!password) throw ApiError.badRequest("`password` is required.");

  return { email, password };
}
