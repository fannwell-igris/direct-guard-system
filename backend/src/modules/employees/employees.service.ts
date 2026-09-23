import { Prisma, EmploymentStatus } from "@prisma/client";
import path from "path";
import fs from "fs";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { UPLOAD_DIR_PATH } from "../../middleware/uploadMiddleware";
import {
  EmployeeCreateInput,
  EmployeeUpdateInput,
  EmployeeListQuery,
} from "./employees.validation";

/**
 * Creates a new employee. Validates that assignedClientId/assignedSiteId
 * (if provided) reference real records first, so the failure comes back as
 * a clean 400 rather than a raw Prisma foreign-key error.
 */
export async function createEmployee(input: EmployeeCreateInput) {
  if (input.assignedClientId) await ensureClientExists(input.assignedClientId);
  if (input.assignedSiteId) {
    await ensureSiteExists(input.assignedSiteId);
    ensurePositionIsGuard(input.position);
  }
  if (input.employeeNumber) await ensureEmployeeNumberAvailable(input.employeeNumber);

  return prisma.employee.create({
    data: {
      fullName: input.fullName,
      employeeNumber: input.employeeNumber,
      position: input.position,
      phone: input.phone,
      salary: input.salary,
      contractStartDate: input.contractStartDate,
      contractEndDate: input.contractEndDate,
      assignedClientId: input.assignedClientId,
      assignedSiteId: input.assignedSiteId,
      napsaRegistered: input.napsaRegistered,
      nhimaRegistered: input.nhimaRegistered,
      notes: input.notes,
      // employmentStatus defaults to ACTIVE per schema
    },
  });
}

/**
 * Lists employees with optional free-text search (fullName/position/phone),
 * employmentStatus filter, assignedClientId filter, and assignedSiteId
 * filter, paginated.
 */
export async function listEmployees(query: EmployeeListQuery) {
  const where: Prisma.EmployeeWhereInput = {};

  if (query.employmentStatus) {
    where.employmentStatus = query.employmentStatus;
  }

  if (query.assignedClientId) {
    where.assignedClientId = query.assignedClientId;
  }

  if (query.assignedSiteId) {
    where.assignedSiteId = query.assignedSiteId;
  }

  if (query.search) {
    where.OR = [
      { fullName: { contains: query.search, mode: "insensitive" } },
      { employeeNumber: { contains: query.search, mode: "insensitive" } },
      { position: { contains: query.search, mode: "insensitive" } },
      { phone: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [total, data] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      orderBy: { fullName: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      // Lightweight client/site reference + contract count for the list view.
      include: {
        assignedClient: { select: { id: true, name: true } },
        assignedSite: { select: { id: true, siteName: true } },
        _count: { select: { employeeContracts: true } },
      },
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

/** Fetches a single employee with related records for the detail view. */
export async function getEmployeeById(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      assignedClient: { select: { id: true, name: true, status: true } },
      assignedSite: { select: { id: true, siteName: true, status: true } },
      employeeContracts: {
        orderBy: { startDate: "desc" },
        take: 10,
      },
      _count: { select: { employeeContracts: true } },
    },
  });

  if (!employee) {
    throw ApiError.notFound(`Employee ${id} not found.`);
  }

  return employee;
}

/** Updates editable fields on an employee, including employmentStatus if provided. */
export async function updateEmployee(id: string, input: EmployeeUpdateInput) {
  const existing = await prisma.employee.findUnique({ where: { id }, select: { id: true, position: true } });
  if (!existing) {
    throw ApiError.notFound(`Employee ${id} not found.`);
  }

  if (input.assignedClientId) await ensureClientExists(input.assignedClientId);
  if (input.assignedSiteId) {
    await ensureSiteExists(input.assignedSiteId);
    // Position may not be part of this update — fall back to the
    // employee's existing position if the caller isn't changing it.
    const effectivePosition = input.position !== undefined ? input.position : existing.position;
    ensurePositionIsGuard(effectivePosition);
  }
  if (input.employeeNumber) await ensureEmployeeNumberAvailable(input.employeeNumber, id);

  return prisma.employee.update({
    where: { id },
    data: input,
  });
}

/**
 * Changes an employee's employmentStatus (ACTIVE / INACTIVE / TERMINATED).
 * This is the only supported "removal" path — employees are never
 * hard-deleted, consistent with Clients/Sites and Section 19's data
 * integrity rule (historical financial/contract data must remain accurate).
 */
export async function setEmploymentStatus(id: string, employmentStatus: EmploymentStatus) {
  await ensureEmployeeExists(id);

  return prisma.employee.update({
    where: { id },
    data: { employmentStatus },
  });
}

// ---- Photo functions ----

/**
 * Saves a newly uploaded photo filename to the employee record.
 * If the employee already has a photo, the old file is deleted from disk first.
 */
export async function saveEmployeePhoto(id: string, filename: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, photoFilename: true },
  });
  if (!employee) throw ApiError.notFound(`Employee ${id} not found.`);

  // Delete old photo from disk if one exists
  if (employee.photoFilename) {
    deletePhotoFile(employee.photoFilename);
  }

  return prisma.employee.update({
    where: { id },
    data: { photoFilename: filename },
  });
}

/**
 * Returns the absolute path to the employee's photo file.
 * Throws 404 if the employee has no photo or the file is missing from disk.
 */
export async function getEmployeePhotoPath(id: string): Promise<string> {
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, photoFilename: true },
  });
  if (!employee) throw ApiError.notFound(`Employee ${id} not found.`);
  if (!employee.photoFilename) throw ApiError.notFound(`Employee ${id} has no photo.`);

  const filePath = path.join(UPLOAD_DIR_PATH, employee.photoFilename);
  if (!fs.existsSync(filePath)) {
    // File missing from disk — clear the stale DB reference
    await prisma.employee.update({ where: { id }, data: { photoFilename: null } });
    throw ApiError.notFound(`Employee ${id} photo file not found.`);
  }

  return filePath;
}

/**
 * Removes an employee's photo — deletes from disk and clears the DB field.
 */
export async function removeEmployeePhoto(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, photoFilename: true },
  });
  if (!employee) throw ApiError.notFound(`Employee ${id} not found.`);
  if (!employee.photoFilename) throw ApiError.badRequest(`Employee ${id} has no photo to delete.`);

  deletePhotoFile(employee.photoFilename);

  return prisma.employee.update({
    where: { id },
    data: { photoFilename: null },
  });
}

// ---- helpers ----

function deletePhotoFile(filename: string) {
  try {
    const filePath = path.join(UPLOAD_DIR_PATH, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Non-fatal — log but don't crash if file is already gone
    console.warn(`Could not delete photo file: ${filename}`);
  }
}

async function ensureEmployeeExists(id: string) {
  const exists = await prisma.employee.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    throw ApiError.notFound(`Employee ${id} not found.`);
  }
}

async function ensureClientExists(clientId: string) {
  const exists = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Client ${clientId} does not exist.`);
  }
}

async function ensureSiteExists(siteId: string) {
  const exists = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Site ${siteId} does not exist.`);
  }
}

// `position` is free-text (see schema comment), so this is a
// case-insensitive substring match rather than an enum check — covers
// "Guard", "Site Guard", "Security Guard", etc. (2026-09-23: only Guards
// may be assigned to a site, per explicit instruction. Also enforced in
// the Roster module, which is the other place a site assignment happens.)
function ensurePositionIsGuard(position: string | null | undefined) {
  if (!position || !/guard/i.test(position)) {
    throw ApiError.badRequest(
      `Only employees whose position is "Guard" can be assigned to a site (this employee's position is "${position ?? "not set"}").`
    );
  }
}

/** Ensures `employeeNumber` isn't already assigned to a different employee. */
async function ensureEmployeeNumberAvailable(employeeNumber: string, excludeId?: string) {
  const existing = await prisma.employee.findUnique({
    where: { employeeNumber },
    select: { id: true },
  });
  if (existing && existing.id !== excludeId) {
    throw ApiError.badRequest(`Employee number "${employeeNumber}" is already assigned to another employee.`);
  }
}
