import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./employee-contracts.service";
import {
  parseEmployeeContractCreate,
  parseEmployeeContractUpdate,
  parseListQuery,
} from "./employee-contracts.validation";

export const createEmployeeContract = asyncHandler(async (req: Request, res: Response) => {
  const input = parseEmployeeContractCreate(req.body);
  const contract = await service.createEmployeeContract(input);
  res.status(201).json({ status: "ok", data: contract });
});

export const listEmployeeContracts = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listEmployeeContracts(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getEmployeeContract = asyncHandler(async (req: Request, res: Response) => {
  const contract = await service.getEmployeeContractById(req.params.id);
  res.status(200).json({ status: "ok", data: contract });
});

export const updateEmployeeContract = asyncHandler(async (req: Request, res: Response) => {
  const input = parseEmployeeContractUpdate(req.body);
  const contract = await service.updateEmployeeContract(req.params.id, input);
  res.status(200).json({ status: "ok", data: contract });
});

export const refreshStatuses = asyncHandler(async (_req: Request, res: Response) => {
  const result = await service.refreshAllStatuses();
  res.status(200).json({ status: "ok", data: result });
});
