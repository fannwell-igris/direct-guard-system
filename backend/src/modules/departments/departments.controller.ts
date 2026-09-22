import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./departments.service";
import { parseDepartmentCreate, parseDepartmentUpdate, parseListQuery } from "./departments.validation";

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const input = parseDepartmentCreate(req.body);
  const dept = await service.createDepartment(input);
  res.status(201).json({ status: "ok", data: dept });
});

export const listDepartments = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listDepartments(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getDepartment = asyncHandler(async (req: Request, res: Response) => {
  const dept = await service.getDepartmentById(req.params.id);
  res.status(200).json({ status: "ok", data: dept });
});

export const updateDepartment = asyncHandler(async (req: Request, res: Response) => {
  const input = parseDepartmentUpdate(req.body);
  const dept = await service.updateDepartment(req.params.id, input);
  res.status(200).json({ status: "ok", data: dept });
});
