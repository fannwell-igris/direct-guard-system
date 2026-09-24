import { prisma } from "../../lib/prisma";
import { sendPushToTokens, isPushConfigured } from "../../lib/push";
import { getAlerts, Alert, AlertCategory, FINANCE_CATEGORIES, FINANCE_ROLES } from "./alerts.service";

// Only push HIGH/CRITICAL alerts — MEDIUM/LOW stay in-app-only (the
// existing GET /api/alerts feed already surfaces those) so notifications
// don't turn into noise nobody reads.
const PUSHABLE_SEVERITIES = new Set(["HIGH", "CRITICAL"]);
const SEVERITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

// Non-finance alerts (contract expiring, roster gap, etc.) go to whoever
// has overall oversight — Admin/Manager. Finance-flagged alerts go to
// FINANCE_ROLES instead (same audience the in-app alerts feed already
// gates them to).
const OPS_RECIPIENT_ROLES = ["ADMIN", "MANAGER"];

const CATEGORY_TITLES: Record<AlertCategory, string> = {
  INVOICE_OVERDUE: "Invoice Overdue",
  CONTRACT_EXPIRING: "Contract Expiring",
  PROPERTY_NOT_RETURNED: "Property Not Returned",
  TASK_OVERDUE: "Task Overdue",
  LOW_STOCK: "Low Stock",
  PAYROLL_DUE: "Payroll Due",
  ROSTER_GAP: "Roster Gap",
};

function alertKey(a: Pick<Alert, "category" | "referenceId">): string {
  return `${a.category}:${a.referenceId}`;
}

/**
 * Re-checks the live alerts feed and pushes a notification for anything
 * new or escalated since the last run. Safe to call on a timer — it's a
 * total no-op if Firebase isn't configured (see lib/push.ts), and it only
 * ever sends once per alert per severity level thanks to
 * SentAlertNotification, so calling it more often than necessary just
 * wastes a bit of DB/CPU time, not user-facing spam.
 */
export async function checkAndPushAlerts(): Promise<void> {
  if (!isPushConfigured()) return;

  // ADMIN sees every category with no finance gating applied — the one
  // call this notifier needs to see the full picture, then it applies
  // its own recipient targeting per alert below.
  const alerts = await getAlerts(undefined, "ADMIN");
  const pushable = alerts.filter((a) => PUSHABLE_SEVERITIES.has(a.severity));

  const existing = await prisma.sentAlertNotification.findMany();
  const existingByKey = new Map(existing.map((e) => [`${e.category}:${e.referenceId}`, e]));

  if (pushable.length === 0) {
    // Nothing pushable right now — but still clear out any stale
    // notification records below so a later recurrence isn't silently
    // skipped as "already sent".
    if (existing.length > 0) {
      await prisma.sentAlertNotification.deleteMany({});
    }
    return;
  }

  const [financeUsers, opsUsers] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: Array.from(FINANCE_ROLES) }, isActive: true },
      include: { deviceTokens: true },
    }),
    prisma.user.findMany({
      where: { role: { in: OPS_RECIPIENT_ROLES }, isActive: true },
      include: { deviceTokens: true },
    }),
  ]);

  const financeTokens = Array.from(
    new Set(financeUsers.flatMap((u) => u.deviceTokens.map((t) => t.token)))
  );
  const opsTokens = Array.from(
    new Set(opsUsers.flatMap((u) => u.deviceTokens.map((t) => t.token)))
  );

  const currentKeys = new Set(pushable.map(alertKey));
  const allInvalidTokens = new Set<string>();

  for (const alert of pushable) {
    const key = alertKey(alert);
    const prior = existingByKey.get(key);

    // Skip if we already notified about this exact alert at this
    // severity or worse — only re-notify when it's new or has escalated.
    if (prior && SEVERITY_RANK[prior.severity] >= SEVERITY_RANK[alert.severity]) {
      continue;
    }

    const tokens = FINANCE_CATEGORIES.has(alert.category) ? financeTokens : opsTokens;
    if (tokens.length > 0) {
      const result = await sendPushToTokens(
        tokens,
        CATEGORY_TITLES[alert.category] ?? "Magen CMS Alert",
        alert.message,
        { category: alert.category, referenceId: alert.referenceId }
      );
      result.invalidTokens.forEach((t) => allInvalidTokens.add(t));
    }

    await prisma.sentAlertNotification.upsert({
      where: { category_referenceId: { category: alert.category, referenceId: alert.referenceId } },
      create: { category: alert.category, referenceId: alert.referenceId, severity: alert.severity },
      update: { severity: alert.severity, sentAt: new Date() },
    });
  }

  // Clean up notification records for alerts that no longer exist (the
  // underlying issue was resolved) so a future recurrence notifies again
  // instead of being mistaken for "already handled".
  const staleKeys = existing
    .map((e) => `${e.category}:${e.referenceId}`)
    .filter((k) => !currentKeys.has(k));
  if (staleKeys.length > 0) {
    await Promise.all(
      staleKeys.map((k) => {
        const idx = k.indexOf(":");
        const category = k.slice(0, idx);
        const referenceId = k.slice(idx + 1);
        return prisma.sentAlertNotification.deleteMany({ where: { category, referenceId } });
      })
    );
  }

  if (allInvalidTokens.size > 0) {
    await prisma.deviceToken.deleteMany({ where: { token: { in: Array.from(allInvalidTokens) } } });
  }
}
