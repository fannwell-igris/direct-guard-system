import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import * as service from "./department-budgets.service";
import {
  parseBudgetCreate,
  parseBudgetUpdate,
  parseBudgetReview,
  parseBudgetListQuery,
  parseBudgetSummaryQuery,
  parseBudgetCompareQuery,
} from "./department-budgets.validation";

// Roles with company-wide visibility/authority over every department's
// budget — Finance (this system's PAYROLL role) and Management. Everyone
// else can only ever touch their OWN department's budgets ("Departments
// should only manage their own budgets" / "Other departments should not
// automatically be able to edit or view another department's internal
// budget" — Section 8 of the brief). permissions.ts's coarse prefix+method
// registry can't express that row-level distinction, so it's enforced
// here instead, same pattern already used for field-receipts reconcile.
const FINANCE_MANAGEMENT_ROLES = ["ADMIN", "MANAGER", "PAYROLL"];

function isFinanceOrManagement(req: Request): boolean {
  return !!req.user && FINANCE_MANAGEMENT_ROLES.includes(req.user.role);
}

/** For a non-Finance/Management user, their own departmentId — throws if they have none. */
function ownDepartmentIdOrThrow(req: Request): string {
  if (!req.user?.departmentId) {
    throw ApiError.forbidden("Your account has no department assigned, so it has no budgets to manage.");
  }
  return req.user.departmentId;
}

export const createBudget = asyncHandler(async (req: Request, res: Response) => {
  const input = parseBudgetCreate(req.body);

  // A department user can only ever create a budget for their OWN
  // department — silently override rather than trust the body, so no
  // role can impersonate another department by editing the request.
  if (!isFinanceOrManagement(req)) {
    input.departmentId = ownDepartmentIdOrThrow(req);
  }

  const result = await service.createBudget(input);
  res.status(201).json({ status: "ok", data: result });
});

export const listBudgets = asyncHandler(async (req: Request, res: Response) => {
  const query = parseBudgetListQuery(req.query as Record<string, unknown>);

  if (!isFinanceOrManagement(req)) {
    query.departmentId = ownDepartmentIdOrThrow(req);
  }

  const result = await service.listBudgets(query);
  res.status(200).json({ status: "ok", ...result });
});

export const getBudget = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.getBudgetById(req.params.id);
  if (!isFinanceOrManagement(req) && result.departmentId !== req.user?.departmentId) {
    throw ApiError.forbidden("You can only view your own department's budgets.");
  }
  res.status(200).json({ status: "ok", data: result });
});

export const updateBudget = asyncHandler(async (req: Request, res: Response) => {
  if (!isFinanceOrManagement(req)) {
    const existing = await service.getBudgetById(req.params.id);
    if (existing.departmentId !== req.user?.departmentId) {
      throw ApiError.forbidden("You can only edit your own department's budgets.");
    }
  }
  const input = parseBudgetUpdate(req.body);
  const result = await service.updateBudget(req.params.id, input);
  res.status(200).json({ status: "ok", data: result });
});

export const submitBudget = asyncHandler(async (req: Request, res: Response) => {
  if (!isFinanceOrManagement(req)) {
    const existing = await service.getBudgetById(req.params.id);
    if (existing.departmentId !== req.user?.departmentId) {
      throw ApiError.forbidden("You can only submit your own department's budgets.");
    }
  }
  const result = await service.submitBudget(req.params.id, req.user?.email ?? null);
  res.status(200).json({ status: "ok", data: result });
});

// Sub-route under the same prefix+method as the department-facing routes
// above (POST/PATCH /api/department-budgets/...) — permissions.ts can't
// tell this apart from submit/copy-forward by prefix alone, so the role
// check happens here, same reasoning as field-receipts' reconcile route.
export const reviewBudget = asyncHandler(async (req: Request, res: Response) => {
  if (!isFinanceOrManagement(req)) {
    throw ApiError.forbidden("Only Finance or Management can review a department budget.");
  }
  const input = parseBudgetReview(req.body);
  const result = await service.reviewBudget(req.params.id, input, req.user?.email ?? null);
  res.status(200).json({ status: "ok", data: result });
});

export const copyForwardBudget = asyncHandler(async (req: Request, res: Response) => {
  if (!isFinanceOrManagement(req)) {
    const existing = await service.getBudgetById(req.params.id);
    if (existing.departmentId !== req.user?.departmentId) {
      throw ApiError.forbidden("You can only copy forward your own department's budgets.");
    }
  }
  const result = await service.copyForwardBudget(req.params.id);
  res.status(201).json({ status: "ok", data: result });
});

// Finance dashboard — company-wide, so Finance/Management only.
export const getBudgetSummary = asyncHandler(async (req: Request, res: Response) => {
  if (!isFinanceOrManagement(req)) {
    throw ApiError.forbidden("Only Finance or Management can view the company budget summary.");
  }
  const query = parseBudgetSummaryQuery(req.query as Record<string, unknown>);
  const result = await service.getBudgetSummary(query);
  res.status(200).json({ status: "ok", data: result });
});

export const getBudgetComparison = asyncHandler(async (req: Request, res: Response) => {
  const query = parseBudgetCompareQuery(req.query as Record<string, unknown>);
  if (!isFinanceOrManagement(req)) {
    // A department can still compare its OWN history month over month —
    // just not everyone else's.
    query.departmentId = ownDepartmentIdOrThrow(req);
  }
  const result = await service.getBudgetComparison(query);
  res.status(200).json({ status: "ok", data: result });
});
