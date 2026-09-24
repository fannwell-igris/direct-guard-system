import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { VISIT_UPLOAD_DIR_PATH } from "../../middleware/uploadMiddleware";
import { FieldVisitCreateInput, FieldVisitUpdateInput, FieldVisitListQuery } from "./field-visits.validation";

const INCLUDE = {
  prospect: { select: { id: true, companyName: true } },
  client: { select: { id: true, name: true } },
  marketer: { select: { id: true, fullName: true } },
};

export async function createVisit(input: FieldVisitCreateInput, marketerId: string | null) {
  if (input.prospectId) await ensureProspectExists(input.prospectId);
  if (input.clientId) await ensureClientExists(input.clientId);

  return prisma.fieldVisit.create({
    data: {
      prospectId: input.prospectId,
      clientId: input.clientId,
      visitDate: input.visitDate ?? new Date(),
      location: input.location,
      personVisited: input.personVisited,
      purpose: input.purpose,
      outcome: input.outcome,
      opportunitiesIdentified: input.opportunitiesIdentified,
      nextAction: input.nextAction,
      followUpDate: input.followUpDate,
      notes: input.notes,
      marketerId,
    },
    include: INCLUDE,
  });
}

/**
 * Lists visits with optional filters, paginated, most recent first — what
 * the brief's "field activity by person, week, month, location, outcome"
 * view (section 5) reads from.
 */
export async function listVisits(query: FieldVisitListQuery) {
  const where: Prisma.FieldVisitWhereInput = {};

  if (query.prospectId) where.prospectId = query.prospectId;
  if (query.clientId) where.clientId = query.clientId;
  if (query.marketerId) where.marketerId = query.marketerId;
  if (query.dateFrom || query.dateTo) {
    where.visitDate = {
      ...(query.dateFrom ? { gte: query.dateFrom } : {}),
      ...(query.dateTo ? { lte: query.dateTo } : {}),
    };
  }

  const [total, data] = await Promise.all([
    prisma.fieldVisit.count({ where }),
    prisma.fieldVisit.findMany({
      where,
      orderBy: { visitDate: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: INCLUDE,
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

export async function getVisitById(id: string) {
  const visit = await prisma.fieldVisit.findUnique({ where: { id }, include: INCLUDE });
  if (!visit) throw ApiError.notFound(`Field visit ${id} not found.`);
  return visit;
}

export async function updateVisit(id: string, input: FieldVisitUpdateInput) {
  await ensureVisitExists(id);
  if (input.prospectId) await ensureProspectExists(input.prospectId);
  if (input.clientId) await ensureClientExists(input.clientId);

  return prisma.fieldVisit.update({ where: { id }, data: input, include: INCLUDE });
}

/** Hard delete — a genuine correction, same convention as MarketingActivity/Payments. */
export async function deleteVisit(id: string) {
  const visit = await ensureVisitExists(id);
  if (visit.attachmentFilename) deleteAttachmentFile(visit.attachmentFilename);
  await prisma.fieldVisit.delete({ where: { id } });
}

// ---- Attachment (supporting photo/document) ----

export async function saveAttachment(id: string, filename: string) {
  const visit = await ensureVisitExists(id);
  if (visit.attachmentFilename) deleteAttachmentFile(visit.attachmentFilename);

  return prisma.fieldVisit.update({
    where: { id },
    data: { attachmentFilename: filename },
    include: INCLUDE,
  });
}

export async function getAttachmentPath(id: string): Promise<string> {
  const visit = await prisma.fieldVisit.findUnique({ where: { id }, select: { id: true, attachmentFilename: true } });
  if (!visit) throw ApiError.notFound(`Field visit ${id} not found.`);
  if (!visit.attachmentFilename) throw ApiError.notFound(`Field visit ${id} has no attachment.`);

  const filePath = path.join(VISIT_UPLOAD_DIR_PATH, visit.attachmentFilename);
  if (!fs.existsSync(filePath)) {
    await prisma.fieldVisit.update({ where: { id }, data: { attachmentFilename: null } });
    throw ApiError.notFound(`Field visit ${id} attachment file not found.`);
  }
  return filePath;
}

export async function removeAttachment(id: string) {
  const visit = await ensureVisitExists(id);
  if (!visit.attachmentFilename) throw ApiError.badRequest(`Field visit ${id} has no attachment to delete.`);

  deleteAttachmentFile(visit.attachmentFilename);

  return prisma.fieldVisit.update({
    where: { id },
    data: { attachmentFilename: null },
    include: INCLUDE,
  });
}

async function ensureVisitExists(id: string) {
  const visit = await prisma.fieldVisit.findUnique({ where: { id }, select: { id: true, attachmentFilename: true } });
  if (!visit) throw ApiError.notFound(`Field visit ${id} not found.`);
  return visit;
}

async function ensureProspectExists(id: string) {
  const exists = await prisma.prospect.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.badRequest(`Prospect ${id} does not exist.`);
}

async function ensureClientExists(id: string) {
  const exists = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.badRequest(`Client ${id} does not exist.`);
}

function deleteAttachmentFile(filename: string) {
  try {
    const filePath = path.join(VISIT_UPLOAD_DIR_PATH, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup — a failed delete here shouldn't block the request.
  }
}
