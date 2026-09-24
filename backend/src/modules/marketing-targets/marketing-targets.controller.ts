import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./marketing-targets.service";
import { parseTargetCreate, parseTargetUpdate, parseListQuery } from "./marketing-targets.validation";

export const createTarget = asyncHandler(async (req: Request, res: Response) => {
  const input = parseTargetCreate(req.body);
  const target = await service.createTarget(input);
  res.status(201).json({ status: "ok", data: target });
});

export const listTargets = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listTargets(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getTarget = asyncHandler(async (req: Request, res: Response) => {
  const target = await service.getTargetById(req.params.id);
  res.status(200).json({ status: "ok", data: target });
});

export const updateTarget = asyncHandler(async (req: Request, res: Response) => {
  const input = parseTargetUpdate(req.body);
  const target = await service.updateTarget(req.params.id, input);
  res.status(200).json({ status: "ok", data: target });
});

export const deleteTarget = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteTarget(req.params.id);
  res.status(200).json({ status: "ok", message: "Target deleted." });
});
