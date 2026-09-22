import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  ShiftTypeCreateInput,
  ShiftTypeUpdateInput,
  ShiftTypeListQuery,
} from "./shift-types.validation";

/**
 * Creates a new shift type. `name` is @unique in the schema, so a
 * duplicate (even differing only in case, since Postgres unique
 * constraints are case-sensitive by default) will surface as a clean 409
 * via the shared error handler's P2002 handling.
 */
export async function createShiftType(input: ShiftTypeCreateInput) {
  return prisma.shiftType.create({
    data: {
      name: input.name,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

/**
 * Lists shift types, optionally filtered by isActive. No pagination —
 * this is a small configuration lookup table (Day/Night/etc.), not a
 * high-volume record type.
 */
export async function listShiftTypes(query: ShiftTypeListQuery) {
  return prisma.shiftType.findMany({
    where: query.isActive !== undefined ? { isActive: query.isActive } : {},
    orderBy: { name: "asc" },
  });
}

/** Fetches a single shift type. */
export async function getShiftTypeById(id: string) {
  const shiftType = await prisma.shiftType.findUnique({ where: { id } });
  if (!shiftType) {
    throw ApiError.notFound(`Shift type ${id} not found.`);
  }
  return shiftType;
}

/** Updates a shift type's name and/or active flag. */
export async function updateShiftType(id: string, input: ShiftTypeUpdateInput) {
  const exists = await prisma.shiftType.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    throw ApiError.notFound(`Shift type ${id} not found.`);
  }

  return prisma.shiftType.update({
    where: { id },
    data: input,
  });
}
