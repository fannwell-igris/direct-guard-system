import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as prospectsService from "./prospects.service";
import {
  parseProspectCreate,
  parseProspectUpdate,
  parseStageChange,
  parseListQuery,
} from "./prospects.validation";

export const listAssignableUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await prospectsService.listAssignableUsers();
  res.status(200).json({ status: "ok", data: users });
});

export const createProspect = asyncHandler(async (req: Request, res: Response) => {
  const input = parseProspectCreate(req.body);
  const prospect = await prospectsService.createProspect(input, req.user!.userId);
  res.status(201).json({ status: "ok", data: prospect });
});

export const listProspects = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await prospectsService.listProspects(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getProspect = asyncHandler(async (req: Request, res: Response) => {
  const prospect = await prospectsService.getProspectById(req.params.id);
  res.status(200).json({ status: "ok", data: prospect });
});

export const updateProspect = asyncHandler(async (req: Request, res: Response) => {
  const input = parseProspectUpdate(req.body);
  const prospect = await prospectsService.updateProspect(req.params.id, input);
  res.status(200).json({ status: "ok", data: prospect });
});

export const changeProspectStage = asyncHandler(async (req: Request, res: Response) => {
  const input = parseStageChange(req.body);
  const prospect = await prospectsService.changeStage(req.params.id, input, req.user!.userId);
  res.status(200).json({ status: "ok", data: prospect });
});
