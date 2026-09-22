import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./roster.service";
import {
  parseRosterEntryCreate,
  parseRosterEntryUpdate,
  parseListQuery,
} from "./roster.validation";

export const createRosterEntry = asyncHandler(async (req: Request, res: Response) => {
  const input = parseRosterEntryCreate(req.body);
  const entry = await service.createRosterEntry(input);
  res.status(201).json({ status: "ok", data: entry });
});

export const listRosterEntries = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listRosterEntries(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getRosterEntry = asyncHandler(async (req: Request, res: Response) => {
  const entry = await service.getRosterEntryById(req.params.id);
  res.status(200).json({ status: "ok", data: entry });
});

export const updateRosterEntry = asyncHandler(async (req: Request, res: Response) => {
  const input = parseRosterEntryUpdate(req.body);
  const entry = await service.updateRosterEntry(req.params.id, input);
  res.status(200).json({ status: "ok", data: entry });
});
