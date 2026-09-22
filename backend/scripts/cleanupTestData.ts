// scripts/cleanupTestData.ts
//
// Removes leftover development/test records identified from the inventory
// (scripts/listAllData.ts) taken 2026-09-22, WITHOUT touching anything
// created by the August 2026 wage bill import (importAugust2026WageBill.ts)
// or the admin@example.com login.
//
// Removes:
//   - Employees: "John Banda", "Joseph Chola" (the ones with NO employee
//     number — NOT "Joseph Chola II" / MSL0019, which is real, imported data)
//   - Clients (+ their sites and anything attached): "Acme Corp",
//     "Test Client Two", "Beta Ltd", "Metropolis Healthcare Limited"
//   - Payroll runs NOT created by the wage-bill import (5 runs: periods
//     2026-06, 2026-09, 2026-10, 2026-11, 2026-12 — all test/dev runs)
//   - Users: every account except admin@example.com (16 test/RBAC accounts)
//
// Leaves untouched: all 40 MSL00xx employees, all "Data Import — August
// 2026 Wage Bill" clients/sites, the August 2026 payroll run + its
// payslips, and admin@example.com.
//
// Safe to re-run — every step only acts on rows that still exist.
//
// Run from backend/:  npx ts-node scripts/cleanupTestData.ts

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const TEST_EMPLOYEE_NAMES = ["John Banda", "Joseph Chola"]; // exact match, employeeNumber IS NULL only
const TEST_CLIENT_NAMES = ["Acme Corp", "Test Client Two", "Beta Ltd", "Metropolis Healthcare Limited"];
const KEEP_USER_EMAIL = "admin@example.com";
const IMPORT_MARKER = "Data Import — August 2026 Wage Bill";

async function deletePayrollRunFully(runId: string, label: string) {
  // PayslipRecord blocks PayrollRun/PayrollLineItem deletion (onDelete: Restrict) — remove first.
  await prisma.payslipRecord.deleteMany({ where: { payrollRunId: runId } });
  // Everything else (line items, allowances, deductions, audit logs) cascades from the run delete.
  await prisma.payrollRun.delete({ where: { id: runId } });
  console.log(`  deleted payroll run ${runId} (${label})`);
}

async function deleteEmployeeFully(employeeId: string, label: string) {
  await prisma.attendanceRecord.deleteMany({ where: { employeeId } });
  await prisma.rosterEntry.deleteMany({ where: { employeeId } });
  await prisma.payrollLineItem.deleteMany({ where: { employeeId } }); // should already be 0 after run cleanup
  await prisma.employeeContract.deleteMany({ where: { employeeId } });
  await prisma.salaryHistory.deleteMany({ where: { profile: { employeeId } } });
  await prisma.employeePayrollProfile.deleteMany({ where: { employeeId } });
  await prisma.salaryAdvance.deleteMany({ where: { employeeId } });
  await prisma.employeeLoan.deleteMany({ where: { employeeId } });
  await prisma.task.updateMany({ where: { assignedToEmployeeId: employeeId }, data: { assignedToEmployeeId: null } });
  await prisma.employee.delete({ where: { id: employeeId } });
  console.log(`  deleted employee ${label} (${employeeId})`);
}

async function deleteClientFully(clientId: string, label: string) {
  const sites = await prisma.site.findMany({ where: { clientId }, select: { id: true, siteName: true } });
  for (const site of sites) {
    await prisma.siteRequirement.deleteMany({ where: { siteId: site.id } });
    await prisma.rosterEntry.deleteMany({ where: { siteId: site.id } });
    await prisma.operationsRecord.deleteMany({ where: { siteId: site.id } }); // cascades attendanceRecords
    await prisma.operationalCost.deleteMany({ where: { siteId: site.id } });
    await prisma.siteCoverage.deleteMany({ where: { siteId: site.id } });
    await prisma.inventoryItem.updateMany({ where: { assignedToSiteId: site.id }, data: { assignedToSiteId: null } });
    await prisma.invoice.updateMany({ where: { siteId: site.id }, data: { siteId: null } });
    await prisma.payrollRun.updateMany({ where: { siteId: site.id }, data: { siteId: null } });
    await prisma.employee.updateMany({ where: { assignedSiteId: site.id }, data: { assignedSiteId: null } });
    await prisma.clientContract.deleteMany({ where: { siteId: site.id } });
    await prisma.site.delete({ where: { id: site.id } });
    console.log(`    deleted site ${site.siteName}`);
  }
  await prisma.clientContract.deleteMany({ where: { clientId } });
  const invoices = await prisma.invoice.findMany({ where: { clientId }, select: { id: true } });
  for (const inv of invoices) {
    await prisma.payment.deleteMany({ where: { invoiceId: inv.id } });
    await prisma.invoice.delete({ where: { id: inv.id } });
  }
  await prisma.payment.deleteMany({ where: { clientId } });
  await prisma.operationalCost.deleteMany({ where: { clientId } });
  await prisma.rosterEntry.deleteMany({ where: { clientId } });
  await prisma.operationsRecord.deleteMany({ where: { clientId } });
  await prisma.payrollRun.updateMany({ where: { clientId }, data: { clientId: null } });
  await prisma.employee.updateMany({ where: { assignedClientId: clientId }, data: { assignedClientId: null } });
  await prisma.client.delete({ where: { id: clientId } });
  console.log(`  deleted client ${label} (${clientId})`);
}

async function main() {
  console.log("== Cleaning up test data (leaving the August 2026 import + admin@example.com untouched) ==");

  console.log("\n-- Payroll runs --");
  const runs = await prisma.payrollRun.findMany({ select: { id: true, period: true, createdBy: true, notes: true } });
  for (const run of runs) {
    if (run.createdBy === IMPORT_MARKER) continue; // the real import — keep
    await deletePayrollRunFully(run.id, `period ${run.period.toISOString().slice(0, 7)}, createdBy ${run.createdBy}`);
  }

  console.log("\n-- Employees --");
  for (const name of TEST_EMPLOYEE_NAMES) {
    const matches = await prisma.employee.findMany({ where: { fullName: name, employeeNumber: null } });
    for (const emp of matches) {
      await deleteEmployeeFully(emp.id, emp.fullName);
    }
  }

  console.log("\n-- Clients (+ sites) --");
  for (const name of TEST_CLIENT_NAMES) {
    const client = await prisma.client.findFirst({ where: { name } });
    if (!client) continue;
    await deleteClientFully(client.id, client.name);
  }

  console.log("\n-- Users --");
  const users = await prisma.user.findMany({ where: { email: { not: KEEP_USER_EMAIL } } });
  for (const u of users) {
    await prisma.user.delete({ where: { id: u.id } });
    console.log(`  deleted user ${u.email}`);
  }

  console.log("\n== Cleanup complete ==");
}

main()
  .catch((err) => { console.error("Cleanup failed:", err); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
