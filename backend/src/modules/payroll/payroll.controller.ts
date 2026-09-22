import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import * as service from "./payroll.service";
import {
  parseShiftPayPreviewQuery,
  parsePayrollRunCreate,
  parsePayrollRunListQuery,
  parseLineItemUpdate,
  parseAllowanceCreate,
  parseDeductionCreate,
  parseStatusAction,
  parseApplyStatutoryDeductions,
} from "./payroll.validation";

export const getShiftPayPreview = asyncHandler(async (req: Request, res: Response) => {
  const query = parseShiftPayPreviewQuery(req.query as Record<string, unknown>);
  const preview = await service.getShiftPayPreview(query);
  res.status(200).json({ status: "ok", data: preview });
});

export const createPayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const input = parsePayrollRunCreate(req.body);
  const run = await service.createPayrollRun(input);
  res.status(201).json({ status: "ok", data: run });
});

export const listPayrollRuns = asyncHandler(async (req: Request, res: Response) => {
  const query = parsePayrollRunListQuery(req.query as Record<string, unknown>);
  const data = await service.listPayrollRuns(query);
  res.status(200).json({ status: "ok", data });
});

export const getPayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const run = await service.getPayrollRunById(req.params.id);
  res.status(200).json({ status: "ok", data: run });
});

export const updateLineItem = asyncHandler(async (req: Request, res: Response) => {
  const input = parseLineItemUpdate(req.body);
  const item = await service.updateLineItem(req.params.id, req.params.lineItemId, input);
  res.status(200).json({ status: "ok", data: item });
});

export const addAllowance = asyncHandler(async (req: Request, res: Response) => {
  const input = parseAllowanceCreate(req.body);
  const item = await service.addAllowance(req.params.id, req.params.lineItemId, input);
  res.status(201).json({ status: "ok", data: item });
});

export const removeAllowance = asyncHandler(async (req: Request, res: Response) => {
  const item = await service.removeAllowance(req.params.id, req.params.lineItemId, req.params.allowanceId);
  res.status(200).json({ status: "ok", data: item });
});

export const addDeduction = asyncHandler(async (req: Request, res: Response) => {
  const input = parseDeductionCreate(req.body);
  const item = await service.addDeduction(req.params.id, req.params.lineItemId, input);
  res.status(201).json({ status: "ok", data: item });
});

export const removeDeduction = asyncHandler(async (req: Request, res: Response) => {
  const item = await service.removeDeduction(req.params.id, req.params.lineItemId, req.params.deductionId);
  res.status(200).json({ status: "ok", data: item });
});

export const reviewPayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const input = parseStatusAction(req.body);
  const run = await service.reviewPayrollRun(req.params.id, input);
  res.status(200).json({ status: "ok", data: run });
});

export const finalizePayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const input = parseStatusAction(req.body);
  const run = await service.finalizePayrollRun(req.params.id, input);
  res.status(200).json({ status: "ok", data: run });
});

export const markPayrollRunPaid = asyncHandler(async (req: Request, res: Response) => {
  const input = parseStatusAction(req.body);
  const run = await service.markPayrollRunPaid(req.params.id, input);
  res.status(200).json({ status: "ok", data: run });
});

export const applyStatutoryDeductions = asyncHandler(async (req: Request, res: Response) => {
  const input = parseApplyStatutoryDeductions(req.body);
  const run = await service.applyStatutoryDeductions(req.params.id, input);
  res.status(200).json({ status: "ok", data: run });
});

// ---- Payslips ----

export const generatePayslipsHandler = asyncHandler(async (req: Request, res: Response) => {
  const generatedBy = typeof req.body?.generatedBy === "string" ? req.body.generatedBy.trim() || null : null;
  const result = await service.generatePayslips(req.params.id, generatedBy);
  res.status(200).json({ status: "ok", data: result });
});

export const listPayslipsHandler = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const page = q.page ? Math.max(1, parseInt(q.page)) : 1;
  const pageSize = q.pageSize ? Math.min(100, Math.max(1, parseInt(q.pageSize))) : 20;
  const result = await service.listPayslips({
    runId: q.runId,
    employeeId: q.employeeId,
    page,
    pageSize,
  });
  res.status(200).json({ status: "ok", ...result });
});

export const getPayslipHandler = asyncHandler(async (req: Request, res: Response) => {
  const payslip = await service.getPayslip(req.params.payslipId);
  res.status(200).json({ status: "ok", data: payslip });
});

// ---- Validation ----

export const validatePayrollRunHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.validatePayrollRun(req.params.id);
  res.status(200).json({ status: "ok", data: result });
});

export const comparePayrollRunsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { previousRunId } = req.query as { previousRunId?: string };
  if (!previousRunId || !previousRunId.trim()) {
    throw ApiError.badRequest("`previousRunId` query parameter is required.");
  }
  const result = await service.comparePayrollRuns(req.params.id, previousRunId.trim());
  res.status(200).json({ status: "ok", data: result });
});
