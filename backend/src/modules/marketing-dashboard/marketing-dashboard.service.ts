import { ProspectStage } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { DashboardQuery } from "./marketing-dashboard.validation";

// LOST and NOT_INTERESTED are folded together everywhere below — both are
// "didn't convert" outcomes for a marketing dashboard's purposes, per the
// brief's funnel ending in a single "Lost" branch. They're still stored
// as distinct stages (a genuine "not interested" vs. a competitive loss is
// a real difference worth keeping in the data), just combined for display.
const TERMINAL_LOST: ProspectStage[] = ["LOST", "NOT_INTERESTED"];
const TERMINAL_STAGES: ProspectStage[] = ["WON", ...TERMINAL_LOST];

// Funnel order per the brief: Prospects -> Contacted -> Qualified ->
// Meeting -> Proposal -> Negotiation -> Won/Lost.
const FUNNEL_STAGES: ProspectStage[] = ["NEW", "CONTACTED", "QUALIFIED", "MEETING", "PROPOSAL_SENT", "NEGOTIATION"];

function stageLabel(s: string): string {
  const overrides: Record<string, string> = { NEW: "Prospects", PROPOSAL_SENT: "Proposal" };
  if (overrides[s]) return overrides[s];
  return s.replace(/_/g, " ").replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

/**
 * Resolves the period selector into an actual date range. "Today"/"This
 * Week"/"This Month" all run from the start of that period through right
 * now (not a fixed end-of-day), matching how a dashboard checked mid-day
 * is normally read — "so far this week", not "all of this week including
 * the future". Uses the server's local time; if that ever needs to be
 * Zambia-time-explicit regardless of host timezone, revisit here.
 */
function resolvePeriodRange(query: DashboardQuery): { from: Date; to: Date } {
  const now = new Date();
  if (query.period === "custom") {
    return { from: query.customFrom!, to: query.customTo! };
  }
  if (query.period === "today") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  if (query.period === "week") {
    const from = new Date(now);
    const day = from.getDay(); // 0 = Sunday
    const diffToMonday = day === 0 ? 6 : day - 1;
    from.setDate(from.getDate() - diffToMonday);
    from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  // month
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { from, to: now };
}

/**
 * Aggregates the Marketing Dashboard's numbers (brief section 1) and the
 * funnel breakdown, for the given period. Two different notions of "count"
 * are deliberately mixed here, each labeled for what it actually is:
 *  - period-scoped counts (new prospects added, stage transitions that
 *    happened, activities logged) — bounded by the selected period
 *  - as-of-now snapshots (follow-ups currently due, opportunities
 *    currently in progress, current pipeline value) — always "right now",
 *    since "opportunities in progress as of last month" isn't a
 *    meaningful question the way "proposals sent last month" is.
 */
export async function getDashboard(query: DashboardQuery) {
  const { from, to } = resolvePeriodRange(query);
  const periodFilter = { gte: from, lte: to };

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [
    newProspects,
    followUpsDue,
    opportunitiesInProgress,
    pipelineValueAgg,
    newClientsAllTime,
    lostAllTime,
    stageHistoryRows,
    activityGroups,
  ] = await Promise.all([
    prisma.prospect.count({ where: { dateAdded: periodFilter } }),
    prisma.prospect.count({
      where: { nextFollowUpDate: { lte: endOfToday }, stage: { notIn: TERMINAL_STAGES } },
    }),
    prisma.prospect.count({ where: { stage: { notIn: TERMINAL_STAGES } } }),
    prisma.prospect.aggregate({
      where: { stage: { notIn: TERMINAL_STAGES } },
      _sum: { opportunityValue: true },
    }),
    prisma.prospect.count({ where: { stage: "WON" } }),
    prisma.prospect.count({ where: { stage: { in: TERMINAL_LOST } } }),
    prisma.prospectStageHistory.findMany({
      where: { changedAt: periodFilter },
      select: { prospectId: true, toStage: true },
    }),
    prisma.marketingActivity.groupBy({
      by: ["type"],
      where: { activityDate: periodFilter },
      _count: { _all: true },
    }),
  ]);

  // Distinct prospects that transitioned INTO each stage during the
  // period — this is what makes it a funnel rather than a point-in-time
  // stage distribution (which would just show most old prospects sitting
  // at Won/Lost forever, not how many moved through each stage recently).
  const reachedByStage: Record<string, Set<string>> = {};
  for (const s of [...FUNNEL_STAGES, "WON", "LOST"]) reachedByStage[s] = new Set();
  for (const row of stageHistoryRows) {
    const bucket = TERMINAL_LOST.includes(row.toStage) ? "LOST" : row.toStage;
    if (reachedByStage[bucket]) reachedByStage[bucket].add(row.prospectId);
  }

  const funnel = [...FUNNEL_STAGES, "WON", "LOST"].map((stage) => ({
    stage,
    label: stageLabel(stage),
    count: reachedByStage[stage].size,
  }));

  const activityByType: Record<string, number> = {};
  for (const g of activityGroups) activityByType[g.type] = g._count._all;

  const meetingsLogged = activityByType["MEETING"] ?? 0;
  const proposalsQuotationsSent = (activityByType["PROPOSAL_SENT"] ?? 0) + (activityByType["QUOTATION_SENT"] ?? 0);
  const totalActivities = Object.values(activityByType).reduce((a, b) => a + b, 0);

  return {
    period: { type: query.period, from, to },
    metrics: {
      newProspects,
      qualifiedProspects: reachedByStage["QUALIFIED"].size,
      followUpsDue,
      meetingsLogged,
      proposalsQuotationsSent,
      newClientsAcquired: reachedByStage["WON"].size,
      opportunitiesInProgress,
      lostOpportunities: reachedByStage["LOST"].size,
      leadsConvertedAllTime: newClientsAllTime,
      lostAllTime,
      estimatedPipelineValue: pipelineValueAgg._sum.opportunityValue ?? 0,
      totalActivities,
    },
    activityByType,
    funnel,
  };
}
