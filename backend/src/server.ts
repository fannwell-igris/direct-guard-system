import employeeLoansRouter from "./modules/employee-loans/employee-loans.routes";
import settingsRouter from "./modules/settings/settings.routes";
import dashboardRouter from "./modules/dashboard/dashboard.routes";
import alertsRouter from "./modules/alerts/alerts.routes";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./lib/prisma";
import clientsRoutes from "./modules/clients/clients.routes";
import sitesRoutes from "./modules/sites/sites.routes";
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
import payrollRoutes from "./modules/payroll/payroll.routes";
import allowanceTypesRoutes from "./modules/allowance-types/allowance-types.routes";
import deductionTypesRoutes from "./modules/deduction-types/deduction-types.routes";
import statutoryRulesRoutes from "./modules/statutory-rules/statutory-rules.routes";
import operationalCostsRoutes from "./modules/operational-costs/operational-costs.routes";
import invoicesRoutes from "./modules/invoices/invoices.routes";
import paymentsRoutes from "./modules/payments/payments.routes";
import { errorHandler } from "./middleware/errorHandler";
import inventoryRouter from "./modules/inventory/inventory.routes";
import authRoutes from "./modules/auth/auth.routes";
import usersRoutes from "./modules/users/users.routes";
import salaryAdvancesRoutes from "./modules/salary-advances/salary-advances.routes";
import { requireAuth } from "./middleware/requireAuth";
import { checkPermissions } from "./middleware/permissions";

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
app.use("/api/salary-advances", salaryAdvancesRoutes);

// Must be the LAST app.use() — Express only routes errors here if it's
// registered after every other route/middleware.
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`CMS backend listening on http://localhost:${PORT}`);
});

