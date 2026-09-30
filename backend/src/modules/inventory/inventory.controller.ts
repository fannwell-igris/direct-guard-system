import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import * as service from "./inventory.service";
import {
  parseItemCreate,
  parseItemUpdate,
  parseMovement,
  parseListQuery,
} from "./inventory.validation";

// ── Items ────────────────────────────────────────────────────────────────────

export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const input = parseItemCreate(req.body);
  const item  = await service.createItem(input);
  res.status(201).json({ status: "ok", data: item });
});

export const listItems = asyncHandler(async (req: Request, res: Response) => {
  const query  = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listItems(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await service.getItemById(req.params.id);
  res.status(200).json({ status: "ok", data: item });
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const input = parseItemUpdate(req.body);
  const item  = await service.updateItem(req.params.id, input);
  res.status(200).json({ status: "ok", data: item });
});

export const setItemStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status?: string };
  if (!status || !["ACTIVE", "INACTIVE", "ARCHIVED"].includes(status)) {
    throw ApiError.badRequest("`status` must be one of: ACTIVE, INACTIVE, ARCHIVED.");
  }
  const item = await service.setItemStatus(
    req.params.id,
    status as "ACTIVE" | "INACTIVE" | "ARCHIVED",
  );
  res.status(200).json({ status: "ok", data: item });
});

// ── Asset Collection Confirmation ────────────────────────────────────────────

/**
 * POST /api/inventory/:id/confirm-collection
 * Marks a PENDING_COLLECTION item as COLLECTED — called by ADMIN/MANAGER
 * when they physically retrieve the asset from a terminated employee.
 * Body: { confirmedBy: string }
 */
export const confirmCollection = asyncHandler(async (req: Request, res: Response) => {
  const { confirmedBy } = req.body as { confirmedBy?: string };
  if (!confirmedBy || !String(confirmedBy).trim()) {
    throw ApiError.badRequest(
      "`confirmedBy` is required — enter the name of the staff member who collected the item.",
    );
  }
  const { confirmAssetCollection } = await import("../employees/employees.service");
  const item = await confirmAssetCollection(req.params.id, String(confirmedBy).trim());
  res.status(200).json({ status: "ok", data: item });
});

// ── Stock Movements ──────────────────────────────────────────────────────────

export const listMovements = asyncHandler(async (req: Request, res: Response) => {
  const movements = await service.listMovements(req.params.id);
  res.status(200).json({ status: "ok", data: movements });
});

export const logMovement = asyncHandler(async (req: Request, res: Response) => {
  const input = parseMovement(req.body);
  // Pass caller role so service can restrict Operations to ISSUE only
  const callerRole = req.user?.role ?? "STAFF";
  const movement = await service.logMovement(req.params.id, input, callerRole);
  res.status(201).json({ status: "ok", data: movement });
});
