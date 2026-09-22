import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as clientsService from "./clients.service";
import {
  parseClientCreate,
  parseClientUpdate,
  parseStatusUpdate,
  parseListQuery,
} from "./clients.validation";

export const createClient = asyncHandler(async (req: Request, res: Response) => {
  const input = parseClientCreate(req.body);
  const client = await clientsService.createClient(input);
  res.status(201).json({ status: "ok", data: client });
});

export const listClients = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await clientsService.listClients(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getClient = asyncHandler(async (req: Request, res: Response) => {
  const client = await clientsService.getClientById(req.params.id);
  res.status(200).json({ status: "ok", data: client });
});

export const updateClient = asyncHandler(async (req: Request, res: Response) => {
  const input = parseClientUpdate(req.body);
  const client = await clientsService.updateClient(req.params.id, input);
  res.status(200).json({ status: "ok", data: client });
});

export const updateClientStatus = asyncHandler(async (req: Request, res: Response) => {
  const status = parseStatusUpdate(req.body);
  const client = await clientsService.setClientStatus(req.params.id, status);
  res.status(200).json({ status: "ok", data: client });
});
