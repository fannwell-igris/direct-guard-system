import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./weekly-plans.service";
import {
  parseWeeklyPlanCreate,
  parseWeeklyPlanUpdate,
  parseWeeklyPlanItemStatus,
  parseWeeklyPlanListQuery,
} from "./weekly-plans.validation";

export const createWeeklyPlan = asyncHandler(async (req: Request, res: Response) => {
  const input = parseWeeklyPlanCreate(req.body);
  const plan = await service.createWeeklyPlan(input);
  res.status(201).json({ status: "ok", data: plan });
});

export const listWeeklyPlans = asyncHandler(async (req: Request, res: Response) => {
  const query = parseWeeklyPlanListQuery(req.query as Record<string, unknown>);
  const result = await service.listWeeklyPlans(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getWeeklyPlan = asyncHandler(async (req: Request, res: Response) => {
  const plan = await service.getWeeklyPlanById(req.params.id);
  res.status(200).json({ status: "ok", data: plan });
});

export const updateWeeklyPlan = asyncHandler(async (req: Request, res: Response) => {
  const input = parseWeeklyPlanUpdate(req.body);
  const plan = await service.updateWeeklyPlan(req.params.id, input);
  res.status(200).json({ status: "ok", data: plan });
});

export const setItemStatus = asyncHandler(async (req: Request, res: Response) => {
  const input = parseWeeklyPlanItemStatus(req.body);
  const plan = await service.setWeeklyPlanItemStatus(req.params.id, req.params.itemId, input);
  res.status(200).json({ status: "ok", data: plan });
});

export const deleteWeeklyPlan = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteWeeklyPlan(req.params.id);
  res.status(200).json({ status: "ok", message: "Weekly plan deleted." });
});
