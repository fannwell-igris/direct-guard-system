import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import * as service from "./demo-reset.service";

// DELETE /api/demo-reset
//
// Wipes every transactional record while keeping master data (employees,
// clients, sites, users, departments, shift types, etc.) untouched.
//
// ADMIN only. Requires the standard password re-confirmation header
// (requireDeleteConfirmation middleware, same as every other ADMIN DELETE).
// Also requires an explicit confirm phrase in the body to prevent accidents.
//
// Body: { "confirm": "WIPE_ALL_DATA" }
//
// Added for tutorial / demo purposes — run after training so staff can
// start entering real October data from a clean database.
export const wipeAllData = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.role !== "ADMIN") {
    throw ApiError.forbidden("Only an Admin can run a full data reset.");
  }

  if (req.body?.confirm !== "WIPE_ALL_DATA") {
    throw ApiError.badRequest(
      'Missing confirmation. Send { "confirm": "WIPE_ALL_DATA" } in the request body to proceed.'
    );
  }

  const result = await service.wipeAllTransactionalData();

  res.status(200).json({
    status: "ok",
    message: `Demo reset complete. ${result.total} records deleted.`,
    data: result,
  });
});
