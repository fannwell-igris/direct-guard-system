import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./inventory.service";
import {
  parseInventoryItemCreate,
  parseInventoryItemUpdate,
  parseItemListQuery,
  parseStockMovementCreate,
  parseTakeHomeInput,
} from "./inventory.validation";

export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const input = parseInventoryItemCreate(req.body);
  const item = await service.createInventoryItem(input);
  res.status(201).json({ status: "ok", data: item });
});

export const listItems = asyncHandler(async (req: Request, res: Response) => {
  const query = parseItemListQuery(req.query as Record<string, unknown>);
  const result = await service.listInventoryItems(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await service.getInventoryItemById(req.params.id);
  res.status(200).json({ status: "ok", data: item });
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const input = parseInventoryItemUpdate(req.body);
  const item = await service.updateInventoryItem(req.params.id, input);
  res.status(200).json({ status: "ok", data: item });
});

export const addMovement = asyncHandler(async (req: Request, res: Response) => {
  const input = parseStockMovementCreate(req.body);
  const movement = await service.addStockMovement(req.params.id, input);
  res.status(201).json({ status: "ok", data: movement });
});

export const listMovements = asyncHandler(async (req: Request, res: Response) => {
  const movements = await service.listStockMovements(req.params.id);
  res.status(200).json({ status: "ok", data: movements });
});

export const takeHome = asyncHandler(async (req: Request, res: Response) => {
  const input = parseTakeHomeInput(req.body);
  const log = await service.markTakenHome(req.params.id, input);
  res.status(200).json({ status: "ok", data: log });
});

export const returnItem = asyncHandler(async (req: Request, res: Response) => {
  const input = parseTakeHomeInput(req.body);
  const log = await service.markReturned(req.params.id, input);
  res.status(200).json({ status: "ok", data: log });
});

export const getTakeHomeLog = asyncHandler(async (req: Request, res: Response) => {
  const logs = await service.getTakeHomeLog(req.params.id);
  res.status(200).json({ status: "ok", data: logs });
});
