import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./department-requests.service";
import {
  parseDepartmentRequestCreate,
  parseDepartmentRequestUpdate,
  parseListQuery,
} from "./department-requests.validation";

export const createDepartmentRequest = asyncHandler(async (req: Request, res: Response) => {
  const input = parseDepartmentRequestCreate(req.body);
  const result = await service.createDepartmentRequest(input);
  res.status(201).json({ status: "ok", data: result });
});

export const listDepartmentRequests = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listDepartmentRequests(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getDepartmentRequest = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getDepartmentRequestById(req.params.id);
  res.status(200).json({ status: "ok", data: result });
});

export const updateDepartmentRequest = asyncHandler(async (req: Request, res: Response) => {
  const input = parseDepartmentRequestUpdate(req.body);
  const result = await service.updateDepartmentRequest(req.params.id, input);
  res.status(200).json({ status: "ok", data: result });
});
