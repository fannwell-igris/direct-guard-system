import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./tasks.service";
import { parseTaskCreate, parseTaskUpdate, parseListQuery } from "./tasks.validation";

function callerContext(req: Request): service.CallerContext {
  return {
    role: req.user!.role,
    departmentId: req.user!.departmentId,
  };
}

export const createTask = asyncHandler(async (req: Request, res: Response) => {
  const input = parseTaskCreate(req.body);
  const task = await service.createTask(input, req.user!.email);
  res.status(201).json({ status: "ok", data: task });
});

export const listTasks = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listTasks(query, callerContext(req));
  res.status(200).json({ status: "ok", ...result });
});

export const getTask = asyncHandler(async (req: Request, res: Response) => {
  const task = await service.getTaskById(req.params.id, callerContext(req));
  res.status(200).json({ status: "ok", data: task });
});

export const updateTask = asyncHandler(async (req: Request, res: Response) => {
  const input = parseTaskUpdate(req.body);
  const statusChangeNote = typeof req.body?.statusChangeNote === "string" ? req.body.statusChangeNote : undefined;
  const task = await service.updateTask(req.params.id, input, req.user!.email, statusChangeNote, callerContext(req));
  res.status(200).json({ status: "ok", data: task });
});
