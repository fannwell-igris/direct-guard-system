import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./statutory-rules.service";
import {
  parseStatutoryRuleCreate,
  parseStatutoryRuleUpdate,
  parseListQuery,
} from "./statutory-rules.validation";

export const createStatutoryRule = asyncHandler(async (req: Request, res: Response) => {
  const input = parseStatutoryRuleCreate(req.body);
  const rule = await service.createStatutoryRule(input);
  res.status(201).json({ status: "ok", data: rule });
});

export const listStatutoryRules = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const rules = await service.listStatutoryRules(query);
  res.status(200).json({ status: "ok", data: rules });
});

export const getStatutoryRule = asyncHandler(async (req: Request, res: Response) => {
  const rule = await service.getStatutoryRuleById(req.params.id);
  res.status(200).json({ status: "ok", data: rule });
});

export const updateStatutoryRule = asyncHandler(async (req: Request, res: Response) => {
  const input = parseStatutoryRuleUpdate(req.body);
  const rule = await service.updateStatutoryRule(req.params.id, input);
  res.status(200).json({ status: "ok", data: rule });
});
