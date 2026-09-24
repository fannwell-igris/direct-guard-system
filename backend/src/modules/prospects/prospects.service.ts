import { Prisma, ProspectStage } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  ProspectCreateInput,
  ProspectUpdateInput,
  ProspectListQuery,
} from "./prospects.validation";

const ASSIGNED_TO_SELECT = { select: { id: true, fullName: true, role: true } };

/**
 * Users a prospect can be assigned to. Deliberately its own narrow query
 * rather than reusing /api/users (ADMIN-only — see permissions.ts) so
 * MARKETING staff can populate an assignee dropdown without opening up the
 * full user-management endpoint to a non-admin role.
 */
export async function listAssignableUsers() {
  return prisma.user.findMany({
    where: { role: { in: ["MARKETING", "ADMIN", "MANAGER"] }, isActive: true },
    select: { id: true, fullName: true, role: true },
    orderBy: { fullName: "asc" },
  });
}

/**
 * Creates a new prospect. Always starts at stage NEW (schema default) and
 * an initial stage-history row is written here so the funnel/timeline view
 * has a starting point to render, same as any later stage change.
 */
export async function createProspect(input: ProspectCreateInput, createdById: string | null) {
  const prospect = await prisma.prospect.create({
    data: {
      companyName: input.companyName,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      location: input.location,
      potentialService: input.potentialService,
      source: input.source,
      assignedToId: input.assignedToId,
      nextFollowUpDate: input.nextFollowUpDate,
      opportunityValue: input.opportunityValue,
      notes: input.notes,
      stageHistory: {
        create: {
          fromStage: null,
          toStage: "NEW",
          changedById: createdById,
        },
      },
    },
    include: { assignedTo: ASSIGNED_TO_SELECT },
  });
  return prospect;
}

/**
 * Lists prospects with optional free-text search (company/contact/location),
 * stage filter, assignee filter, and a "follow-up due" filter (next follow-up
 * date is today or earlier), paginated. Ordered so prospects needing
 * attention soonest surface first: overdue/no-date-set follow-ups can't be
 * ordered meaningfully across a NULL column with a single Prisma orderBy,
 * so the default order is most-recently-added first, and the dedicated
 * `followUpDue` filter is how the UI surfaces "what needs attention today"
 * from the marketing brief instead.
 */
export async function listProspects(query: ProspectListQuery) {
  const where: Prisma.ProspectWhereInput = {};

  if (query.stage) {
    where.stage = query.stage;
  }

  if (query.assignedToId) {
    where.assignedToId = query.assignedToId;
  }

  if (query.followUpDue) {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    where.nextFollowUpDate = { lte: endOfToday };
    where.stage = where.stage ?? { notIn: ["WON", "LOST", "NOT_INTERESTED"] };
  }

  if (query.search) {
    where.OR = [
      { companyName: { contains: query.search, mode: "insensitive" } },
      { contactName: { contains: query.search, mode: "insensitive" } },
      { contactPhone: { contains: query.search, mode: "insensitive" } },
      { contactEmail: { contains: query.search, mode: "insensitive" } },
      { location: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [total, data] = await Promise.all([
    prisma.prospect.count({ where }),
    prisma.prospect.findMany({
      where,
      orderBy: { dateAdded: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { assignedTo: ASSIGNED_TO_SELECT },
    }),
  ]);

  return {
    data,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

/** Fetches a single prospect with its assignee and full stage history. */
export async function getProspectById(id: string) {
  const prospect = await prisma.prospect.findUnique({
    where: { id },
    include: {
      assignedTo: ASSIGNED_TO_SELECT,
      stageHistory: {
        orderBy: { changedAt: "desc" },
        include: { changedBy: { select: { id: true, fullName: true } } },
      },
    },
  });

  if (!prospect) {
    throw ApiError.notFound(`Prospect ${id} not found.`);
  }

  return prospect;
}

/** Updates editable fields on a prospect. Does not touch `stage` — use changeStage for that. */
export async function updateProspect(id: string, input: ProspectUpdateInput) {
  await ensureProspectExists(id);

  return prisma.prospect.update({
    where: { id },
    data: input,
    include: { assignedTo: ASSIGNED_TO_SELECT },
  });
}

/**
 * Moves a prospect to a new stage, appending a ProspectStageHistory row
 * (never overwriting) so the funnel/conversion reporting in a later phase
 * has a full, honest trail to compute from.
 */
export async function changeStage(
  id: string,
  input: { stage: ProspectStage; notes?: string | null },
  changedById: string | null
) {
  const current = await ensureProspectExists(id);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.prospect.update({
      where: { id },
      data: {
        stage: input.stage,
        // A stage change is itself a form of contact/progress, so it's a
        // reasonable default to also bump lastContactDate here — but only
        // when actually moving forward from NEW, not for a correction back
        // to NEW itself.
        ...(input.stage !== "NEW" ? { lastContactDate: new Date() } : {}),
      },
      include: { assignedTo: ASSIGNED_TO_SELECT },
    });

    await tx.prospectStageHistory.create({
      data: {
        prospectId: id,
        fromStage: current.stage,
        toStage: input.stage,
        notes: input.notes,
        changedById,
      },
    });

    return updated;
  });
}

async function ensureProspectExists(id: string) {
  const exists = await prisma.prospect.findUnique({ where: { id }, select: { id: true, stage: true } });
  if (!exists) {
    throw ApiError.notFound(`Prospect ${id} not found.`);
  }
  return exists;
}
