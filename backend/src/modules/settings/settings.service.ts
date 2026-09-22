import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { SETTINGS_DEFAULTS, VALID_SECTIONS } from "./settings.defaults";

export async function getSection(section: string): Promise<Record<string, unknown>> {
  validateSection(section);

  const row = await prisma.systemSetting.findUnique({ where: { section } });

  if (!row) {
    // Return defaults — section has never been explicitly saved
    return SETTINGS_DEFAULTS[section] as Record<string, unknown>;
  }

  // Merge with defaults so new keys added in future deploys always appear
  return {
    ...(SETTINGS_DEFAULTS[section] as Record<string, unknown>),
    ...(row.value as Record<string, unknown>),
  };
}

export async function getAllSections(): Promise<Record<string, unknown>> {
  const rows = await prisma.systemSetting.findMany();
  const saved: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    saved[row.section] = row.value as Record<string, unknown>;
  }

  const result: Record<string, unknown> = {};
  for (const section of VALID_SECTIONS) {
    result[section] = {
      ...(SETTINGS_DEFAULTS[section] as Record<string, unknown>),
      ...(saved[section] ?? {}),
    };
  }
  return result;
}

export async function updateSection(
  section: string,
  value: Record<string, unknown>,
  updatedBy?: string
): Promise<Record<string, unknown>> {
  validateSection(section);

  // Merge with existing saved value — don't lose keys not included in this update
  const existing = await prisma.systemSetting.findUnique({ where: { section } });
  const existingValue = existing ? (existing.value as Record<string, unknown>) : {};

  const merged = { ...existingValue, ...value };

  await prisma.systemSetting.upsert({
    where: { section },
    create: { section, value: merged, updatedBy },
    update: { value: merged, updatedBy },
  });

  // Return the full merged result (defaults + saved)
  return {
    ...(SETTINGS_DEFAULTS[section] as Record<string, unknown>),
    ...merged,
  };
}

export async function resetSection(section: string): Promise<Record<string, unknown>> {
  validateSection(section);
  await prisma.systemSetting.deleteMany({ where: { section } });
  return SETTINGS_DEFAULTS[section] as Record<string, unknown>;
}

function validateSection(section: string): void {
  if (!VALID_SECTIONS.includes(section)) {
    throw ApiError.badRequest(
      `Invalid settings section "${section}". Valid sections: ${VALID_SECTIONS.join(", ")}.`
    );
  }
}
