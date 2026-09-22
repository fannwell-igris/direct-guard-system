import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./client-contracts.service";
import {
  parseClientContractCreate,
  parseClientContractUpdate,
  parseListQuery,
} from "./client-contracts.validation";

export const createClientContract = asyncHandler(async (req: Request, res: Response) => {
  const input = parseClientContractCreate(req.body);
  const contract = await service.createClientContract(input);
  res.status(201).json({ status: "ok", data: contract });
});

export const listClientContracts = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listClientContracts(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getClientContract = asyncHandler(async (req: Request, res: Response) => {
  const contract = await service.getClientContractById(req.params.id);
  res.status(200).json({ status: "ok", data: contract });
});

export const updateClientContract = asyncHandler(async (req: Request, res: Response) => {
  const input = parseClientContractUpdate(req.body);
  const contract = await service.updateClientContract(req.params.id, input);
  res.status(200).json({ status: "ok", data: contract });
});

// Manual trigger to recalculate status on every contract from today's date.
// Temporary until a scheduled job runner exists - see service comments.
export const refreshStatuses = asyncHandler(async (_req: Request, res: Response) => {
  const result = await service.refreshAllStatuses();
  res.status(200).json({ status: "ok", data: result });
});
