import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./users.service";
import { parseUserCreate, parseUserUpdate, parsePasswordChange } from "./users.validation";

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const input = parseUserCreate(req.body);
  const user = await service.createUser(input);
  res.status(201).json({ status: "ok", data: user });
});

export const listUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await service.listUsers();
  res.status(200).json({ status: "ok", data: users });
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await service.getUserById(req.params.id);
  res.status(200).json({ status: "ok", data: user });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const input = parseUserUpdate(req.body);
  const user = await service.updateUser(req.params.id, input);
  res.status(200).json({ status: "ok", data: user });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const input = parsePasswordChange(req.body);
  const result = await service.changePassword(req.params.id, input);
  res.status(200).json({ status: "ok", data: result });
});
