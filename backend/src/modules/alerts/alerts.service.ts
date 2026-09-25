import { prisma } from "../../lib/prisma";

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AlertCategory =
  | "INVOICE_OVERDUE"
  | "CONTRACT_EXPIRING"
  | "PROPERTY_NOT_RETURNED"
  | "PROPERTY_WITH_ABSCONDED_EMPLOYEE"
  | "TASK_OVERDUE"
  | "LOW_STOCK"
  | "PAYROLL_DUE"
  | "ROSTER_GAP"
  | "SITE_UNMANNED"
  | "INVOICE_DUE"
  | "INVOICE_PAID"
  | "CONTRACT_ENDED"
  | "DEPARTMENT_REQUEST_PENDING";

export interface Alert {
  category: AlertCategory;
  severity: AlertSeverity;
  message: string;
  referenceId: string;
  referenceType: string;
  data: Record<string, unknown>;
}

// Thresholds — move to Settings module when built
const CONTRACT_EXPIRY_WARN_DAYS = 30;
const PROPERTY_OVERDUE_DAYS = 7;
const LOW_STOCK_THRESHOLD = 5;
const PAYROLL_DUE_WARN_DAYS = 7;

function daysAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function daysFromNow(date: Date): number {
  return Math.floor((date.getTime() - Date.now()) / 86_400_000);
}

// ---- Invoice overdue ----
async function invoiceOverdueAlerts(): Promise<Alert[]> {
  const now = new Date();
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { notIn: ["PAID", "CANCELLED"] },
      dueDate: { lt: now },
    },
    include: { client: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  });

  return invoices.map((inv) => {
    const daysOverdue = daysAgo(inv.dueDate);
    return {
      category: "INVOICE_OVERDUE",
      severity: daysOverdue > 30 ? "CRITICAL" : daysOverdue > 14 ? "HIGH" : "MEDIUM",
      message: `Invoice ${inv.invoiceNumber} for ${inv.client.name} is overdue by ${daysOverdue} day${daysOverdue === 1 ? "" : "s"}.`,
      referenceId: inv.id,
      referenceType: "Invoice",
      data: {
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.client.name,
        dueDate: inv.dueDate,
        amount: inv.amount,
        status: inv.status,
        daysOverdue,
      },
    };
  });
}

// ---- Invoice paid ----
// Added 2026-09-25 per explicit instruction ("invoice paid notification").
// Informational — lets Finance/Admin see at a glance which invoices have
// just cleared, without having to go looking. Only invoices paid in the
// last 3 days are surfaced, since PAID is permanent and would otherwise
// pile up forever.
const INVOICE_PAID_RECENT_DAYS = 3;

async function invoicePaidAlerts(): Promise<Alert[]> {
  const cutoff = new Date(Date.now() - INVOICE_PAID_RECENT_DAYS * 86_400_000);
  const invoices = await prisma.invoice.findMany({
    where: { status: "PAID", lastUpdated: { gte: cutoff } },
    include: { client: { select: { name: true } } },
    orderBy: { lastUpdated: "desc" },
  });

  return invoices.map((inv) => ({
    category: "INVOICE_PAID",
    severity: "LOW",
    message: `Invoice ${inv.invoiceNumber} for ${inv.client.name} has been paid in full (ZMW ${Number(inv.amount).toLocaleString()}).`,
    referenceId: inv.id,
    referenceType: "Invoice",
    data: {
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.client.name,
      amount: inv.amount,
      paidAround: inv.lastUpdated,
    },
  }));
}

// ---- Contract ended ----
// Added 2026-09-25 per explicit instruction ("contract ended"). Distinct
// from CONTRACT_EXPIRING (which warns BEFORE the end date) — this fires
// once the contract's own calculated status has actually flipped to
// EXPIRED, so it doesn't quietly fall off Finance/Admin's radar the
// moment it's no longer "expiring soon".
async function contractEndedAlerts(): Promise<Alert[]> {
  const contracts = await prisma.clientContract.findMany({
    where: { status: "EXPIRED" },
    include: { client: { select: { name: true } }, site: { select: { siteName: true } } },
    orderBy: { endDate: "desc" },
  });

  return contracts.map((cc) => {
    const daysSince = daysAgo(cc.endDate);
    return {
      category: "CONTRACT_ENDED",
      severity: daysSince > 14 ? "HIGH" : "MEDIUM",
      message: `Contract for ${cc.client.name}${cc.site ? ` (${cc.site.siteName})` : ""} ended ${daysSince === 0 ? "today" : `${daysSince} day${daysSince === 1 ? "" : "s"} ago`} — renew or mark inactive.`,
      referenceId: cc.id,
      referenceType: "ClientContract",
      data: {
        clientName: cc.client.name,
        siteName: cc.site?.siteName ?? null,
        endDate: cc.endDate,
        daysSince,
      },
    };
  });
}

// ---- Department requests awaiting Admin/Management review ----
// Added 2026-09-25 per explicit instruction ("Admin receives notifications
// from other departments — Requests etc"). Every PENDING DepartmentRequest
// (a department asking Admin/Management for something — budget, approval,
// equipment, etc.) shows up here until it's actioned. Visible only to
// ADMIN/MANAGER (see MANAGEMENT_CATEGORIES below) — this is exactly the
// kind of cross-department item ordinary staff shouldn't see.
const REQUEST_PRIORITY_SEVERITY: Record<string, AlertSeverity> = {
  CRITICAL: "CRITICAL",
  URGENT: "HIGH",
  HIGH: "HIGH",
  NORMAL: "MEDIUM",
  LOW: "LOW",
};

async function departmentRequestPendingAlerts(): Promise<Alert[]> {
  const requests = await prisma.departmentRequest.findMany({
    where: { status: "PENDING" },
    include: { department: { select: { name: true } } },
    orderBy: [{ priority: "desc" }, { dateCreated: "asc" }],
  });

  return requests.map((r) => ({
    category: "DEPARTMENT_REQUEST_PENDING",
    severity: REQUEST_PRIORITY_SEVERITY[r.priority] ?? "MEDIUM",
    message: `${r.department.name} submitted a request: "${r.title}" (${r.priority.toLowerCase()} priority) — awaiting review.`,
    referenceId: r.id,
    referenceType: "DepartmentRequest",
    data: {
      departmentName: r.department.name,
      title: r.title,
      priority: r.priority,
      estimatedCost: r.estimatedCost,
      submittedBy: r.submittedBy,
      dateCreated: r.dateCreated,
    },
  }));
}

// ---- Invoice due (respects each client's own billing cycle) ----
// Explicit instruction (2026-09-25): some clients pay several months in
// advance and are only invoiced once a quarter (or once a year), not every
// month. Before this, nothing in the system tracked when a client was
// actually due to be invoiced next — Finance just had to remember.
// ClientContract.billingFrequency already existed but was purely
// informational (never read anywhere). This alert is the first thing that
// actually uses it: it looks at when the client was LAST invoiced and adds
// their contract's own billing period (1/3/12 months), so a quarterly
// client is never nagged monthly the way a monthly one would be.
const BILLING_PERIOD_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUALLY: 12,
  ONE_OFF: 0, // never re-fires — a one-off contract is invoiced once, period.
};

async function invoiceDueAlerts(): Promise<Alert[]> {
  const now = new Date();
  const contracts = await prisma.clientContract.findMany({
    where: { status: "ACTIVE", billingFrequency: { not: "ONE_OFF" } },
    include: { client: { select: { name: true } }, site: { select: { siteName: true } } },
  });

  const alerts: Alert[] = [];

  for (const c of contracts) {
    const periodMonths = BILLING_PERIOD_MONTHS[c.billingFrequency];
    const lastInvoice = await prisma.invoice.findFirst({
      where: { clientId: c.clientId, ...(c.siteId ? { siteId: c.siteId } : {}) },
      orderBy: { invoiceDate: "desc" },
    });

    const baseDate = lastInvoice ? new Date(lastInvoice.invoiceDate) : new Date(c.startDate);
    const nextDue = new Date(baseDate);
    nextDue.setMonth(nextDue.getMonth() + periodMonths);

    if (nextDue.getTime() > now.getTime()) continue;

    const daysOverdue = daysAgo(nextDue);
    const frequencyLabel = c.billingFrequency.charAt(0) + c.billingFrequency.slice(1).toLowerCase();
    alerts.push({
      category: "INVOICE_DUE",
      severity: daysOverdue > 14 ? "HIGH" : "MEDIUM",
      message: `${c.client.name}${c.site ? ` (${c.site.siteName})` : ""} is due for their next ${frequencyLabel.toLowerCase()} invoice${
        lastInvoice ? ` — last invoiced ${new Date(lastInvoice.invoiceDate).toLocaleDateString("en-GB")}` : " — no invoice has been issued yet"
      }.`,
      referenceId: c.id,
      referenceType: "ClientContract",
      data: {
        clientName: c.client.name,
        siteName: c.site?.siteName ?? null,
        billingFrequency: c.billingFrequency,
        lastInvoiceDate: lastInvoice?.invoiceDate ?? null,
        nextDueDate: nextDue,
        // ClientContract.amount is already the amount due per billing
        // cycle (a quarterly contract's `amount` is the quarter's total,
        // not a monthly rate needing multiplication), same figure shown
        // next to the frequency badge on the Contracts page.
        suggestedAmount: Number(c.amount),
      },
    });
  }

  return alerts;
}

// ---- Contract expiring soon ----
async function contractExpiringAlerts(): Promise<Alert[]> {
  const cutoff = new Date(Date.now() + CONTRACT_EXPIRY_WARN_DAYS * 86_400_000);
  const now = new Date();
  const alerts: Alert[] = [];

  const clientContracts = await prisma.clientContract.findMany({
    where: {
      status: { notIn: ["EXPIRED", "INACTIVE"] },
      endDate: { gte: now, lte: cutoff },
    },
    include: { client: { select: { name: true } }, site: { select: { siteName: true } } },
    orderBy: { endDate: "asc" },
  });

  for (const cc of clientContracts) {
    const daysLeft = daysFromNow(cc.endDate);
    alerts.push({
      category: "CONTRACT_EXPIRING",
      severity: daysLeft <= 7 ? "HIGH" : "MEDIUM",
      message: `Client contract for ${cc.client.name}${cc.site ? ` (${cc.site.siteName})` : ""} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
      referenceId: cc.id,
      referenceType: "ClientContract",
      data: {
        clientName: cc.client.name,
        siteName: cc.site?.siteName ?? null,
        endDate: cc.endDate,
        daysLeft,
      },
    });
  }

  const employeeContracts = await prisma.employeeContract.findMany({
    where: {
      status: { notIn: ["EXPIRED", "INACTIVE"] },
      endDate: { gte: now, lte: cutoff },
    },
    include: { employee: { select: { fullName: true } } },
    orderBy: { endDate: "asc" },
  });

  for (const ec of employeeContracts) {
    const daysLeft = daysFromNow(ec.endDate);
    alerts.push({
      category: "CONTRACT_EXPIRING",
      severity: daysLeft <= 7 ? "HIGH" : "MEDIUM",
      message: `Employee contract for ${ec.employee.fullName} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
      referenceId: ec.id,
      referenceType: "EmployeeContract",
      data: {
        employeeName: ec.employee.fullName,
        endDate: ec.endDate,
        daysLeft,
      },
    });
  }

  return alerts;
}

// ---- Company property not returned ----
async function propertyNotReturnedAlerts(): Promise<Alert[]> {
  const cutoff = new Date(Date.now() - PROPERTY_OVERDUE_DAYS * 86_400_000);

  const items = await prisma.inventoryItem.findMany({
    where: {
      takenHome: true,
      takenHomeAt: { lt: cutoff },
    },
    include: {
      assignedToEmployee: { select: { fullName: true } },
    },
    orderBy: { takenHomeAt: "asc" },
  });

  return items.map((item) => {
    const daysTaken = daysAgo(item.takenHomeAt!);
    return {
      category: "PROPERTY_NOT_RETURNED",
      severity: daysTaken > 30 ? "CRITICAL" : daysTaken > 14 ? "HIGH" : "MEDIUM",
      message: `${item.name} (${item.serialNumber ?? item.id.slice(0, 8)}) has not been returned by ${item.assignedToEmployee?.fullName ?? "unknown"} — ${daysTaken} day${daysTaken === 1 ? "" : "s"} overdue.`,
      referenceId: item.id,
      referenceType: "InventoryItem",
      data: {
        itemName: item.name,
        serialNumber: item.serialNumber,
        assignedTo: item.assignedToEmployee?.fullName ?? null,
        takenHomeAt: item.takenHomeAt,
        daysTaken,
      },
    };
  });
}

// ---- Company property still with an absconded employee ----
// Added 2026-09-25, per explicit instruction ("officers who desert the
// site and run away with company property"). Unlike PROPERTY_NOT_RETURNED
// above, this doesn't wait on the 7-day "taken home" threshold or even
// require canTakeHome/takenHome to be set — uniforms/equipment are often
// just assigned, not formally "taken home". Any item still assigned to
// an employee marked ABSCONDED is flagged immediately, at CRITICAL
// severity, since the person is already gone.
async function propertyWithAbscondedEmployeeAlerts(): Promise<Alert[]> {
  const items = await prisma.inventoryItem.findMany({
    where: {
      assignedToEmployeeId: { not: null },
      assignedToEmployee: { employmentStatus: "ABSCONDED" },
    },
    include: {
      assignedToEmployee: { select: { fullName: true } },
    },
  });

  return items.map((item) => ({
    category: "PROPERTY_WITH_ABSCONDED_EMPLOYEE",
    severity: "CRITICAL",
    message: `${item.name} (${item.serialNumber ?? item.id.slice(0, 8)}) is still assigned to ${item.assignedToEmployee?.fullName ?? "an employee"}, who has been marked as absconded.`,
    referenceId: item.id,
    referenceType: "InventoryItem",
    data: {
      itemName: item.name,
      serialNumber: item.serialNumber,
      assignedTo: item.assignedToEmployee?.fullName ?? null,
    },
  }));
}

// ---- Tasks overdue ----
async function taskOverdueAlerts(): Promise<Alert[]> {
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: {
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      dueDate: { lt: now },
    },
    include: {
      assignedToEmployee: { select: { fullName: true } },
      department: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  return tasks.map((task) => {
    const daysOverdue = daysAgo(task.dueDate!);
    return {
      category: "TASK_OVERDUE",
      severity: task.priority === "CRITICAL" || task.priority === "URGENT" ? "HIGH" : "MEDIUM",
      message: `Task "${task.title}" is overdue by ${daysOverdue} day${daysOverdue === 1 ? "" : "s"}${task.assignedToEmployee ? ` — assigned to ${task.assignedToEmployee.fullName}` : ""}${task.department ? ` (${task.department.name})` : ""}.`,
      referenceId: task.id,
      referenceType: "Task",
      data: {
        title: task.title,
        priority: task.priority,
        dueDate: task.dueDate,
        assignedTo: task.assignedToEmployee?.fullName ?? null,
        department: task.department?.name ?? null,
        daysOverdue,
      },
    };
  });
}

// ---- Low stock ----
async function lowStockAlerts(): Promise<Alert[]> {
  const items = await prisma.inventoryItem.findMany({
    where: {
      itemType: "CONSUMABLE",
      status: "ACTIVE",
      quantity: { lte: LOW_STOCK_THRESHOLD },
    },
    orderBy: { quantity: "asc" },
  });

  return items.map((item) => ({
    category: "LOW_STOCK",
    severity: item.quantity === 0 ? "CRITICAL" : item.quantity <= 2 ? "HIGH" : "MEDIUM",
    message: `${item.name} stock is low — ${item.quantity} ${item.unitOfMeasure ?? "unit(s)"} remaining.`,
    referenceId: item.id,
    referenceType: "InventoryItem",
    data: {
      itemName: item.name,
      category: item.category,
      quantity: item.quantity,
      unitOfMeasure: item.unitOfMeasure,
    },
  }));
}

// ---- Payroll due ----
async function payrollDueAlerts(): Promise<Alert[]> {
  const now = new Date();
  const daysUntilMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

  if (daysUntilMonthEnd > PAYROLL_DUE_WARN_DAYS) return [];

  // Check if a payroll run exists for this month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const existing = await prisma.payrollRun.findFirst({
    where: {
      period: { gte: monthStart, lte: monthEnd },
      status: { notIn: ["DRAFT"] },
    },
  });

  if (existing) return [];

  return [
    {
      category: "PAYROLL_DUE",
      severity: daysUntilMonthEnd <= 2 ? "CRITICAL" : daysUntilMonthEnd <= 4 ? "HIGH" : "MEDIUM",
      message: `Payroll for ${now.toLocaleString("default", { month: "long", year: "numeric" })} has not been processed — ${daysUntilMonthEnd} day${daysUntilMonthEnd === 1 ? "" : "s"} until end of month.`,
      referenceId: "payroll",
      referenceType: "PayrollRun",
      data: {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        daysUntilMonthEnd,
      },
    },
  ];
}

// ---- Roster gaps ----
async function rosterGapAlerts(): Promise<Alert[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  // Get unique sites that have requirements
  const requirements = await prisma.siteRequirement.findMany({
    include: { site: { select: { id: true, siteName: true } } },
  });

  // Deduplicate by siteId
  const uniqueSites = new Map<string, { siteId: string; siteName: string }>();
  for (const req of requirements) {
    if (!uniqueSites.has(req.siteId)) {
      uniqueSites.set(req.siteId, { siteId: req.siteId, siteName: req.site.siteName });
    }
  }

  const alerts: Alert[] = [];

  for (const { siteId, siteName } of uniqueSites.values()) {
    const rosterCount = await prisma.rosterEntry.count({
      where: {
        siteId,
        date: { gte: today, lt: tomorrow },
        status: "SCHEDULED",
      },
    });

    if (rosterCount === 0) {
      alerts.push({
        category: "ROSTER_GAP",
        severity: "HIGH",
        message: `No officers rostered at ${siteName} for today.`,
        referenceId: siteId,
        referenceType: "Site",
        data: { siteName, siteId, date: today },
      });
    }
  }

  return alerts;
}

// Statuses that count as "someone is actually there", mirrors the same
// list operations.service.ts uses for its coverage-percent calculation.
const SITE_MANNED_STATUSES = ["PRESENT", "REPLACEMENT", "EXTRA_SHIFT"];

// Zambia doesn't observe DST, but computing the hour via Intl instead of a
// hardcoded UTC+2 offset means this keeps working correctly even if the
// server's own OS timezone changes (e.g. moving hosts/regions).
function lusakaHourNow(): number {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lusaka",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return parseInt(hourStr, 10);
}

const SITE_UNMANNED_START_HOUR = 18;

// ---- Unmanned sites (evening check) ----
// Explicit instruction: "App must be able to send notifications after
// 18:00 if any site is unmanned." Deliberately separate from ROSTER_GAP
// above: ROSTER_GAP fires all day the moment nothing is scheduled (an
// early warning), while this one only starts firing in the evening and
// also accounts for actual attendance — a site with someone SCHEDULED but
// marked ABSENT with no replacement logged is just as unmanned as one with
// no roster entry at all.
async function siteUnmannedAlerts(): Promise<Alert[]> {
  if (lusakaHourNow() < SITE_UNMANNED_START_HOUR) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const requirements = await prisma.siteRequirement.findMany({
    include: { site: { select: { id: true, siteName: true } } },
  });
  const uniqueSites = new Map<string, { siteId: string; siteName: string }>();
  for (const req of requirements) {
    if (!uniqueSites.has(req.siteId)) {
      uniqueSites.set(req.siteId, { siteId: req.siteId, siteName: req.site.siteName });
    }
  }

  const alerts: Alert[] = [];

  for (const { siteId, siteName } of uniqueSites.values()) {
    const opsRecord = await prisma.operationsRecord.findFirst({
      where: { siteId, date: { gte: today, lt: tomorrow } },
      include: { attendanceRecords: { select: { status: true } } },
    });

    let manned: boolean;
    if (opsRecord) {
      // Attendance has actually been logged for today — trust it over the
      // roster, since it reflects who really showed up.
      manned = opsRecord.attendanceRecords.some((a) => SITE_MANNED_STATUSES.includes(a.status));
    } else {
      // Nothing logged yet today — fall back to whether anyone was even
      // scheduled.
      const rosterCount = await prisma.rosterEntry.count({
        where: { siteId, date: { gte: today, lt: tomorrow }, status: "SCHEDULED" },
      });
      manned = rosterCount > 0;
    }

    if (!manned) {
      alerts.push({
        category: "SITE_UNMANNED",
        severity: "CRITICAL",
        message: `${siteName} is unmanned — no officer has been confirmed on site today, and it is now past 18:00.`,
        referenceId: siteId,
        referenceType: "Site",
        data: { siteName, siteId, date: today },
      });
    }
  }

  return alerts;
}

// ---- Main aggregator ----

const CATEGORY_RUNNERS: Record<AlertCategory, () => Promise<Alert[]>> = {
  INVOICE_OVERDUE: invoiceOverdueAlerts,
  CONTRACT_EXPIRING: contractExpiringAlerts,
  PROPERTY_NOT_RETURNED: propertyNotReturnedAlerts,
  PROPERTY_WITH_ABSCONDED_EMPLOYEE: propertyWithAbscondedEmployeeAlerts,
  TASK_OVERDUE: taskOverdueAlerts,
  LOW_STOCK: lowStockAlerts,
  PAYROLL_DUE: payrollDueAlerts,
  ROSTER_GAP: rosterGapAlerts,
  SITE_UNMANNED: siteUnmannedAlerts,
  INVOICE_DUE: invoiceDueAlerts,
  INVOICE_PAID: invoicePaidAlerts,
  CONTRACT_ENDED: contractEndedAlerts,
  DEPARTMENT_REQUEST_PENDING: departmentRequestPendingAlerts,
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * Categories that contain financial data — only ADMIN, MANAGER, PAYROLL
 * should receive these. All other roles get operational/HR alerts only.
 */
// Exported so push-notifier.ts can reuse the exact same finance gating
// when deciding who gets a push notification for a given alert.
export const FINANCE_CATEGORIES = new Set<AlertCategory>([
  "INVOICE_OVERDUE",
  "INVOICE_DUE",
  "INVOICE_PAID",
  "PAYROLL_DUE",
  "LOW_STOCK",
]);

export const FINANCE_ROLES = new Set(["ADMIN", "MANAGER", "PAYROLL"]);

/**
 * Categories that are cross-department, Admin/Management-facing items
 * (e.g. another department's request awaiting review) — added
 * 2026-09-25. Ordinary STAFF/PAYROLL/etc. roles never see these; only
 * ADMIN and MANAGER do, same audience that actually reviews/approves
 * DepartmentRequests (see department-requests module).
 */
export const MANAGEMENT_CATEGORIES = new Set<AlertCategory>([
  "DEPARTMENT_REQUEST_PENDING",
]);
export const MANAGEMENT_ROLES = new Set(["ADMIN", "MANAGER"]);

export async function getAlerts(category?: AlertCategory, role = "STAFF"): Promise<Alert[]> {
  const canSeeFinance = FINANCE_ROLES.has(role);
  const canSeeManagement = MANAGEMENT_ROLES.has(role);

  let categories: AlertCategory[];
  if (category) {
    // Single-category filter: respect it but still gate finance/management categories
    if (FINANCE_CATEGORIES.has(category) && !canSeeFinance) return [];
    if (MANAGEMENT_CATEGORIES.has(category) && !canSeeManagement) return [];
    categories = [category];
  } else {
    categories = (Object.keys(CATEGORY_RUNNERS) as AlertCategory[]).filter(
      (c) =>
        (canSeeFinance || !FINANCE_CATEGORIES.has(c)) &&
        (canSeeManagement || !MANAGEMENT_CATEGORIES.has(c))
    );
  }

  const results = await Promise.all(categories.map((c) => CATEGORY_RUNNERS[c]()));
  const flat = results.flat();

  // Sort by severity (CRITICAL first), then category
  flat.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return a.category.localeCompare(b.category);
  });

  return flat;
}

export function getValidCategories(): AlertCategory[] {
  return Object.keys(CATEGORY_RUNNERS) as AlertCategory[];
}
