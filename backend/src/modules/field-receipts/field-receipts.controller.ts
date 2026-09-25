import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import * as service from "./field-receipts.service";
import {
  parseFieldReceiptCreate,
  parseFieldReceiptReconcile,
  parseFieldReceiptListQuery,
} from "./field-receipts.validation";

export const createFieldReceipt = asyncHandler(async (req: Request, res: Response) => {
  const input = parseFieldReceiptCreate(req.body);
  const result = await service.createFieldReceipt(input);
  res.status(201).json({ status: "ok", data: result });
});

export const listFieldReceipts = asyncHandler(async (req: Request, res: Response) => {
  const query = parseFieldReceiptListQuery(req.query as Record<string, unknown>);
  const result = await service.listFieldReceipts(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getFieldReceipt = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getFieldReceiptById(req.params.id);
  res.status(200).json({ status: "ok", data: result });
});

// The route-level permission registry (permissions.ts) matches on
// prefix+method only, so it can't tell this POST /:id/reconcile apart
// from the plain POST / (create) above — both are "POST /api/field-receipts...".
// Operations needs the create route but must NOT get this one, so the
// role check happens here instead.
const RECONCILE_ROLES = ["ADMIN", "PAYROLL"];

export const reconcileFieldReceipt = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !RECONCILE_ROLES.includes(req.user.role)) {
    throw ApiError.forbidden("Only Admin or Finance can reconcile a field receipt entry.");
  }
  const input = parseFieldReceiptReconcile(req.body);
  const result = await service.reconcileFieldReceipt(req.params.id, input);
  res.status(200).json({ status: "ok", data: result });
});
