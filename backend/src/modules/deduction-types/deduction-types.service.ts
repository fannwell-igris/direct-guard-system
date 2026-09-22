import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  DeductionTypeCreateInput,
  DeductionTypeUpdateInput,
  DeductionTypeListQuery,
} from "./deduction-types.validation";

/**
 * Creates a new deduction type. Unlike ShiftType, `name` is NOT `@unique`
 * at the schema level for this model, so we guard against duplicates
 * (case-insensitive) at the application layer instead — a clean 409, same
 * shape as the DB-level duplicate errors elsewhere in this project. This
 * is a best-effort check, not a hard guarantee under concurrent writes;
 * flagged as a known gap rather than silently assumed safe.
 */
export async function createDeductionType(input: DeductionTypeCreateInput) {
  await ensureNameNotTaken(input.name);

  return prisma.deductionType.create({
    data: {
      name: input.name,
      description: input.description,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

/** Lists deduction types, optionally filtered by isActive. No pagination — small config lookup table. */
export async function listDeductionTypes(query: DeductionTypeListQuery) {
  return prisma.deductionType.findMany({
    where: query.isActive !== undefined ? { isActive: query.isActive } : {},
    orderBy: { name: "asc" },
  });
}

/** Fetches a single deduction type. */
export async function getDeductionTypeById(id: string) {
  const deductionType = await prisma.deductionType.findUnique({ where: { id } });
  if (!deductionType) {
    throw ApiError.notFound(`Deduction type ${id} not found.`);
  }
  return deductionType;
}

/** Updates a deduction type's name/description/active flag. Re-checks name uniqueness if changed. */
export async function updateDeductionType(id: string, input: DeductionTypeUpdateInput) {
  const existing = await prisma.deductionType.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Deduction type ${id} not found.`);
  }
  if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
    await ensureNameNotTaken(input.name);
  }

  return prisma.deductionType.update({
    where: { id },
    data: input,
  });
}

async function ensureNameNotTaken(name: string) {
  const existing = await prisma.deductionType.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    throw ApiError.conflict(`A deduction type named "${name}" already exists.`);
  }
}
