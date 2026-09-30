import messagesRouter from "./modules/messages/messages.routes";
import employeeLoansRouter from "./modules/employee-loans/employee-loans.routes";
import demoResetRouter from "./modules/demo-reset/demo-reset.routes";
import settingsRouter from "./modules/settings/settings.routes";
import dashboardRouter from "./modules/dashboard/dashboard.routes";
import alertsRouter from "./modules/alerts/alerts.routes";
import { checkAndPushAlerts } from "./modules/alerts/push-notifier";
import pushTokensRoutes from "./modules/push-tokens/push-tokens.routes";
import prospectsRoutes from "./modules/prospects/prospects.routes";
import marketingActivitiesRoutes from "./modules/marketing-activities/marketing-activities.routes";
import marketingDashboardRoutes from "./modules/marketing-dashboard/marketing-dashboard.routes";
import fieldVisitsRoutes from "./modules/field-visits/field-visits.routes";
import marketingTargetsRoutes from "./modules/marketing-targets/marketing-targets.routes";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./lib/prisma";
import clientsRoutes from "./modules/clients/clients.routes";
import sitesRoutes from "./modules/Sites/sites.routes";
import siteCoverageRoutes from "./modules/site-coverage/site-coverage.routes";
import employeesRoutes from "./modules/employees/employees.routes";
import clientContractsRoutes from "./modules/client-contracts/client-contracts.routes";
import employeeContractsRoutes from "./modules/employee-contracts/employee-contracts.routes";
import shiftTypesRoutes from "./modules/shift-types/shift-types.routes";
import siteRequirementsRoutes from "./modules/site-requirements/site-requirements.routes";
import rosterRoutes from "./modules/roster/roster.routes";
import operationsRoutes from "./modules/operations/operations.routes";
import departmentsRouter from "./modules/departments/departments.routes";
import tasksRouter from "./modules/tasks/tasks.routes";
import departmentRequestsRouter from "./modules/department-requests/department-requests.routes";
import generalExpensesRouter from "./modules/general-expenses/general-expenses.routes";
import fieldReceiptsRouter from "./modules/field-receipts/field-receipts.routes";
import departmentBudgetsRouter from "./modules/department-budgets/department-budgets.routes";
import weeklyPlansRouter from "./modules/weekly-plans/weekly-plans.routes";
import payrollRoutes from "./modules/payroll/payroll.routes";
import allowanceTypesRoutes from "./modules/allowance-types/allowance-types.routes";
import deductionTypesRoutes from "./modules/deduction-types/deduction-types.routes";
import statutoryRulesRoutes from "./modules/statutory-rules/statutory-rules.routes";
import operationalCostsRoutes from "./modules/operational-costs/operational-costs.routes";
import invoicesRoutes from "./modules/invoices/invoices.routes";
import paymentsRoutes from "./modules/payments/payments.routes";
import quotationsRoutes from "./modules/quotations/quotations.routes";
import { errorHandler } from "./middleware/errorHandler";
import inventoryRouter from "./modules/inventory/inventory.routes";
import authRoutes from "./modules/auth/auth.routes";
import usersRoutes from "./modules/users/users.routes";
import salaryAdvancesRoutes from "./modules/salary-advances/salary-advances.routes";
import { requireAuth } from "./middleware/requireAuth";
import { checkPermissions } from "./middleware/permissions";
import { requireDeleteConfirmation } from "./middleware/requireDeleteConfirmation";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// In production, only the deployed frontend's origin(s) may call this API.
// CORS_ORIGIN can be a single URL or a comma-separated list (e.g. when the
// frontend is reachable at both a custom domain and its platform subdomain).
// Left unset (local dev), every origin is allowed as before.
const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim());
app.use(cors(corsOrigins ? { origin: corsOrigins } : undefined));
app.use(express.json());

// Basic health check - confirms the server itself is running
app.get("/health", (_req, res) => {
  res.json({ status: "ok", message: "CMS backend is running" });
});

// Database health check - confirms Prisma can actually reach PostgreSQL
app.get("/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", message: "Database connection successful" });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Database connection failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Auth module — POST /login is public. GET /me applies its own
// requireAuth directly, since this router is mounted BEFORE the global
// requireAuth below (has to be, so /login stays reachable without a token).
app.use("/api/auth", authRoutes);

// From here down, EVERY route requires a valid Bearer token. No per-role
// restrictions at this global level — that's opt-in per route (see
// users.routes.ts for the one place it's currently used). Minimal scope,
// see PROJECT_HANDOFF.md for why granular per-module rules aren't built yet.
app.use(requireAuth);

// Centralized route-level permission registry — default deny. Must run
// immediately after requireAuth and before every route module below.
// See permissions.ts for the full role/route table and why each choice
// was made.
app.use(checkPermissions);

// Password re-confirmation for ADMIN's DELETE requests (2026-09-25) — must
// run after checkPermissions (so a role that's not even allowed to DELETE
// this route gets that error first) and before every route module below.
app.use(requireDeleteConfirmation);

// Users module — requires ADMIN role on every route (applied per-route,
// not here) on top of the requireAuth above. The very first user is
// created by scripts/seedAdmin.ts, not through this API — see that file.
app.use("/api/users", usersRoutes);

// Clients module — CRUD + search/filter + archive (no hard delete, Section 19)
app.use("/api/clients", clientsRoutes);

// Sites module — CRUD + search/filter/clientId + archive (no hard delete, Section 19)
app.use("/api/sites", sitesRoutes);

// Employees module — CRUD + search/filter/assignedClientId/assignedSiteId + status change (no hard delete, Section 19)
app.use("/api/employees", employeesRoutes);

app.use("/api/employee-loans", employeeLoansRouter);

// Client Contracts module — CRUD, status always calculated server-side from dates (Section 9)
app.use("/api/client-contracts", clientContractsRoutes);

// Employee Contracts module — CRUD, status always calculated server-side from dates (Section 9)
app.use("/api/employee-contracts", employeeContractsRoutes);

// Shift Types module — configurable lookup (Day/Night/etc.), Operations Phase 1
app.use("/api/shift-types", shiftTypesRoutes);

// Site Requirements module — per-site staffing needs by shift type, Operations Phase 1
app.use("/api/site-requirements", siteRequirementsRoutes);

// Roster module — who is scheduled where/when; clientId is a snapshot taken
// at creation/reassignment time, not derived live from site.clientId (Operations Phase 1)
app.use("/api/roster", rosterRoutes);

// Operations module — daily OperationsRecord (site+date+shift summary,
// review workflow) + calculated coverage %; Operations Phase 3. Does NOT
// yet include AttendanceRecord creation (POST /:id/attendance) — see
// operations.routes.ts for why that's deliberately deferred.
app.use("/api/operations", operationsRoutes);

app.use("/api/dashboard", dashboardRouter);

app.use("/api/site-coverage", siteCoverageRoutes);

app.use("/api/settings", settingsRouter);

// Payroll module — Phase 4 (read-only shift-pay preview) + Phase 5a
// (PayrollRun/PayrollLineItem CRUD, allowances/deductions, Draft ->
// Reviewed -> Finalized -> Paid workflow) + Phase 5b
// (POST /runs/:id/apply-statutory-deductions — PAYE/NAPSA/NHIMA computed
// from active StatutoryRule rows, applied to gross pay).
app.use("/api/payroll", payrollRoutes);
app.use("/api/allowance-types", allowanceTypesRoutes);
app.use("/api/deduction-types", deductionTypesRoutes);
// Statutory Rules module — configurable PAYE/NAPSA/NHIMA rates/brackets
// (PERCENTAGE/FIXED/BRACKETED), each linked to a DeductionType. Phase 5b.
app.use("/api/statutory-rules", statutoryRulesRoutes);

// Operational Costs — per-site monthly cost tracking (clientId/siteId
// pair validated so a site can't be logged under the wrong client).
app.use("/api/operational-costs", operationalCostsRoutes);
app.use("/api/departments", departmentsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/department-requests", departmentRequestsRouter);
app.use("/api/general-expenses", generalExpensesRouter);
app.use("/api/field-receipts", fieldReceiptsRouter);
app.use("/api/department-budgets", departmentBudgetsRouter);
// Weekly operational plans — what a department intends to DO in one week,
// read against the monthly budget above for visibility only (never enforced).
app.use("/api/weekly-plans", weeklyPlansRouter);
app.use("/api/inventory", inventoryRouter);

// Invoices — invoiceNumber auto-generated (INV-<year>-<0000>), status
// derived from Payments (never set directly except via /issue and
// /cancel). Includes nested payment endpoints
// (POST/GET /api/invoices/:id/payments) — see invoices.routes.ts.
app.use("/api/invoices", invoicesRoutes);

// Payments — flat view/edit/delete of a single Payment by its own id.
// Creation and per-invoice listing live under /api/invoices/:id/payments
// instead. Unlike most models here, Payment supports real deletion (a
// genuine correction) — see payments.service.ts.
app.use("/api/payments", paymentsRoutes);

// Quotations — QUO-<year>-<0000> auto-generated; sequence stored in
// finance.quotationNumberSequences (same pattern as invoice numbering).
// Status: DRAFT → SENT → ACCEPTED / REJECTED / EXPIRED.
// startingNumber on POST lets the first quotation start at a chosen number;
// future ones continue from there automatically.
app.use("/api/quotations", quotationsRoutes);

app.use("/api/salary-advances", salaryAdvancesRoutes);

// Push notification device-token registration — see push-tokens.routes.ts.
app.use("/api/push-tokens", pushTokensRoutes);

// Marketing: Prospect/Lead CRM — Phase 1 of the Marketing Department
// module. stage is only changed via PATCH /:id/stage, which appends a
// ProspectStageHistory row rather than overwriting — see prospects.service.ts.
app.use("/api/prospects", prospectsRoutes);

// Marketing: Activity tracking — Phase 2 of the Marketing Department
// module. Generic log covering calls/emails/WhatsApp/meetings/proposals/
// quotations/social media/campaigns/networking/visits, optionally linked
// to a Prospect and/or an existing Client.
app.use("/api/marketing-activities", marketingActivitiesRoutes);

// Marketing: Dashboard/funnel — Phase 3 of the Marketing Department
// module. Read-only aggregate over Prospects/ProspectStageHistory/
// MarketingActivity, nothing new stored here.
app.use("/api/marketing-dashboard", marketingDashboardRoutes);

// Marketing: Field Visit Management — Phase 4 of the Marketing Department
// module. Includes attachment upload/serve/delete for a supporting photo
// or document (see uploadMiddleware.ts's visit-attachments storage).
app.use("/api/field-visits", fieldVisitsRoutes);

// Marketing: Tasks & Targets — Phase 5 of the Marketing module. Tasks
// themselves reuse the existing /api/tasks module above (see
// permissions.ts for the added MARKETING access there); this is just the
// new Targets piece — monthly goals per marketer, compared against live
// actuals computed at read time.
app.use("/api/marketing-targets", marketingTargetsRoutes);

// Messages — internal messaging between system users (threads + participants +
// messages). Every authenticated role can send and receive messages.
app.use("/api/messages", messagesRouter);

// Demo reset — wipes all transactional data in one shot so staff can start
// fresh after a training session. ADMIN only + password re-confirmation.
// Must sit before errorHandler but has no ordering requirement relative to
// other route modules.
app.use("/api/demo-reset", demoResetRouter);

// Must be the LAST app.use() — Express only routes errors here if it's
// registered after every other route/middleware.
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`CMS backend listening on http://localhost:${PORT}`);
});

// Push notifications: periodically re-check the live alerts feed and
// notify registered devices about anything new/escalated. A total no-op
// if Firebase env vars aren't set (see lib/push.ts) — safe to leave
// running in every environment, including local dev.
const PUSH_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
setInterval(() => {
  checkAndPushAlerts().catch((err) => console.error("Push notification check failed:", err));
}, PUSH_CHECK_INTERVAL_MS);
// Also run once shortly after startup rather than waiting the full interval.
setTimeout(() => {
  checkAndPushAlerts().catch((err) => console.error("Push notification check failed:", err));
}, 15_000);

