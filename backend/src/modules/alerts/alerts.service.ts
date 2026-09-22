import { prisma } from "../../lib/prisma";

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AlertCategory =
  | "INVOICE_OVERDUE"
  | "CONTRACT_EXPIRING"
  | "PROPERTY_NOT_RETURNED"
  | "TASK_OVERDUE"
  | "LOW_STOCK"
  | "PAYROLL_DUE"
  | "ROSTER_GAP";

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

// ---- Main aggregator ----

const CATEGORY_RUNNERS: Record<AlertCategory, () => Promise<Alert[]>> = {
  INVOICE_OVERDUE: invoiceOverdueAlerts,
  CONTRACT_EXPIRING: contractExpiringAlerts,
  PROPERTY_NOT_RETURNED: propertyNotReturnedAlerts,
  TASK_OVERDUE: taskOverdueAlerts,
  LOW_STOCK: lowStockAlerts,
  PAYROLL_DUE: payrollDueAlerts,
  ROSTER_GAP: rosterGapAlerts,
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
const FINANCE_CATEGORIES = new Set<AlertCategory>([
  "INVOICE_OVERDUE",
  "PAYROLL_DUE",
  "LOW_STOCK",
]);

const FINANCE_ROLES = new Set(["ADMIN", "MANAGER", "PAYROLL"]);

export async function getAlerts(category?: AlertCategory, role = "STAFF"): Promise<Alert[]> {
  const canSeeFinance = FINANCE_ROLES.has(role);

  let categories: AlertCategory[];
  if (category) {
    // Single-category filter: respect it but still gate finance categories
    if (FINANCE_CATEGORIES.has(category) && !canSeeFinance) return [];
    categories = [category];
  } else {
    categories = (Object.keys(CATEGORY_RUNNERS) as AlertCategory[]).filter(
      (c) => canSeeFinance || !FINANCE_CATEGORIES.has(c)
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
