import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as sitesService from "./sites.service";
import {
  parseSiteCreate,
  parseSiteUpdate,
  parseStatusUpdate,
  parseListQuery,
} from "./sites.validation";

export const createSite = asyncHandler(async (req: Request, res: Response) => {
  const input = parseSiteCreate(req.body);
  const site = await sitesService.createSite(input);
  res.status(201).json({ status: "ok", data: site });
});

export const listSites = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await sitesService.listSites(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getSite = asyncHandler(async (req: Request, res: Response) => {
  const site = await sitesService.getSiteById(req.params.id);
  res.status(200).json({ status: "ok", data: site });
});

export const updateSite = asyncHandler(async (req: Request, res: Response) => {
  const input = parseSiteUpdate(req.body);
  const site = await sitesService.updateSite(req.params.id, input);
  res.status(200).json({ status: "ok", data: site });
});

export const updateSiteStatus = asyncHandler(async (req: Request, res: Response) => {
  const status = parseStatusUpdate(req.body);
  const site = await sitesService.setSiteStatus(req.params.id, status);
  res.status(200).json({ status: "ok", data: site });
});
