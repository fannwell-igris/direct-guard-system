import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import {
  StatutoryRuleCreateInput,
  StatutoryRuleUpdateInput,
  StatutoryRuleListQuery,
} from "./statutory-rules.validation";

async function ensureDeductionTypeExists(deductionTypeId: string) {
  const exists = await prisma.deductionType.findUnique({ where: { id: deductionTypeId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Deduction type ${deductionTypeId} does not exist.`);
  }
}

export async function createStatutoryRule(input: StatutoryRuleCreateInput) {
  await ensureDeductionTypeExists(input.deductionTypeId);

  return prisma.statutoryRule.create({
    data: {
      name: input.name,
      description: input.description,
      ruleType: input.ruleType,
      deductionTypeId: input.deductionTypeId,
      employeeRate: input.employeeRate,
      employerRate: input.employerRate,
      config: input.config as any,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      notes: input.notes,
    },
    include: { deductionType: true },
  });
}

/** Lists statutory rules, optionally filtered by isActive. No pagination — small config lookup table. */
export async function listStatutoryRules(query: StatutoryRuleListQuery) {
  return prisma.statutoryRule.findMany({
    where: query.isActive !== undefined ? { isActive: query.isActive } : {},
    orderBy: [{ name: "asc" }, { effectiveFrom: "desc" }],
    include: { deductionType: true },
  });
}

export async function getStatutoryRuleById(id: string) {
  const rule = await prisma.statutoryRule.findUnique({
    where: { id },
    include: { deductionType: true },
  });
  if (!rule) {
    throw ApiError.notFound(`Statutory rule ${id} not found.`);
  }
  return rule;
}

export async function updateStatutoryRule(id: string, input: StatutoryRuleUpdateInput) {
  const existing = await prisma.statutoryRule.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Statutory rule ${id} not found.`);
  }

  return prisma.statutoryRule.update({
    where: { id },
    data: { ...input, config: input.config as any },
    include: { deductionType: true },
  });
}
