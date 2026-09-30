import { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as service from "./roster.service";
import {
  parseRosterEntryCreate,
  parseRosterEntryUpdate,
  parseListQuery,
  parseBulkCreate,
  parseBulkCancel,
  parseRecordRelief,
} from "./roster.validation";

export const createRosterEntry = asyncHandler(async (req: Request, res: Response) => {
  const input = parseRosterEntryCreate(req.body);
  const entry = await service.createRosterEntry(input);
  res.status(201).json({ status: "ok", data: entry });
});

/**
 * POST /api/roster/bulk
 *
 * Body: { employeeId, siteId, shiftTypeId, startDate, endDate, notes? }
 *
 * Creates one RosterEntry per calendar day in the range.
 * Returns { created: [...], skipped: [{date, reason}] } — days where an
 * entry already existed are reported as skipped rather than failing the
 * whole batch.
 */
export const bulkCreateRosterEntries = asyncHandler(async (req: Request, res: Response) => {
  const input = parseBulkCreate(req.body);
  const result = await service.bulkCreateRosterEntries(input);
  res.status(201).json({ status: "ok", data: result });
});

/**
 * POST /api/roster/bulk-cancel
 *
 * Body: { ids: string[] }
 *
 * Cancels all SCHEDULED entries whose id is in the list. Entries that are
 * already CANCELLED are silently skipped. Returns { cancelledCount: number }.
 */
export const bulkCancelRosterEntries = asyncHandler(async (req: Request, res: Response) => {
  const input = parseBulkCancel(req.body);
  const result = await service.bulkCancelRosterEntries(input);
  res.status(200).json({ status: "ok", data: result });
});

/**
 * POST /api/roster/:id/relief
 *
 * Body: { reliefEmployeeId: string, notes?: string }
 *
 * Records that the originally scheduled officer didn't show and a relief
 * officer was sent instead.  In a single transaction:
 *   1. The roster entry is set to CANCELLED (original officer didn't work).
 *   2. An AttendanceRecord with status=REPLACEMENT is created for the
 *      relief officer, with replacementForEmployeeId pointing at the
 *      original scheduled employee.
 *
 * Returns { cancelledEntry, reliefAttendance, coveredFor }.
 */
export const recordRelief = asyncHandler(async (req: Request, res: Response) => {
  const input = parseRecordRelief(req.body);
  const result = await service.recordRelief(req.params.id, input);
  res.status(201).json({ status: "ok", data: result });
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
