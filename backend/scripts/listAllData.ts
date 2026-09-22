// scripts/listAllData.ts
// Read-only inventory: prints every Employee, Client, Site, and Payroll Run
// currently in the database, so we can tell real data apart from leftover
// test data before deleting anything. Doesn't change anything.
//
// Run from backend/:  npx ts-node scripts/listAllData.ts

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({
    select: { id: true, employeeNumber: true, fullName: true, position: true, dateAdded: true, assignedSite: { select: { siteName: true } } },
    orderBy: { dateAdded: "asc" },
  });
  console.log(`\n=== EMPLOYEES (${employees.length}) ===`);
  for (const e of employees) {
    console.log(`${e.employeeNumber ?? "(no number)"} | ${e.fullName} | ${e.position ?? ""} | site: ${e.assignedSite?.siteName ?? "-"} | added: ${e.dateAdded.toISOString().slice(0,10)}`);
  }

  const clients = await prisma.client.findMany({
    select: { id: true, name: true, dateAdded: true, notes: true, _count: { select: { sites: true } } },
    orderBy: { dateAdded: "asc" },
  });
  console.log(`\n=== CLIENTS (${clients.length}) ===`);
  for (const c of clients) {
    console.log(`${c.name} | sites: ${c._count.sites} | added: ${c.dateAdded.toISOString().slice(0,10)} | notes: ${c.notes ?? ""}`);
  }

  const sites = await prisma.site.findMany({
    select: { id: true, siteName: true, client: { select: { name: true } }, dateAdded: true },
    orderBy: { dateAdded: "asc" },
  });
  console.log(`\n=== SITES (${sites.length}) ===`);
  for (const s of sites) {
    console.log(`${s.siteName} | client: ${s.client.name} | added: ${s.dateAdded.toISOString().slice(0,10)}`);
  }

  const runs = await prisma.payrollRun.findMany({
    select: { id: true, period: true, status: true, createdBy: true, dateCreated: true, _count: { select: { lineItems: true } } },
    orderBy: { dateCreated: "asc" },
  });
  console.log(`\n=== PAYROLL RUNS (${runs.length}) ===`);
  for (const r of runs) {
    console.log(`${r.id} | period: ${r.period.toISOString().slice(0,7)} | status: ${r.status} | lineItems: ${r._count.lineItems} | createdBy: ${r.createdBy ?? ""} | created: ${r.dateCreated.toISOString().slice(0,10)}`);
  }

  const users = await prisma.user.findMany({ select: { email: true, fullName: true, role: true, dateCreated: true } });
  console.log(`\n=== USERS (${users.length}) ===`);
  for (const u of users) {
    console.log(`${u.email} | ${u.fullName} | ${u.role} | created: ${u.dateCreated.toISOString().slice(0,10)}`);
  }

  console.log("\n== end of inventory ==");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
