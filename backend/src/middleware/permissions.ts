import { Request, Response, NextFunction } from "express";
import { ApiError } from "./errorHandler";

/**
 * Centralized, coarse ROUTE-LEVEL permission registry.
 *
 * This determines whether a role can hit an endpoint/module at all. It
 * does NOT implement row-level filtering (e.g. "only see your own
 * tasks", "only see Operations-relevant requests") — that is explicitly
 * separate, later work. Where a role's real-world access should be
 * narrower than a role check can express, this file denies the whole
 * route rather than exposing company-wide data and hoping the frontend
 * hides it — per the "frontend hiding is not security" rule this
 * registry exists to enforce.
 *
 * DEFAULT DENY: any authenticated route not explicitly listed below
 * returns 403. Adding a new route module means it is INACCESSIBLE to
 * everyone (except this file's PUBLIC_PREFIXES) until a rule is added
 * here — that is deliberate, not a bug to "fix" by loosening the default.
 *
 * Do not add per-route role checks scattered across the 26 route files
 * for coarse access — that's what this file is for. A route file should
 * only add its own check when it needs row-level/business-rule
 * authorization this registry can't express (e.g. "only the request's
 * own department can edit it") — see PROJECT_HANDOFF.md "Important
 * Decisions" for the current list of such cases, if any exist yet.
 *
 * UPDATED (2026-09-16, MB.2): corrected HR's access against explicit
 * user instruction — the word used was "see" for every item listed
 * (salaries, employees, attendance, employee contracts, payslips), so
 * HR is VIEW-ONLY on Employees/Employee Contracts (a prior session had
 * granted full read+write, based on the spec's vaguer "HR where
 * applicable" before real instruction existed — that's now superseded),
 * plus newly added GET-only access to Payroll (salaries/payslips) and
 * Operations (attendance — coarser than "just attendance", a known
 * route-level-granularity limitation, same as noted before). MARKETING
 * given GET-only on Clients/Client Contracts ("see the number of
 * clients and contracts"), per the same explicit instruction — this was
 * the still-open item from the previous session.
 */

type Role = "ADMIN" | "MANAGER" | "PAYROLL" | "OPERATIONS" | "STAFF" | "HR" | "MARKETING";
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RouteRule {
  /** Matched as a path SEGMENT prefix — "/api/clients" matches
   * "/api/clients" and "/api/clients/123/status" but never
   * "/api/clientsfoo". */
  prefix: string;
  methods: Partial<Record<Method, Role[]>>;
}

const ADMIN: Role[] = ["ADMIN"];
const ADMIN_MANAGER: Role[] = ["ADMIN", "MANAGER"];
const ADMIN_PAYROLL: Role[] = ["ADMIN", "PAYROLL"];
const ADMIN_MANAGER_OPS: Role[] = ["ADMIN", "MANAGER", "OPERATIONS"];
const ADMIN_MANAGER_PAYROLL: Role[] = ["ADMIN", "MANAGER", "PAYROLL"];
const ALL_ROLES: Role[] = ["ADMIN", "MANAGER", "PAYROLL", "OPERATIONS", "STAFF", "HR", "MARKETING"];

// GET-only additions for HR/MARKETING, kept separate from the
// write-capable consts above so neither role ever accidentally picks up
// POST/PUT/PATCH/DELETE access through a shared array.
// PAYROLL included: Payroll/Finance can create invoices (see the Finance
// cluster below) and needs to see the client list to pick one when doing
// so — write access to Clients itself is still ADMIN/MANAGER only.
const GET_CLIENTS: Role[] = ["ADMIN", "MANAGER", "OPERATIONS", "MARKETING", "PAYROLL"];
const GET_CLIENT_CONTRACTS: Role[] = ["ADMIN", "MANAGER", "OPERATIONS", "MARKETING"];
const GET_EMPLOYEES: Role[] = ["ADMIN", "MANAGER", "PAYROLL", "HR", "OPERATIONS"];
const GET_EMPLOYEE_CONTRACTS: Role[] = ["ADMIN", "MANAGER", "PAYROLL", "HR"];
const GET_PAYROLL: Role[] = ["ADMIN", "MANAGER", "PAYROLL", "HR"];
const GET_OPERATIONS: Role[] = ["ADMIN", "MANAGER", "OPERATIONS", "HR"];
// PAYROLL included: Payroll/Finance creates Operational Costs and General
// Expenses, both of which require picking a site (validated as a
// client+site pair) — write access to Sites itself stays ADMIN/MANAGER/OPERATIONS.
const GET_SITES: Role[] = ["ADMIN", "MANAGER", "OPERATIONS", "PAYROLL"];

/**
 * Routes that bypass this registry entirely. `/api/auth/login` is
 * public before requireAuth even runs; `/api/auth/me` just needs *a*
 * valid token, no role restriction — appropriate for every role to
 * check who they are.
 */
const PUBLIC_PREFIXES = ["/api/auth"];

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

const REGISTRY: RouteRule[] = [
  // Users & Permissions — ADMIN only, every method. Redundant with the
  // existing per-route requireRole("ADMIN") in users.routes.ts on
  // purpose (pre-existing, not new scattering) — belt and suspenders on
  // the most sensitive route in the system costs nothing.
  { prefix: "/api/users", methods: { GET: ADMIN, POST: ADMIN, PUT: ADMIN, PATCH: ADMIN, DELETE: ADMIN } },

  // Clients — MARKETING added to GET only (2026-09-16): "see the number
  // of clients", view-only, no create/edit/archive access.
  { prefix: "/api/clients", methods: { GET: GET_CLIENTS, POST: ADMIN_MANAGER, PUT: ADMIN_MANAGER, PATCH: ADMIN_MANAGER, DELETE: ADMIN } },

  // Sites — Operations needs to both read and act on site info for
  // operational duties, per the spec.
  { prefix: "/api/sites", methods: { GET: GET_SITES, POST: ADMIN_MANAGER_OPS, PUT: ADMIN_MANAGER_OPS, PATCH: ADMIN_MANAGER_OPS, DELETE: ADMIN_MANAGER } },

  // Client Contracts — MARKETING added to GET only (2026-09-16): "see
  // ...contracts we have", view-only.
  { prefix: "/api/client-contracts", methods: { GET: GET_CLIENT_CONTRACTS, POST: ADMIN_MANAGER, PUT: ADMIN_MANAGER, PATCH: ADMIN_MANAGER, DELETE: ADMIN } },

  // Employee Contracts — sensitive salary/rate data. HR is VIEW-ONLY
  // (2026-09-16 correction — previously had write access based on the
  // spec's vague "HR where applicable" before explicit instruction
  // existed; user's actual wording was "see", so write access removed).
  { prefix: "/api/employee-contracts", methods: { GET: GET_EMPLOYEE_CONTRACTS, POST: ADMIN_MANAGER, PUT: ADMIN_MANAGER, PATCH: ADMIN_MANAGER, DELETE: ADMIN } },

  // Employees — was deliberately NO Operations GET access to the general
  // employee database, per the spec's explicit instruction (Operations
  // was meant to get employee info only through Roster/Operations' own
  // nested responses, not this endpoint).
  // UPDATED (2026-09-24, explicit instruction): that turned out to break
  // Roster in practice — the "Schedule Shift" form's Employee dropdown
  // calls this endpoint directly, so Operations had no way to see any
  // employees to schedule. OPERATIONS added to GET_EMPLOYEES above (basic
  // fields only — name/position/status, not salary or contract data,
  // which stays behind /api/employee-contracts and /api/payroll, both
  // still closed to Operations).
  // UPDATED (2026-09-24, explicit instruction): write access (create/edit)
  // is ADMIN + HR only — MANAGER no longer has write access here, only
  // GET (via GET_EMPLOYEES below). This supersedes the 2026-09-16 "HR is
  // VIEW-ONLY" correction above the Employee Contracts rule, which still
  // applies to /api/employee-contracts, just not to /api/employees.
  // (A second, conflicting rule for this same prefix existed further down
  // this file and was silently dead code, since only the first matching
  // rule ever applies — removed rather than left as a trap.)
  { prefix: "/api/employees", methods: { GET: GET_EMPLOYEES, POST: ["ADMIN", "HR"], PUT: ["ADMIN", "HR"], PATCH: ["ADMIN", "HR"], DELETE: ADMIN } },

  // Operations cluster — Roster, Operations records, Site Requirements,
  // Shift Types. STAFF gets no broad access; "my roster" style
  // endpoints are future row-level work per the spec. HR added to GET
  // only on /api/operations specifically (2026-09-16), for attendance
  // visibility — NOT added to roster/site-requirements/shift-types,
  // since those weren't part of what HR asked to see.
  { prefix: "/api/roster", methods: { GET: ADMIN_MANAGER_OPS, POST: ADMIN_MANAGER_OPS, PUT: ADMIN_MANAGER_OPS, PATCH: ADMIN_MANAGER_OPS, DELETE: ADMIN_MANAGER } },
  { prefix: "/api/operations", methods: { GET: GET_OPERATIONS, POST: ADMIN_MANAGER_OPS, PUT: ADMIN_MANAGER_OPS, PATCH: ADMIN_MANAGER_OPS, DELETE: ADMIN_MANAGER } },
  { prefix: "/api/site-requirements", methods: { GET: ADMIN_MANAGER_OPS, POST: ADMIN_MANAGER_OPS, PUT: ADMIN_MANAGER_OPS, PATCH: ADMIN_MANAGER_OPS, DELETE: ADMIN_MANAGER } },
  { prefix: "/api/shift-types", methods: { GET: ADMIN_MANAGER_OPS, POST: ADMIN_MANAGER_OPS, PUT: ADMIN_MANAGER_OPS, PATCH: ADMIN_MANAGER_OPS, DELETE: ADMIN_MANAGER } },

  // Site Coverage — DELIBERATE deviation from the general Operations
  // cluster above, per the specific design decision made when this
  // feature was scoped: MANAGER may VIEW coverage but not TICK it.
  // Only ADMIN and OPERATIONS can write.
  { prefix: "/api/site-coverage", methods: { GET: ADMIN_MANAGER_OPS, POST: ["ADMIN", "OPERATIONS"], PUT: ["ADMIN", "OPERATIONS"], PATCH: ["ADMIN", "OPERATIONS"], DELETE: ADMIN } },

  // Payroll cluster — sensitive. Operations and Staff excluded entirely
  // at this layer, per the spec. HR added to GET only on /api/payroll
  // specifically (2026-09-16), covering salaries/payslips per explicit
  // instruction — NOT added to allowance-types/deduction-types/
  // statutory-rules, since those weren't part of what HR asked to see.
  { prefix: "/api/payroll", methods: { GET: GET_PAYROLL, POST: ADMIN_PAYROLL, PUT: ADMIN_PAYROLL, PATCH: ADMIN_PAYROLL, DELETE: ADMIN } },

  // Salary Advances -- same sensitivity/access shape as Payroll (2026-09-17): HR can view ("see...salaries" covers this), only Admin/Payroll can create/edit/cancel/record repayments.
  // UPDATED (2026-09-24, explicit instruction): MANAGER added to POST/PUT
  // here specifically — the boss pays employees directly and outside the
  // formal payroll run, without going through Admin/Finance first, and
  // wants those payments recorded in the system himself rather than after
  // the fact through someone else. This is a deliberate, narrow exception
  // to the "Only Admin and Finance can edit Finance" rule (2026-09-23) —
  // scoped to this one module only, not the rest of the Finance cluster
  // below (Invoices/Payments/Operational Costs/General Expenses stay
  // Admin+Finance only).
  { prefix: "/api/salary-advances", methods: { GET: GET_PAYROLL, POST: ["ADMIN", "MANAGER", "PAYROLL"], PUT: ["ADMIN", "MANAGER", "PAYROLL"], PATCH: ["ADMIN", "MANAGER", "PAYROLL"], DELETE: ADMIN } },
  { prefix: "/api/allowance-types", methods: { GET: ADMIN_MANAGER_PAYROLL, POST: ADMIN_PAYROLL, PUT: ADMIN_PAYROLL, PATCH: ADMIN_PAYROLL, DELETE: ADMIN } },
  { prefix: "/api/deduction-types", methods: { GET: ADMIN_MANAGER_PAYROLL, POST: ADMIN_PAYROLL, PUT: ADMIN_PAYROLL, PATCH: ADMIN_PAYROLL, DELETE: ADMIN } },
  { prefix: "/api/statutory-rules", methods: { GET: ADMIN_MANAGER_PAYROLL, POST: ADMIN_PAYROLL, PUT: ADMIN_PAYROLL, PATCH: ADMIN_PAYROLL, DELETE: ADMIN } },


  // Finance cluster — Operations and Staff must NOT access, per the spec.
  // Write access (create/edit) restricted to ADMIN and PAYROLL (this
  // system's Finance role) only, per explicit instruction (2026-09-23):
  // "Only the Admin and Finance can edit things in Finance." MANAGER keeps
  // GET/view access but lost POST/PUT/PATCH here.
  { prefix: "/api/invoices", methods: { GET: ADMIN_MANAGER_PAYROLL, POST: ADMIN_PAYROLL, PUT: ADMIN_PAYROLL, PATCH: ADMIN_PAYROLL, DELETE: ADMIN } },
  { prefix: "/api/payments", methods: { GET: ADMIN_MANAGER_PAYROLL, POST: ADMIN_PAYROLL, PUT: ADMIN_PAYROLL, PATCH: ADMIN_PAYROLL, DELETE: ADMIN } },
  { prefix: "/api/operational-costs", methods: { GET: ADMIN_MANAGER_PAYROLL, POST: ADMIN_PAYROLL, PUT: ADMIN_PAYROLL, PATCH: ADMIN_PAYROLL, DELETE: ADMIN } },
  // MARKETING added to GET only (2026-09-24, Marketing module Phase 6
  // "Marketing Expenses") — per the brief this reuses General Expenses
  // rather than a separate system, and per the Finance-cluster rule above
  // ("Only Admin and Finance can edit Finance") marketers can see what's
  // been logged for their department, not create/edit expenses directly.
  { prefix: "/api/general-expenses", methods: { GET: ["ADMIN", "MANAGER", "PAYROLL", "MARKETING"], POST: ADMIN_PAYROLL, PUT: ADMIN_PAYROLL, PATCH: ADMIN_PAYROLL, DELETE: ADMIN } },

  // Field Receipts (2026-09-25) — Operations logs a receipt ref# on the
  // spot, in the field; only Admin/Payroll (Finance) can mark it
  // reconciled/discrepancy once the physical receipt is handed in. POST
  // is the only write Operations gets — no PUT/PATCH/DELETE, so an entry
  // can't be quietly edited after the fact; a mistaken entry gets flagged
  // DISCREPANCY through reconciliation instead of edited away.
  { prefix: "/api/field-receipts", methods: { GET: ["ADMIN", "MANAGER", "OPERATIONS", "PAYROLL"], POST: ["ADMIN", "MANAGER", "OPERATIONS"], PUT: [], PATCH: [], DELETE: ADMIN } },

  // Departmental Monthly Budgets (2026-09-25) — every department manages
  // its OWN budget (create/edit/submit); Finance (PAYROLL)/Management
  // review, approve and get company-wide visibility. This coarse rule
  // only decides which roles may hit the module at ALL — row-level "own
  // department only" scoping, and the Finance-only review/summary
  // sub-routes, are enforced in department-budgets.controller.ts (the
  // same prefix+method can't distinguish e.g. PATCH .../submit from
  // PATCH .../review). No DELETE route exists — a budget is superseded by
  // a new month's copy-forward, not removed.
  { prefix: "/api/department-budgets", methods: { GET: ["ADMIN", "MANAGER", "PAYROLL", "OPERATIONS", "HR", "MARKETING"], POST: ["ADMIN", "MANAGER", "PAYROLL", "OPERATIONS", "HR", "MARKETING"], PUT: ["ADMIN", "MANAGER", "PAYROLL", "OPERATIONS", "HR", "MARKETING"], PATCH: ["ADMIN", "MANAGER", "PAYROLL", "OPERATIONS", "HR", "MARKETING"] } },

  // Inventory — no broad STAFF access. A future "My Assigned Assets"
  // endpoint with row-level filtering is explicitly out of scope here.
  { prefix: "/api/inventory", methods: { GET: ADMIN_MANAGER_OPS, POST: ADMIN_MANAGER_OPS, PUT: ADMIN_MANAGER_OPS, PATCH: ADMIN_MANAGER_OPS, DELETE: ADMIN_MANAGER } },

  // Tasks — STAFF gets nothing at this layer until "my tasks" row-level
  // endpoints exist, per the spec's explicit instruction not to expose
  // all tasks "temporarily". MARKETING added (2026-09-24, Marketing
  // module Phase 5 "Tasks and Targets") — reuses this existing module
  // rather than a separate marketing-only tasks system, per the brief.
  { prefix: "/api/tasks", methods: { GET: ["ADMIN", "MANAGER", "OPERATIONS", "PAYROLL", "HR", "MARKETING"], POST: ["ADMIN", "MANAGER", "OPERATIONS", "PAYROLL", "HR", "MARKETING"], PUT: ["ADMIN", "MANAGER", "OPERATIONS", "PAYROLL", "HR", "MARKETING"], PATCH: ["ADMIN", "MANAGER", "OPERATIONS", "PAYROLL", "HR", "MARKETING"], DELETE: ADMIN_MANAGER } },

  // Department Requests — Operations can create/view; Payroll/Finance
  // reviews (GET + status transitions, not create); Staff gets nothing
  // until "my requests" exists. MARKETING added to GET/POST (2026-09-24,
  // Marketing module Phase 7) — the brief explicitly says Marketing
  // Requests should reuse this module rather than a separate system, but
  // MARKETING was never actually granted access to it until now.
  { prefix: "/api/department-requests", methods: { GET: ["ADMIN", "MANAGER", "OPERATIONS", "PAYROLL", "HR", "MARKETING"], POST: ["ADMIN", "MANAGER", "OPERATIONS", "HR", "MARKETING"], PUT: ["ADMIN", "MANAGER", "PAYROLL"], PATCH: ["ADMIN", "MANAGER", "PAYROLL"], DELETE: ADMIN } },

  // Departments — structural, ADMIN-only to modify. HR keeps read
  // access (needs to know the department structure), not write —
  // unchanged from the prior session, not part of this correction.
  // OPERATIONS added for GET: Operations submits Department Requests
  // (see below) and that form needs the department list to pick from —
  // same silent-empty-dropdown bug as Clients/Sites above, not a change
  // in write access. MARKETING added the same way (2026-09-24) — the
  // Department Requests form MARKETING now also has access to needs this
  // same dropdown.
  { prefix: "/api/departments", methods: { GET: ["ADMIN", "MANAGER", "HR", "OPERATIONS", "MARKETING"], POST: ADMIN, PUT: ADMIN, PATCH: ADMIN, DELETE: ADMIN } },

  // Dashboard & Alerts — every authenticated role may hit the endpoint;
  // the DATA returned must be role-aware server-side (NOT enforced by
  // this coarse layer — see report/PROJECT_HANDOFF.md for this gap).
  { prefix: "/api/dashboard", methods: { GET: ALL_ROLES } },
  { prefix: "/api/alerts", methods: { GET: ALL_ROLES } },

  // Push token registration — every authenticated role may register or
  // unregister their OWN device's token (self-service, not a data-access
  // endpoint, so no role gating beyond "logged in" makes sense here).
  { prefix: "/api/push-tokens", methods: { POST: ALL_ROLES, DELETE: ALL_ROLES } },

  // Marketing: Prospect/Lead CRM — per the Marketing module brief, MARKETING
  // owns this data (create/edit/stage changes); MANAGER gets view access
  // ("management should be able to view marketing performance"), not write.
  // No DELETE rule: the route itself doesn't implement one (see
  // prospects.routes.ts), so this falls through to default-deny either way.
  { prefix: "/api/prospects", methods: { GET: ["ADMIN", "MANAGER", "MARKETING"], POST: ["ADMIN", "MARKETING"], PUT: ["ADMIN", "MARKETING"], PATCH: ["ADMIN", "MARKETING"] } },

  // Marketing: Activity tracking — same access shape as Prospects above:
  // MARKETING owns the data, MANAGER can view for oversight/reporting.
  { prefix: "/api/marketing-activities", methods: { GET: ["ADMIN", "MANAGER", "MARKETING"], POST: ["ADMIN", "MARKETING"], PUT: ["ADMIN", "MARKETING"], DELETE: ["ADMIN", "MARKETING"] } },

  // Marketing: Dashboard — read-only, same viewers as the rest of Marketing.
  { prefix: "/api/marketing-dashboard", methods: { GET: ["ADMIN", "MANAGER", "MARKETING"] } },

  // Marketing: Field Visits — same access shape as Prospects/Activities.
  // Covers the nested attachment endpoints too (segment-prefix match).
  { prefix: "/api/field-visits", methods: { GET: ["ADMIN", "MANAGER", "MARKETING"], POST: ["ADMIN", "MARKETING"], PUT: ["ADMIN", "MARKETING"], DELETE: ["ADMIN", "MARKETING"] } },

  // Marketing: Targets — Phase 5 of the Marketing module, alongside Tasks
  // above. Same access shape as the rest of the Marketing cluster.
  { prefix: "/api/marketing-targets", methods: { GET: ["ADMIN", "MANAGER", "MARKETING"], POST: ["ADMIN", "MARKETING"], PUT: ["ADMIN", "MARKETING"], DELETE: ["ADMIN", "MARKETING"] } },

  // Settings — ADMIN only. Spec allows MANAGER access to "specifically
  // approved" config endpoints, but names none — not granted here.
  { prefix: "/api/settings", methods: { GET: ADMIN, POST: ADMIN, PUT: ADMIN, PATCH: ADMIN, DELETE: ADMIN } },
];

/**
 * Mount this AFTER requireAuth and BEFORE every route module. See
 * server.ts for the exact ordering — getting this wrong either makes
 * the registry a no-op or breaks the public /login route.
 */
export function checkPermissions(req: Request, _res: Response, next: NextFunction) {
  const path = req.path;

  if (PUBLIC_PREFIXES.some((p) => matchesPrefix(path, p))) {
    return next();
  }

  if (!req.user) {
    // Should be unreachable — requireAuth runs first and throws before
    // this point if there's no valid user. Defensive only.
    throw ApiError.unauthorized("Not authenticated.");
  }

  const rule = REGISTRY.find((r) => matchesPrefix(path, r.prefix));
  if (!rule) {
    // DEFAULT DENY — an unlisted route is inaccessible, not open.
    throw ApiError.forbidden(
      `No permission rule is defined for ${req.method} ${path}. Access denied by default — add a rule in permissions.ts if this route should be reachable.`
    );
  }

  const allowedRoles = rule.methods[req.method as Method];
  if (!allowedRoles || !allowedRoles.includes(req.user.role as Role)) {
    throw ApiError.forbidden(`Your role (${req.user.role}) is not permitted to ${req.method} ${rule.prefix}.`);
  }

  next();
}

