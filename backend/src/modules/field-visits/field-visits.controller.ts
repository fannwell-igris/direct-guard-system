import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import * as service from "./field-visits.service";
import { parseVisitCreate, parseVisitUpdate, parseListQuery } from "./field-visits.validation";

export const createVisit = asyncHandler(async (req: Request, res: Response) => {
  const input = parseVisitCreate(req.body);
  const visit = await service.createVisit(input, req.user!.userId);
  res.status(201).json({ status: "ok", data: visit });
});

export const listVisits = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listVisits(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getVisit = asyncHandler(async (req: Request, res: Response) => {
  const visit = await service.getVisitById(req.params.id);
  res.status(200).json({ status: "ok", data: visit });
});

export const updateVisit = asyncHandler(async (req: Request, res: Response) => {
  const input = parseVisitUpdate(req.body);
  const visit = await service.updateVisit(req.params.id, input);
  res.status(200).json({ status: "ok", data: visit });
});

export const deleteVisit = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteVisit(req.params.id);
  res.status(200).json({ status: "ok", message: "Field visit deleted." });
});

// ---- Attachment endpoints ----

export const uploadAttachment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest("No file received. Send a multipart/form-data request with field name \"file\".");
  }
  const visit = await service.saveAttachment(req.params.id, req.file.filename);
  res.status(200).json({ status: "ok", data: visit });
});

export const serveAttachment = asyncHandler(async (req: Request, res: Response) => {
  const filePath = await service.getAttachmentPath(req.params.id);
  res.sendFile(filePath);
});

export const deleteAttachment = asyncHandler(async (req: Request, res: Response) => {
  const visit = await service.removeAttachment(req.params.id);
  res.status(200).json({ status: "ok", data: visit });
});
