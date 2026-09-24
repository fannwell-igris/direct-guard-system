import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./marketing-activities.service";
import { parseActivityCreate, parseActivityUpdate, parseListQuery } from "./marketing-activities.validation";

export const createActivity = asyncHandler(async (req: Request, res: Response) => {
  const input = parseActivityCreate(req.body);
  const activity = await service.createActivity(input, req.user!.userId);
  res.status(201).json({ status: "ok", data: activity });
});

export const listActivities = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listActivities(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getActivity = asyncHandler(async (req: Request, res: Response) => {
  const activity = await service.getActivityById(req.params.id);
  res.status(200).json({ status: "ok", data: activity });
});

export const updateActivity = asyncHandler(async (req: Request, res: Response) => {
  const input = parseActivityUpdate(req.body);
  const activity = await service.updateActivity(req.params.id, input);
  res.status(200).json({ status: "ok", data: activity });
});

export const deleteActivity = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteActivity(req.params.id);
  res.status(200).json({ status: "ok", message: "Activity deleted." });
});
