import { StatutoryRule, DeductionType } from "@prisma/client";

type RuleWithDeductionType = StatutoryRule & { deductionType: DeductionType };

interface Bracket {
  min: number;
  max: number | null;
  rate: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Progressive bracket calculation: each bracket's rate applies only to the
 * slice of `amount` that falls within that band, not the whole amount.
 * `max: null` means "and above" (the top/last bracket).
 */
function calculateBracketed(amount: number, brackets: Bracket[]): number {
  let total = 0;
  for (const b of brackets) {
    if (amount <= b.min) continue;
    const upper = b.max === null ? amount : Math.min(amount, b.max);
    const slice = upper - b.min;
    if (slice > 0) total += slice * b.rate;
  }
  return total;
}

/**
 * Computes the employee-side amount for one statutory rule against a given
 * gross pay figure. Always applied to gross pay per the user's 2026-09-11
 * decision — not basic salary, not a per-rule choice.
 */
export function calculateStatutoryAmount(rule: StatutoryRule, grossPay: number): number {
  if (rule.ruleType === "PERCENTAGE") {
    return round2(grossPay * Number(rule.employeeRate ?? 0));
  }
  if (rule.ruleType === "FIXED") {
    return round2(Number(rule.employeeRate ?? 0));
  }
  // BRACKETED
  const config = rule.config as { brackets: Bracket[] } | null;
  if (!config || !Array.isArray(config.brackets)) {
    return 0;
  }
  return round2(calculateBracketed(grossPay, config.brackets));
}

/**
 * Computes the employer-side amount for one statutory rule against a given
 * gross pay figure — same basis (gross pay) as the employee side, for
 * consistency with calculateStatutoryAmount above. Uses `employerRate`
 * instead of `employeeRate`.
 *
 * BRACKETED rules (PAYE) always return 0 here: per the schema, `employerRate`
 * is only ever set for PERCENTAGE/FIXED rules and is null for BRACKETED
 * ones, which matches reality — PAYE has no employer-side contribution.
 */
export function calculateStatutoryEmployerAmount(rule: StatutoryRule, grossPay: number): number {
  if (rule.ruleType === "PERCENTAGE") {
    return round2(grossPay * Number(rule.employerRate ?? 0));
  }
  if (rule.ruleType === "FIXED") {
    return round2(Number(rule.employerRate ?? 0));
  }
  // BRACKETED — no employer bracket structure defined anywhere; employer
  // contribution is 0 for this rule type.
  return 0;
}

/**
 * Whether a given employee is subject to this rule at all. NAPSA/NHIMA are
 * opt-in (gated by Employee.napsaRegistered/nhimaRegistered); everything
 * else — including PAYE — applies unconditionally, since income tax isn't
 * a registration choice.
 *
 * Matched by the rule's linked DeductionType name (case-insensitive) since
 * that's the only stable "what kind of statutory item is this" signal
 * available — there's no separate category enum on StatutoryRule itself.
 * If a company renames its NAPSA DeductionType to something that doesn't
 * contain "NAPSA", this eligibility gate silently stops applying — flagged
 * as a known limitation, not a defended design choice.
 */
export function isEligibleForRule(
  rule: RuleWithDeductionType,
  employee: { napsaRegistered: boolean; nhimaRegistered: boolean }
): boolean {
  const name = rule.deductionType.name.toUpperCase();
  if (name.includes("NAPSA")) return employee.napsaRegistered;
  if (name.includes("NHIMA")) return employee.nhimaRegistered;
  return true;
}
