import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  AllowanceTypeCreateInput,
  AllowanceTypeUpdateInput,
  AllowanceTypeListQuery,
} from "./allowance-types.validation";

/**
 * Creates a new allowance type. Unlike ShiftType, `name` is NOT `@unique`
 * at the schema level for this model, so we guard against duplicates
 * (case-insensitive) at the application layer instead — a clean 409, same
 * shape as the DB-level duplicate errors elsewhere in this project. This
 * is a best-effort check, not a hard guarantee under concurrent writes;
 * flagged as a known gap rather than silently assumed safe.
 */
export async function createAllowanceType(input: AllowanceTypeCreateInput) {
  await ensureNameNotTaken(input.name);

  return prisma.allowanceType.create({
    data: {
      name: input.name,
      description: input.description,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

/** Lists allowance types, optionally filtered by isActive. No pagination — small config lookup table. */
export async function listAllowanceTypes(query: AllowanceTypeListQuery) {
  return prisma.allowanceType.findMany({
    where: query.isActive !== undefined ? { isActive: query.isActive } : {},
    orderBy: { name: "asc" },
  });
}

/** Fetches a single allowance type. */
export async function getAllowanceTypeById(id: string) {
  const allowanceType = await prisma.allowanceType.findUnique({ where: { id } });
  if (!allowanceType) {
    throw ApiError.notFound(`Allowance type ${id} not found.`);
  }
  return allowanceType;
}

/** Updates an allowance type's name/description/active flag. Re-checks name uniqueness if changed. */
export async function updateAllowanceType(id: string, input: AllowanceTypeUpdateInput) {
  const existing = await prisma.allowanceType.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Allowance type ${id} not found.`);
  }
  if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
    await ensureNameNotTaken(input.name);
  }

  return prisma.allowanceType.update({
    where: { id },
    data: input,
  });
}

async function ensureNameNotTaken(name: string) {
  const existing = await prisma.allowanceType.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    throw ApiError.conflict(`An allowance type named "${name}" already exists.`);
  }
}
