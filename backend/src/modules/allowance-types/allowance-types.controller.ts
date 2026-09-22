import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./allowance-types.service";
import {
  parseAllowanceTypeCreate,
  parseAllowanceTypeUpdate,
  parseListQuery,
} from "./allowance-types.validation";

export const createAllowanceType = asyncHandler(async (req: Request, res: Response) => {
  const input = parseAllowanceTypeCreate(req.body);
  const allowanceType = await service.createAllowanceType(input);
  res.status(201).json({ status: "ok", data: allowanceType });
});

export const listAllowanceTypes = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const allowanceTypes = await service.listAllowanceTypes(query);
  res.status(200).json({ status: "ok", data: allowanceTypes });
});

export const getAllowanceType = asyncHandler(async (req: Request, res: Response) => {
  const allowanceType = await service.getAllowanceTypeById(req.params.id);
  res.status(200).json({ status: "ok", data: allowanceType });
});

export const updateAllowanceType = asyncHandler(async (req: Request, res: Response) => {
  const input = parseAllowanceTypeUpdate(req.body);
  const allowanceType = await service.updateAllowanceType(req.params.id, input);
  res.status(200).json({ status: "ok", data: allowanceType });
});
