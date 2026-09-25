import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { ApiError, asyncHandler } from "./errorHandler";

/**
 * Added 2026-09-25, per explicit instruction: "Admin should have some
 * 'super' power to delete certain things with a password." Every DELETE
 * request made by an ADMIN must include the admin's own current login
 * password in the `x-confirm-password` header, verified against their
 * stored hash, before the request is allowed to reach its route handler.
 *
 * This sits centrally in server.ts, right after checkPermissions, so it
 * applies to every DELETE route in the app automatically — no per-module
 * changes needed, and no new DELETE route added later can accidentally
 * skip it. Only ADMIN is gated this way; other roles' (rare) DELETE
 * access is unaffected, since only ADMIN was ever meant to have this
 * "confirm with password" super-power in the first place.
 *
 * The frontend never needs per-page changes either: the shared axios
 * client (frontend/src/api/client.ts) catches the specific 403 this
 * throws, prompts for the password once via a shared modal, and retries
 * the same request with the header attached — so every existing and
 * future delete button in the app gets this automatically.
 */
export const requireDeleteConfirmation = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "DELETE" || req.user?.role !== "ADMIN") {
    next();
    return;
  }

  const password = req.headers["x-confirm-password"];
  if (typeof password !== "string" || password.length === 0) {
    res.status(403).json({
      status: "error",
      code: "PASSWORD_CONFIRMATION_REQUIRED",
      message: "This action permanently deletes data. Re-enter your password to confirm.",
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { passwordHash: true, isActive: true },
  });
  if (!user || !user.isActive) {
    throw ApiError.unauthorized("Account not found or inactive.");
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    res.status(403).json({
      status: "error",
      code: "PASSWORD_CONFIRMATION_INVALID",
      message: "Incorrect password. The delete was not performed.",
    });
    return;
  }

  next();
});
