import { Request, Response, NextFunction } from "express";
import { verifyToken, AuthTokenPayload } from "../lib/jwt";
import { ApiError } from "./errorHandler";

// Augment Express's Request type so req.user is available (and typed)
// in every downstream handler without re-declaring it everywhere.
declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

/**
 * Requires a valid `Authorization: Bearer <token>` header. Attaches the
 * decoded payload to req.user on success. This is the ONLY check applied
 * globally — see server.ts for exactly which routes it's mounted before.
 * Per-role restrictions (requireRole below) are opt-in per route, not
 * applied broadly yet — minimal scope, see PROJECT_HANDOFF.md.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Missing or malformed Authorization header. Expected: Bearer <token>.");
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    req.user = verifyToken(token);
  } catch {
    throw ApiError.unauthorized("Invalid or expired token. Please log in again.");
  }

  next();
}

/**
 * Requires req.user.role to be one of the given roles. Must be used
 * AFTER requireAuth on the same route (relies on req.user being set).
 * Currently only applied to User-management routes — see users.routes.ts.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw ApiError.unauthorized("Not authenticated.");
    }
    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden(`This action requires one of these roles: ${roles.join(", ")}.`);
    }
    next();
  };
}
