import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./operations.service";
import {
  parseOperationsRecordCreate,
  parseOperationsRecordUpdate,
  parseOperationsReview,
  parseListQuery,
  parseCoverageSummaryQuery,
  parseAttendanceRecordCreate,
  parseAttendanceCalendarQuery,
} from "./operations.validation";

export const createOperationsRecord = asyncHandler(async (req: Request, res: Response) => {
  const input = parseOperationsRecordCreate(req.body);
  const record = await service.createOperationsRecord(input);
  res.status(201).json({ status: "ok", data: record });
});

export const listOperationsRecords = asyncHandler(async (req: Request, res: Response) => {
  const query = parseListQuery(req.query as Record<string, unknown>);
  const result = await service.listOperationsRecords(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getOperationsRecord = asyncHandler(async (req: Request, res: Response) => {
  const record = await service.getOperationsRecordById(req.params.id);
  res.status(200).json({ status: "ok", data: record });
});

export const updateOperationsRecord = asyncHandler(async (req: Request, res: Response) => {
  const input = parseOperationsRecordUpdate(req.body);
  const record = await service.updateOperationsRecord(req.params.id, input);
  res.status(200).json({ status: "ok", data: record });
});

export const reviewOperationsRecord = asyncHandler(async (req: Request, res: Response) => {
  const input = parseOperationsReview(req.body);
  const record = await service.reviewOperationsRecord(req.params.id, input);
  res.status(200).json({ status: "ok", data: record });
});

export const getCoverageSummary = asyncHandler(async (req: Request, res: Response) => {
  const query = parseCoverageSummaryQuery(req.query as Record<string, unknown>);
  const result = await service.getCoverageSummary(query);
  res.status(200).json({ status: "ok", ...result });
});

export const createAttendanceRecord = asyncHandler(async (req: Request, res: Response) => {
  const input = parseAttendanceRecordCreate(req.body);
  const record = await service.createAttendanceRecord(req.params.id, input);
  res.status(201).json({ status: "ok", data: record });
});

export const listAttendanceRecords = asyncHandler(async (req: Request, res: Response) => {
  const records = await service.listAttendanceRecords(req.params.id);
  res.status(200).json({ status: "ok", data: records });
});

export const getAttendanceCalendar = asyncHandler(async (req: Request, res: Response) => {
  const query = parseAttendanceCalendarQuery(req.query as Record<string, unknown>);
  const result = await service.getAttendanceCalendar(query);
  res.status(200).json({ status: "ok", data: result });
});
