import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./deduction-types.service";
import {
  parseDeductionTypeCreate,
  parseDeductionTypeUpdate,
  parseListQuery,
} from "./deduction-types.validation";

export const createDeductionType = asyncHandler(async (req: Request, res: Response) => {
  const input = parseDeductionTypeCreate(req.body);
  const deductionType = await service.createDeductionType(input);
  res.status(201).json({ status: "ok", data: deductionType });
});

export const listDeductionTypes = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const deductionTypes = await service.listDeductionTypes(query);
  res.status(200).json({ status: "ok", data: deductionTypes });
});

export const getDeductionType = asyncHandler(async (req: Request, res: Response) => {
  const deductionType = await service.getDeductionTypeById(req.params.id);
  res.status(200).json({ status: "ok", data: deductionType });
});

export const updateDeductionType = asyncHandler(async (req: Request, res: Response) => {
  const input = parseDeductionTypeUpdate(req.body);
  const deductionType = await service.updateDeductionType(req.params.id, input);
  res.status(200).json({ status: "ok", data: deductionType });
});
