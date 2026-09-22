import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./operational-costs.service";
import {
  parseOperationalCostCreate,
  parseOperationalCostUpdate,
  parseListQuery,
} from "./operational-costs.validation";

export const createOperationalCost = asyncHandler(async (req: Request, res: Response) => {
  const input = parseOperationalCostCreate(req.body);
  const cost = await service.createOperationalCost(input);
  res.status(201).json({ status: "ok", data: cost });
});

export const listOperationalCosts = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listOperationalCosts(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getOperationalCost = asyncHandler(async (req: Request, res: Response) => {
  const cost = await service.getOperationalCostById(req.params.id);
  res.status(200).json({ status: "ok", data: cost });
});

export const updateOperationalCost = asyncHandler(async (req: Request, res: Response) => {
  const input = parseOperationalCostUpdate(req.body);
  const cost = await service.updateOperationalCost(req.params.id, input);
  res.status(200).json({ status: "ok", data: cost });
});
