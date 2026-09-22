import { ContractStatus } from "@prisma/client";

// TEMPORARY DEFAULT — Section 9 of the spec says "the exact alert
// thresholds should be configurable" via a future Settings module, which
// does not exist yet. Until Settings is built, this fixed 30-day window is
// used for every contract. Move this into a real configurable setting when
// Settings is built — search the codebase for CONTRACT_EXPIRING_SOON_DAYS
// to find every place that needs updating.
export const CONTRACT_EXPIRING_SOON_DAYS = 30;

/**
 * Calculates contract status from start/end dates. Never trust a status
 * passed in by the client - always derive it server-side so it can't go
 * stale or be spoofed.
 *
 * - INACTIVE: contract hasn't started yet (startDate is in the future)
 * - EXPIRED: endDate has already passed
 * - EXPIRING_SOON: endDate falls within CONTRACT_EXPIRING_SOON_DAYS
 * - ACTIVE: currently running, not yet within the expiring-soon window
 */
export function calculateContractStatus(startDate: Date, endDate: Date, now: Date = new Date()): ContractStatus {
  if (startDate.getTime() > now.getTime()) {
    return "INACTIVE";
  }

  if (endDate.getTime() < now.getTime()) {
    return "EXPIRED";
  }

  const msUntilExpiry = endDate.getTime() - now.getTime();
  const daysUntilExpiry = msUntilExpiry / (1000 * 60 * 60 * 24);

  if (daysUntilExpiry <= CONTRACT_EXPIRING_SOON_DAYS) {
    return "EXPIRING_SOON";
  }

  return "ACTIVE";
}

/**
 * Calculates a human-readable contract duration from start/end dates.
 * Never manually entered by the user (Section 9 requirement) - always
 * derived from the two dates.
 */
export function calculateDurationDays(startDate: Date, endDate: Date): number {
  const msDiff = endDate.getTime() - startDate.getTime();
  return Math.round(msDiff / (1000 * 60 * 60 * 24));
}
