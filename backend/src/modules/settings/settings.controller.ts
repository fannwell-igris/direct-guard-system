import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import * as service from "./settings.service";

// GET /api/settings — all sections
export const getAllSettings = asyncHandler(async (_req: Request, res: Response) => {
  const data = await service.getAllSections();
  res.status(200).json({ status: "ok", data });
});

// GET /api/settings/:section — one section
export const getSection = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getSection(req.params.section);
  res.status(200).json({ status: "ok", data });
});

// PUT /api/settings/:section — update one section (partial update — only sent keys change)
export const updateSection = asyncHandler(async (req: Request, res: Response) => {
  if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
    throw ApiError.badRequest("Request body must be a JSON object.");
  }
  const updatedBy = typeof req.body._updatedBy === "string" ? req.body._updatedBy : undefined;
  const { _updatedBy, ...value } = req.body;

  if (Object.keys(value).length === 0) {
    throw ApiError.badRequest("Request body must include at least one setting to update.");
  }

  const data = await service.updateSection(req.params.section, value, updatedBy);
  res.status(200).json({ status: "ok", data });
});

// POST /api/settings/:section/reset — restore section to defaults
export const resetSection = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.resetSection(req.params.section);
  res.status(200).json({ status: "ok", data });
});
