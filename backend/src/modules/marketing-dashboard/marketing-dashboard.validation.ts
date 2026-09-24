import { ApiError } from "../../middleware/errorHandler";

export type Period = "today" | "week" | "month" | "custom";

export interface DashboardQuery {
  period: Period;
  customFrom?: Date;
  customTo?: Date;
}

const VALID_PERIODS: Period[] = ["today", "week", "month", "custom"];

/** Validates and normalizes query params for GET /marketing-dashboard. */
export function parseDashboardQuery(query: Record<string, unknown>): DashboardQuery {
  const periodRaw = typeof query.period === "string" ? query.period : "month";
  if (!VALID_PERIODS.includes(periodRaw as Period)) {
    throw ApiError.badRequest(`\`period\` must be one of: ${VALID_PERIODS.join(", ")}.`);
  }
  const period = periodRaw as Period;

  if (period !== "custom") {
    return { period };
  }

  if (typeof query.dateFrom !== "string" || typeof query.dateTo !== "string") {
    throw ApiError.badRequest("`dateFrom` and `dateTo` are required when `period` is \"custom\".");
  }
  const customFrom = new Date(query.dateFrom);
  const customTo = new Date(query.dateTo);
  if (Number.isNaN(customFrom.getTime()) || Number.isNaN(customTo.getTime())) {
    throw ApiError.badRequest("`dateFrom`/`dateTo` must be valid dates.");
  }
  if (customFrom > customTo) {
    throw ApiError.badRequest("`dateFrom` must not be after `dateTo`.");
  }

  return { period, customFrom, customTo };
}
