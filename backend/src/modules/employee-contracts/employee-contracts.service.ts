import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { calculateContractStatus, calculateDurationDays } from "../../lib/contractStatus";
import {
  EmployeeContractCreateInput,
  EmployeeContractUpdateInput,
  EmployeeContractListQuery,
} from "./employee-contracts.validation";

function withDuration<T extends { startDate: Date; endDate: Date }>(contract: T) {
  return { ...contract, durationDays: calculateDurationDays(contract.startDate, contract.endDate) };
}

/**
 * Creates a new employee contract. Validates employeeId references a real
 * record first. Status is always calculated server-side from the dates.
 */
export async function createEmployeeContract(input: EmployeeContractCreateInput) {
  await ensureEmployeeExists(input.employeeId);
  await ensureNoOverlappingContract(input.employeeId, input.startDate, input.endDate);

  const status = calculateContractStatus(input.startDate, input.endDate);

  const contract = await prisma.employeeContract.create({
    data: {
      employeeId: input.employeeId,
      startDate: input.startDate,
      endDate: input.endDate,
      payType: input.payType,
      salary: input.salary,
      shiftRate: input.shiftRate,
      extraShiftRate: input.extraShiftRate,
      notes: input.notes,
      status,
    },
  });

  return withDuration(contract);
}

/** Lists employee contracts with optional employeeId/status filters, paginated. */
export async function listEmployeeContracts(query: EmployeeContractListQuery) {
  const where: Prisma.EmployeeContractWhereInput = {};

  if (query.employeeId) where.employeeId = query.employeeId;
  if (query.status) where.status = query.status as any;

  const [total, rows] = await Promise.all([
    prisma.employeeContract.count({ where }),
    prisma.employeeContract.findMany({
      where,
      orderBy: { endDate: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        employee: { select: { id: true, fullName: true } },
      },
    }),
  ]);

  return {
    data: rows.map(withDuration),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

/** Fetches a single employee contract for the detail view. */
export async function getEmployeeContractById(id: string) {
  const contract = await prisma.employeeContract.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, fullName: true, employmentStatus: true } },
    },
  });

  if (!contract) {
    throw ApiError.notFound(`Employee contract ${id} not found.`);
  }

  return withDuration(contract);
}

/**
 * Updates an employee contract. If startDate/endDate change, status is
 * recalculated - never accepted directly from the request body.
 *
 * Cross-field payType enforcement happens here, not in validation, since
 * it needs the existing record: the EFFECTIVE payType after this update
 * (input.payType if changing, else the existing one) determines whether
 * salary or shiftRate is required. This lets a caller PATCH just the
 * amount without resending payType, while still catching e.g. switching
 * to SHIFT without ever supplying a shiftRate (existing or new).
 */
export async function updateEmployeeContract(id: string, input: EmployeeContractUpdateInput) {
  const existing = await prisma.employeeContract.findUnique({ where: { id } });
  if (!existing) {
    throw ApiError.notFound(`Employee contract ${id} not found.`);
  }

  if (input.employeeId) await ensureEmployeeExists(input.employeeId);

  const effectivePayType = input.payType ?? existing.payType;
  const effectiveSalary = input.salary !== undefined ? input.salary : existing.salary;
  const effectiveShiftRate = input.shiftRate !== undefined ? input.shiftRate : existing.shiftRate;

  if (effectivePayType === "MONTHLY" && !effectiveSalary) {
    throw ApiError.badRequest("`salary` is required when `payType` is MONTHLY.");
  }
  if (effectivePayType === "SHIFT" && !effectiveShiftRate) {
    throw ApiError.badRequest("`shiftRate` is required when `payType` is SHIFT.");
  }

  const newStartDate = input.startDate ?? existing.startDate;
  const newEndDate = input.endDate ?? existing.endDate;
  const effectiveEmployeeId = input.employeeId ?? existing.employeeId;

  if (input.startDate || input.endDate || input.employeeId) {
    await ensureNoOverlappingContract(effectiveEmployeeId, newStartDate, newEndDate, id);
  }

  const status = calculateContractStatus(newStartDate, newEndDate);

  const contract = await prisma.employeeContract.update({
    where: { id },
    data: { ...input, status },
  });

  return withDuration(contract);
}

/**
 * Recalculates and persists status for every employee contract based on
 * today's date. Same temporary manual-trigger pattern as Client Contracts,
 * until a scheduled job runner exists.
 */
export async function refreshAllStatuses() {
  const contracts = await prisma.employeeContract.findMany({
    select: { id: true, startDate: true, endDate: true, status: true },
  });

  let updatedCount = 0;
  for (const c of contracts) {
    const newStatus = calculateContractStatus(c.startDate, c.endDate);
    if (newStatus !== c.status) {
      await prisma.employeeContract.update({ where: { id: c.id }, data: { status: newStatus } });
      updatedCount++;
    }
  }

  return { totalChecked: contracts.length, updatedCount };
}

async function ensureEmployeeExists(employeeId: string) {
  const exists = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!exists) {
    throw ApiError.badRequest(`Employee ${employeeId} does not exist.`);
  }
}

/**
 * Rejects a contract whose [startDate, endDate] range overlaps any other
 * existing contract for the same employee (2026-09-12 cleanup — this was
 * a previously-known, unfixed gap). Two ranges overlap when
 * existing.startDate <= newEndDate AND existing.endDate >= newStartDate.
 * `excludeContractId` lets updateEmployeeContract check against every
 * *other* contract without tripping over the record being edited itself.
 * All contract statuses are considered (ContractStatus has no
 * "cancelled/void" state — every row represents a real historical or
 * current contract, so even an EXPIRED one still occupies its dates).
 */
async function ensureNoOverlappingContract(
  employeeId: string,
  startDate: Date,
  endDate: Date,
  excludeContractId?: string
) {
  const overlapping = await prisma.employeeContract.findFirst({
    where: {
      employeeId,
      ...(excludeContractId ? { id: { not: excludeContractId } } : {}),
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true, startDate: true, endDate: true },
  });

  if (overlapping) {
    const from = overlapping.startDate.toISOString().slice(0, 10);
    const to = overlapping.endDate.toISOString().slice(0, 10);
    throw ApiError.badRequest(
      `This contract's dates overlap an existing contract (${overlapping.id}, ${from} to ${to}) for the same employee.`
    );
  }
}
