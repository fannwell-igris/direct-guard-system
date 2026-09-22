import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./site-requirements.service";
import {
  parseSiteRequirementCreate,
  parseSiteRequirementUpdate,
  parseListQuery,
} from "./site-requirements.validation";

export const createSiteRequirement = asyncHandler(async (req: Request, res: Response) => {
  const input = parseSiteRequirementCreate(req.body);
  const requirement = await service.createSiteRequirement(input);
  res.status(201).json({ status: "ok", data: requirement });
});

export const listSiteRequirements = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listSiteRequirements(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getSiteRequirement = asyncHandler(async (req: Request, res: Response) => {
  const requirement = await service.getSiteRequirementById(req.params.id);
  res.status(200).json({ status: "ok", data: requirement });
});

export const updateSiteRequirement = asyncHandler(async (req: Request, res: Response) => {
  const input = parseSiteRequirementUpdate(req.body);
  const requirement = await service.updateSiteRequirement(req.params.id, input);
  res.status(200).json({ status: "ok", data: requirement });
});
