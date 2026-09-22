import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";

/**
 * Thrown deliberately from controllers/services for expected error cases
 * (validation failures, not-found, conflicts). Anything else that throws
 * is treated as an unexpected 500.
 */
export class ApiError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, details);
  }

  static notFound(message: string) {
    return new ApiError(404, message);
  }

  static conflict(message: string, details?: unknown) {
    return new ApiError(409, message, details);
  }

  static unauthorized(message: string) {
    return new ApiError(401, message);
  }

  static forbidden(message: string) {
    return new ApiError(403, message);
  }
}

/**
 * Wraps an async route handler so thrown/rejected errors are forwarded to
 * Express's error middleware instead of crashing the process or hanging
 * the request.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      status: "error",
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Prisma-specific known error codes -> sensible HTTP responses.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation
    if (err.code === "P2002") {
      return res.status(409).json({
        status: "error",
        message: `A record with that ${(err.meta?.target as string[] | undefined)?.join(", ") ?? "value"} already exists.`,
      });
    }
    // Foreign key / restrict violation (e.g. trying to remove a client that has history)
    if (err.code === "P2003" || err.code === "P2014") {
      return res.status(409).json({
        status: "error",
        message: "This record can't be modified because related records depend on it.",
      });
    }
    // Record to update/delete not found
    if (err.code === "P2025") {
      return res.status(404).json({
        status: "error",
        message: "Record not found.",
      });
    }
  }

  console.error("Unexpected error:", err);
  return res.status(500).json({
    status: "error",
    message: "Internal server error.",
  });
}
