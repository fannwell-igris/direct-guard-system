import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as shiftTypesService from "./shift-types.service";
import {
  parseShiftTypeCreate,
  parseShiftTypeUpdate,
  parseListQuery,
} from "./shift-types.validation";

export const createShiftType = asyncHandler(async (req: Request, res: Response) => {
  const input = parseShiftTypeCreate(req.body);
  const shiftType = await shiftTypesService.createShiftType(input);
  res.status(201).json({ status: "ok", data: shiftType });
});

export const listShiftTypes = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const data = await shiftTypesService.listShiftTypes(query);
  res.status(200).json({ status: "ok", data });
});

export const getShiftType = asyncHandler(async (req: Request, res: Response) => {
  const shiftType = await shiftTypesService.getShiftTypeById(req.params.id);
  res.status(200).json({ status: "ok", data: shiftType });
});

export const updateShiftType = asyncHandler(async (req: Request, res: Response) => {
  const input = parseShiftTypeUpdate(req.body);
  const shiftType = await shiftTypesService.updateShiftType(req.params.id, input);
  res.status(200).json({ status: "ok", data: shiftType });
});
