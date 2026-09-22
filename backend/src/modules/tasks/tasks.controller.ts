import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./tasks.service";
import { parseTaskCreate, parseTaskUpdate, parseListQuery } from "./tasks.validation";

export const createTask = asyncHandler(async (req: Request, res: Response) => {
  const input = parseTaskCreate(req.body);
  const task = await service.createTask(input, req.user!.email);
  res.status(201).json({ status: "ok", data: task });
});

export const listTasks = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listTasks(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getTask = asyncHandler(async (req: Request, res: Response) => {
  const task = await service.getTaskById(req.params.id);
  res.status(200).json({ status: "ok", data: task });
});

export const updateTask = asyncHandler(async (req: Request, res: Response) => {
  const input = parseTaskUpdate(req.body);
  // statusChangeNote is deliberately read directly from the body, not
  // via parseTaskUpdate/TaskUpdateInput - it's not a Task field, it's a
  // note attached to the TaskStatusHistory row for this one status
  // change (e.g. the override case: "marked done on their behalf,
  // confirmed via phone"). Optional, only meaningful when status is
  // also being changed in this same request.
  const statusChangeNote = typeof req.body?.statusChangeNote === "string" ? req.body.statusChangeNote : undefined;
  const task = await service.updateTask(req.params.id, input, req.user!.email, statusChangeNote);
  res.status(200).json({ status: "ok", data: task });
});
