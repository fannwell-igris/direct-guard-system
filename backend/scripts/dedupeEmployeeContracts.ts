// scripts/dedupeEmployeeContracts.ts
//
// Fixes duplicate EmployeeContract rows created by a bug in
// importAugust2026WageBill.ts: for any employee whose real contract start
// date was more than ~1 year before August 2026 (Joseph Chirwa, Jimmy
// Moonga), the auto-computed "start + 12 months" end date landed before
// the wage-bill period, so the script's own "does a contract already
// cover this period" check kept failing and it created a fresh duplicate
// contract every time the import script was re-run.
//
// This script finds any employee with more than one EmployeeContract that
// has the exact same startDate + salary (i.e. genuine duplicates from the
// bug, not two real distinct contracts), keeps ONE of them (preferring
// whichever one is actually referenced by the current August 2026 payroll
// line items, so nothing on that run breaks), and deletes the rest.
//
// Safe to re-run — does nothing once there are no duplicates left.
//
// Run from backend/:  npx ts-node scripts/dedupeEmployeeContracts.ts

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

interface ContractRow {
  id: string;
  startDate: Date;
  endDate: Date;
  salary: any;
  dateCreated: Date;
}

async function main() {
  const employees: { id: string; fullName: string; employeeContracts: ContractRow[] }[] = await prisma.employee.findMany({
    select: {
      id: true,
      fullName: true,
      employeeContracts: { select: { id: true, startDate: true, endDate: true, salary: true, dateCreated: true } },
    },
  });

  let employeesFixed = 0;
  let contractsDeleted = 0;

  for (const emp of employees) {
    if (emp.employeeContracts.length < 2) continue;

    // Group contracts by (startDate, salary) — true duplicates share both.
    const groups = new Map<string, ContractRow[]>();
    for (const c of emp.employeeContracts) {
      const key = `${c.startDate.toISOString()}|${c.salary}`;
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }

    for (const [, group] of groups) {
      if (group.length < 2) continue; // not a duplicate set

      // Prefer to keep the one a current payroll line item points to.
      const referenced = await prisma.payrollLineItem.findFirst({
        where: { employeeContractId: { in: group.map((c) => c.id) } },
        select: { employeeContractId: true },
      });
      const keepId = referenced?.employeeContractId ?? group[0].id;
      const toDelete = group.filter((c) => c.id !== keepId);

      for (const c of toDelete) {
        // Any payroll line item pointing at the one we're deleting gets
        // repointed to the one we're keeping first (SetNull would also be
        // safe, but this keeps the traceability link intact).
        await prisma.payrollLineItem.updateMany({
          where: { employeeContractId: c.id },
          data: { employeeContractId: keepId },
        });
        await prisma.employeeContract.delete({ where: { id: c.id } });
        contractsDeleted++;
      }
      console.log(`  ${emp.fullName}: kept 1, deleted ${toDelete.length} duplicate contract(s) (start ${group[0].startDate.toISOString().slice(0, 10)}, salary ${group[0].salary})`);
      employeesFixed++;
    }
  }

  console.log(`\nDone. ${employeesFixed} employee(s) had duplicates; ${contractsDeleted} duplicate contract(s) deleted.`);
}

main()
  .catch((err) => { console.error("Dedupe failed:", err); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
