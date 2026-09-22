// scripts/importAugust2026WageBill.ts
//
// One-time data import: loads the real August 2026 wage bill
// (AUGUST_MAGEN_SECURITY_Wage_Bill_2026_FINAL.xlsx) and the Contract
// Tracker PDF into the live database ahead of real-world testing.
//
// WHAT THIS DOES:
//   1. Creates/updates Clients + Sites referenced by the wage bill and the
//      contract tracker.
//   2. Creates/updates the 40 Employees on the August wage bill (by their
//      Comp. No., e.g. "MSL0001" — safe to re-run, matches by that number).
//   3. Creates an EmployeeContract for each employee who doesn't already
//      have one covering August 2026 (MONTHLY pay type, salary = their
//      Basic Salary column).
//   4. Creates a ClientContract for each client listed in the Contract
//      Tracker PDF (amount = Contract Value column).
//   5. Creates ONE PayrollRun for period August 2026 with a PayrollLineItem
//      per employee (allowances, deductions, gross/net — all copied
//      straight from the wage bill), then finalizes it and generates
//      PayslipRecord rows (the "logs kept for PDF generation" table) via
//      the app's own generatePayslips() function.
//
// IMPORTANT — READ BEFORE RUNNING:
//   - Contract START/END DATES are the weakest part of the source data.
//     Employee contract start dates come from each employee's payslip tab
//     where available; where missing, 1 Aug 2026 is used as a placeholder.
//     End dates (for every contract, employee AND client) are NOT in either
//     source document — this script assumes a 12-month term from the start
//     date. EVERY contract row created by this script is tagged in its
//     `notes` field so you can find and correct these in the UI.
//   - Client Contract start dates are back-calculated from the stated
//     duration ending 31 Aug 2026 — also an estimate, also tagged in notes.
//   - The source spreadsheet has 3 employees (MSL0019, MSL0024, MSL0045)
//     sharing one NRC number, which cannot be correct — all three are
//     imported as-is with that NRC; please check with HR which are right.
//   - Safe to re-run: Clients/Sites/Employees are matched and updated, not
//     duplicated. Contracts are only created if no contract already covers
//     August 2026 for that employee. The payroll run is only created once —
//     if you re-run after it exists, that step is skipped with a message.
//
// HOW TO RUN (from the backend/ folder):
//   npx ts-node scripts/importAugust2026WageBill.ts

// NOTE: this script deliberately does NOT import anything from ../src —
// the backend's tsconfig.json sets rootDir to "./src" and only includes
// "src/**/*.ts", so pulling in a src/ module here would make ts-node try
// to compile scripts/ and src/ as one program and fail with a rootDir
// error. Payslip-record creation below is a small self-contained copy of
// the same logic the app's own payroll module uses.
import { PrismaClient, PayType, ContractStatus, PayrollStatus, RecordStatus } from "@prisma/client";

const prisma = new PrismaClient();

// ---------- Source data (from AUGUST_MAGEN_SECURITY_Wage_Bill_2026_FINAL.xlsx + Contract_Tracker_Magen_Security.pdf) ----------

interface WageRow {
  employeeNumber: string;
  fullName: string;
  position: string;
  napsaRegistered: boolean;
  basic: number; housing: number; lunch: number; transport: number; overtime: number; gross: number;
  otherDeduction: number; napsa: number; nhima: number; penalty: number; advance: number; paye: number; net: number;
  site: string;
  contractStart: string | null;
  nrc: string | null;
  payMethod: string | null;
}

const WAGE_ROWS: WageRow[] = [
  {
    "employeeNumber": "MSL0001",
    "fullName": "Moses Siwale",
    "position": "Operations Manager",
    "napsaRegistered": false,
    "basic": 1500.0,
    "housing": 1500.0,
    "lunch": 1000.0,
    "transport": 1000.0,
    "overtime": 0.0,
    "gross": 5000.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 5000.0,
    "site": "Head Office",
    "contractStart": "2026-03-01",
    "nrc": "318533/67/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0002",
    "fullName": "Emmanuel Njobvu",
    "position": "Caretaker/Supervisor",
    "napsaRegistered": false,
    "basic": 1200.0,
    "housing": 800.0,
    "lunch": 500.0,
    "transport": 500.0,
    "overtime": 0.0,
    "gross": 3000.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 3000.0,
    "site": "Metropolis Head Office",
    "contractStart": "2026-07-05",
    "nrc": "688514/52/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0003",
    "fullName": "Collins Hibalombwana",
    "position": "Supervisor",
    "napsaRegistered": false,
    "basic": 1200.0,
    "housing": 800.0,
    "lunch": 500.0,
    "transport": 500.0,
    "overtime": 0.0,
    "gross": 3000.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 3000.0,
    "site": "Head Office",
    "contractStart": "2026-04-25",
    "nrc": "204681/19/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0004",
    "fullName": "Joseph Chirwa",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 960.0,
    "housing": 320.0,
    "lunch": 160.0,
    "transport": 160.0,
    "overtime": 0.0,
    "gross": 1600.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1600.0,
    "site": "Park Ibex",
    "contractStart": "2024-01-10",
    "nrc": "621377/11/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0005",
    "fullName": "Kwalombota Muswa",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 500.0,
    "lunch": 150.0,
    "transport": 100.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 100.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1300.0,
    "site": "Kamwala",
    "contractStart": "2026-06-10",
    "nrc": null,
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0006",
    "fullName": "Abel Masiwa",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 800.0,
    "housing": 500.0,
    "lunch": 250.0,
    "transport": 200.0,
    "overtime": 0.0,
    "gross": 1750.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1750.0,
    "site": "Airport View",
    "contractStart": "2025-12-01",
    "nrc": null,
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0007",
    "fullName": "Richard Sokamuneko",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 500.0,
    "lunch": 150.0,
    "transport": 100.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1400.0,
    "site": "Salama Park",
    "contractStart": null,
    "nrc": null,
    "payMethod": null
  },
  {
    "employeeNumber": "MSL0008",
    "fullName": "Jimmy Moonga",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 848.0,
    "housing": 0.0,
    "lunch": 0.0,
    "transport": 0.0,
    "overtime": 0.0,
    "gross": 848.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 848.0,
    "site": "Troys Lodge",
    "contractStart": "2025-07-08",
    "nrc": "242886/10/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0009",
    "fullName": "Wiseman Mweembe",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 700.0,
    "housing": 450.0,
    "lunch": 300.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 1600.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1600.0,
    "site": "C.B.S",
    "contractStart": "2025-08-13",
    "nrc": "349507/42/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0010",
    "fullName": "Jacob Lumina",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 250.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1150.0,
    "site": "UTH Metropolis",
    "contractStart": "2026-05-28",
    "nrc": "118777/18/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0011",
    "fullName": "Bernard Bupe",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 700.0,
    "housing": 500.0,
    "lunch": 350.0,
    "transport": 250.0,
    "overtime": 400.0,
    "gross": 2200.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 100.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 2100.0,
    "site": "Airport View",
    "contractStart": "2025-08-07",
    "nrc": "251930/31/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0012",
    "fullName": "Moston Kango",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 500.0,
    "lunch": 150.0,
    "transport": 100.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 100.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1300.0,
    "site": "Totally Kids",
    "contractStart": "2026-06-02",
    "nrc": "139257/56/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0013",
    "fullName": "Simukanga Issac",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 0.0,
    "housing": 0.0,
    "lunch": 0.0,
    "transport": 300.0,
    "overtime": 0.0,
    "gross": 300.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 0.0,
    "site": "Troys Lodge",
    "contractStart": null,
    "nrc": null,
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0014",
    "fullName": "Moffat Mwalilino",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 950.0,
    "housing": 500.0,
    "lunch": 150.0,
    "transport": 100.0,
    "overtime": 0.0,
    "gross": 1700.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 100.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1600.0,
    "site": "Madam Mary's",
    "contractStart": "2026-06-16",
    "nrc": "817795/52/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0015",
    "fullName": "Stella Mwale",
    "position": "General Worker",
    "napsaRegistered": false,
    "basic": 1000.0,
    "housing": 800.0,
    "lunch": 200.0,
    "transport": 200.0,
    "overtime": 0.0,
    "gross": 2200.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 2200.0,
    "site": "Head Office",
    "contractStart": "2025-11-19",
    "nrc": "615478/10/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0016",
    "fullName": "Mwelwa Tembo",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 700.0,
    "housing": 400.0,
    "lunch": 250.0,
    "transport": 250.0,
    "overtime": 0.0,
    "gross": 1600.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1600.0,
    "site": "Totally Kids",
    "contractStart": "2025-11-04",
    "nrc": "332134/53/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0017",
    "fullName": "Matthews Zulu",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 100.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1300.0,
    "site": "Airport View",
    "contractStart": "2026-05-02",
    "nrc": "734317/52/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0018",
    "fullName": "Boniface Phiri",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 100.0,
    "gross": 1500.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1500.0,
    "site": "Metropolis HQ",
    "contractStart": "2026-04-17",
    "nrc": "835759/52/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0019",
    "fullName": "Joseph Chola II",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 350.0,
    "lunch": 200.0,
    "transport": 300.0,
    "overtime": 0.0,
    "gross": 1500.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1500.0,
    "site": "Metropolis UTH",
    "contractStart": "2025-11-15",
    "nrc": "439593/16/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0020",
    "fullName": "Rosemary Phiri",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 600.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 200.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1400.0,
    "site": "Totally Kids",
    "contractStart": "2026-06-23",
    "nrc": "472580/53/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0022",
    "fullName": "Reuben Zimba",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 300.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1100.0,
    "site": "Tobacco",
    "contractStart": "2026-06-22",
    "nrc": "579509/10/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0023",
    "fullName": "Clive Chama",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 100.0,
    "gross": 1500.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1500.0,
    "site": "Metropolis HQ",
    "contractStart": "2026-05-11",
    "nrc": "551179/61/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0024",
    "fullName": "Elias Nkhoma",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1400.0,
    "site": "Airport View",
    "contractStart": "2025-11-15",
    "nrc": "439593/16/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0025",
    "fullName": "Collins Mwila",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1400.0,
    "site": "Airport View",
    "contractStart": "2026-04-25",
    "nrc": "204681/19/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0026",
    "fullName": "Innocent Simfunkwe",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 250.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1150.0,
    "site": "Kudahasa",
    "contractStart": "2026-05-11",
    "nrc": "181338/95/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0027",
    "fullName": "Theresa Mwansa",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 901.0,
    "housing": 0.0,
    "lunch": 0.0,
    "transport": 0.0,
    "overtime": 0.0,
    "gross": 901.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 901.0,
    "site": "Reliefer",
    "contractStart": "2026-05-17",
    "nrc": "264329/09/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0029",
    "fullName": "Wezi Phiri",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 950.0,
    "housing": 500.0,
    "lunch": 400.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 2000.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 2000.0,
    "site": "Mungule Site",
    "contractStart": "2025-12-01",
    "nrc": "237083/10/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0031",
    "fullName": "John Moono",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 700.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 200.0,
    "overtime": 0.0,
    "gross": 1500.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 100.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1400.0,
    "site": "Metropolis UTH",
    "contractStart": "2025-12-01",
    "nrc": "222139/72/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0033",
    "fullName": "James Simfukwe",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1400.0,
    "site": "Marvelous University",
    "contractStart": null,
    "nrc": null,
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0034",
    "fullName": "Racheal Kashweka",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 200.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1200.0,
    "site": "Reliefer",
    "contractStart": "2026-06-26",
    "nrc": null,
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0036",
    "fullName": "Blessings Sianyangwe",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1400.0,
    "site": "Green Park",
    "contractStart": null,
    "nrc": null,
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0037",
    "fullName": "Mike Zyambo",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 310.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 1060.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1060.0,
    "site": "Protech-Kabulonga",
    "contractStart": "2026-08-12",
    "nrc": null,
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0038",
    "fullName": "Simon Zulu",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 100.0,
    "gross": 1500.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1500.0,
    "site": "Reliefer",
    "contractStart": "2026-07-22",
    "nrc": "619515/11/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0039",
    "fullName": "Desire Kapata",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 100.0,
    "gross": 1500.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1500.0,
    "site": "Park Ibex",
    "contractStart": "2026-07-22",
    "nrc": null,
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0040",
    "fullName": "Mutukwa .Muletambo",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 0.0,
    "housing": 0.0,
    "lunch": 0.0,
    "transport": 0.0,
    "overtime": 0.0,
    "gross": 0.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 0.0,
    "site": "Marvelous University",
    "contractStart": null,
    "nrc": null,
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0041",
    "fullName": "Richard Kafinga",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 0.0,
    "housing": 0.0,
    "lunch": 0.0,
    "transport": 0.0,
    "overtime": 0.0,
    "gross": 0.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 0.0,
    "site": "Metreopolis HQ",
    "contractStart": "2026-07-05",
    "nrc": "100530/09/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0042",
    "fullName": "Kelvin Chinjenge",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 0.0,
    "housing": 0.0,
    "lunch": 0.0,
    "transport": 0.0,
    "overtime": 0.0,
    "gross": 0.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 0.0,
    "site": "York Electrical",
    "contractStart": "2026-07-11",
    "nrc": "168465/10/",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0043",
    "fullName": "Thomas Bowa",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 400.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1000.0,
    "site": "Marike Engineering",
    "contractStart": "2026-05-27",
    "nrc": "692653/11/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0044",
    "fullName": "Joseph Banda",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 200.0,
    "transport": 150.0,
    "overtime": 0.0,
    "gross": 1400.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 1400.0,
    "site": "Streamside Sycamore",
    "contractStart": "2025-11-15",
    "nrc": "183489/19/1",
    "payMethod": "Bank"
  },
  {
    "employeeNumber": "MSL0045",
    "fullName": "John Mulubwa",
    "position": "Guard",
    "napsaRegistered": false,
    "basic": 650.0,
    "housing": 400.0,
    "lunch": 250.0,
    "transport": 200.0,
    "overtime": 876.0,
    "gross": 2376.0,
    "otherDeduction": 0.0,
    "napsa": 0.0,
    "nhima": 0.0,
    "penalty": 0.0,
    "advance": 0.0,
    "paye": 0.0,
    "net": 2376.0,
    "site": "Streamside Sycamore",
    "contractStart": "2025-11-01",
    "nrc": "439593/16/1",
    "payMethod": "Bank"
  }
];

interface SiteMapEntry { client: string; site: string; }
const SITE_MAP: Record<string, SiteMapEntry | null> = {
  "Head Office": {
    "client": "Magen Security Limited",
    "site": "Head Office"
  },
  "Metropolis Head Office": {
    "client": "Magen Security Limited",
    "site": "Metropolis Head Office"
  },
  "Park Ibex": {
    "client": "Park Ibex",
    "site": "Park Ibex"
  },
  "Kamwala": {
    "client": "Kamwala",
    "site": "Kamwala"
  },
  "Airport View": {
    "client": "Airport View",
    "site": "Airport View"
  },
  "Salama Park": {
    "client": "Salama Park",
    "site": "Salama Park"
  },
  "Troys Lodge": {
    "client": "Troy's Lodge",
    "site": "Troy's Lodge"
  },
  "C.B.S": {
    "client": "C.B.S",
    "site": "C.B.S"
  },
  "UTH Metropolis": {
    "client": "Metropolis UTH",
    "site": "Metropolis UTH"
  },
  "Metropolis UTH": {
    "client": "Metropolis UTH",
    "site": "Metropolis UTH"
  },
  "Totally Kids": {
    "client": "Totally Kids",
    "site": "Totally Kids"
  },
  "Madam Mary's": {
    "client": "Madam Mary's",
    "site": "Madam Mary's"
  },
  "Metropolis HQ": {
    "client": "Metropolis HQ",
    "site": "Metropolis HQ"
  },
  "Metreopolis HQ": {
    "client": "Metropolis HQ",
    "site": "Metropolis HQ"
  },
  "Tobacco": {
    "client": "Tobacco Association",
    "site": "Tobacco Association"
  },
  "Kudahasa": {
    "client": "Kudahasa",
    "site": "Kudahasa"
  },
  "Reliefer": null,
  "Mungule Site": {
    "client": "Mungule",
    "site": "Mungule"
  },
  "Marvelous University": {
    "client": "Marvelous University",
    "site": "Marvelous University"
  },
  "Green Park": {
    "client": "Green Park",
    "site": "Green Park"
  },
  "Protech-Kabulonga": {
    "client": "Protech Kabulonga",
    "site": "Protech Kabulonga"
  },
  "York Electrical": {
    "client": "York Electrical",
    "site": "York Electrical"
  },
  "Marike Engineering": {
    "client": "Marike Engineering",
    "site": "Marike Engineering"
  },
  "Streamside Sycamore": {
    "client": "Sycamore Streamside",
    "site": "Sycamore Streamside"
  }
};

interface ClientContractRow { client: string; durationMonths: number; value: number; durationEstimated: boolean; }
const CLIENT_CONTRACTS: ClientContractRow[] = [
  {
    "client": "Troy's Lodge",
    "durationMonths": 36,
    "value": 6050,
    "durationEstimated": false
  },
  {
    "client": "Airport View",
    "durationMonths": 12,
    "value": 16200,
    "durationEstimated": true
  },
  {
    "client": "Tobacco Association",
    "durationMonths": 12,
    "value": 3150,
    "durationEstimated": true
  },
  {
    "client": "Protech Garage",
    "durationMonths": 12,
    "value": 2800,
    "durationEstimated": false
  },
  {
    "client": "Metropolis HQ",
    "durationMonths": 12,
    "value": 14200,
    "durationEstimated": false
  },
  {
    "client": "Totally Kids",
    "durationMonths": 12,
    "value": 14800,
    "durationEstimated": false
  },
  {
    "client": "Park Ibex",
    "durationMonths": 12,
    "value": 6000,
    "durationEstimated": false
  },
  {
    "client": "Kamwala",
    "durationMonths": 12,
    "value": 3500,
    "durationEstimated": false
  },
  {
    "client": "Salama Park",
    "durationMonths": 12,
    "value": 3000,
    "durationEstimated": false
  },
  {
    "client": "C.B.S",
    "durationMonths": 12,
    "value": 3300,
    "durationEstimated": false
  },
  {
    "client": "Madam Mary's",
    "durationMonths": 12,
    "value": 3750,
    "durationEstimated": false
  },
  {
    "client": "Mungule",
    "durationMonths": 12,
    "value": 5000,
    "durationEstimated": false
  },
  {
    "client": "Sycamore Streamside",
    "durationMonths": 12,
    "value": 6000,
    "durationEstimated": false
  },
  {
    "client": "Marvelous University",
    "durationMonths": 12,
    "value": 7900,
    "durationEstimated": false
  },
  {
    "client": "Protech Kabulonga",
    "durationMonths": 12,
    "value": 3000,
    "durationEstimated": false
  },
  {
    "client": "Colinas Gas",
    "durationMonths": 12,
    "value": 3250,
    "durationEstimated": false
  }
];

const ALL_CLIENT_NAMES: string[] = [
  "Airport View",
  "C.B.S",
  "Colinas Gas",
  "Green Park",
  "Kamwala",
  "Kudahasa",
  "Madam Mary's",
  "Magen Security Limited",
  "Marike Engineering",
  "Marvelous University",
  "Metropolis HQ",
  "Metropolis UTH",
  "Mungule",
  "Park Ibex",
  "Protech Garage",
  "Protech Kabulonga",
  "Salama Park",
  "Sycamore Streamside",
  "Tobacco Association",
  "Totally Kids",
  "Troy's Lodge",
  "York Electrical"
];

const PERIOD = new Date(2026, 7, 1); // 1 Aug 2026
const PERIOD_END = new Date(2026, 7, 31); // 31 Aug 2026
const IMPORTED_BY = "Data Import — August 2026 Wage Bill";

function round2(n: number): number { return Math.round(n * 100) / 100; }

function addMonths(d: Date, months: number): Date {
  const nd = new Date(d);
  nd.setMonth(nd.getMonth() + months);
  return nd;
}

// ---------- Step 1: Allowance / Deduction types ----------

async function upsertAllowanceType(name: string) {
  const existing = await prisma.allowanceType.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.allowanceType.create({ data: { name, description: "Created by August 2026 wage bill import." } });
}

async function upsertDeductionType(name: string) {
  const existing = await prisma.deductionType.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.deductionType.create({ data: { name, description: "Created by August 2026 wage bill import." } });
}

// ---------- Step 2: Clients + Sites ----------

async function upsertClient(name: string) {
  const existing = await prisma.client.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.client.create({ data: { name, status: RecordStatus.ACTIVE, notes: IMPORTED_BY } });
}

async function upsertSite(clientId: string, siteName: string) {
  const existing = await prisma.site.findFirst({ where: { clientId, siteName } });
  if (existing) return existing;
  return prisma.site.create({ data: { clientId, siteName, status: RecordStatus.ACTIVE, notes: IMPORTED_BY } });
}

async function main() {
  console.log("== August 2026 wage bill import ==");

  // --- Allowance / Deduction types ---
  const housingType = await upsertAllowanceType("Housing Allowance");
  const lunchType = await upsertAllowanceType("Lunch Allowance");
  const transportType = await upsertAllowanceType("Transport Allowance");

  const napsaType = await upsertDeductionType("NAPSA");
  const nhimaType = await upsertDeductionType("NHIMA");
  const payeType = await upsertDeductionType("PAYE");
  const penaltyType = await upsertDeductionType("Penalty");
  const otherDeductionType = await upsertDeductionType("Other Deduction");

  // --- Clients + Sites ---
  const clientByName = new Map<string, { id: string }>();
  for (const name of ALL_CLIENT_NAMES) {
    const client = await upsertClient(name);
    clientByName.set(name, client);
  }
  console.log(`Clients ready: ${clientByName.size}`);

  const siteByKey = new Map<string, { id: string; clientId: string }>(); // key = raw wage-bill site string
  for (const [rawSite, mapping] of Object.entries(SITE_MAP)) {
    if (!mapping) continue; // e.g. "Reliefer" — floating guard, no fixed site
    const client = clientByName.get(mapping.client)!;
    const site = await upsertSite(client.id, mapping.site);
    siteByKey.set(rawSite, { id: site.id, clientId: client.id });
  }
  console.log(`Sites ready: ${siteByKey.size}`);

  // --- Client Contracts (from Contract Tracker PDF) ---
  let clientContractsCreated = 0;
  for (const row of CLIENT_CONTRACTS) {
    const client = clientByName.get(row.client);
    if (!client) continue;
    const already = await prisma.clientContract.findFirst({ where: { clientId: client.id } });
    if (already) continue; // don't duplicate on re-run
    const endDate = PERIOD_END;
    const startDate = addMonths(endDate, -row.durationMonths);
    const durationNote = row.durationEstimated
      ? " Duration itself was unclear/marked in the source PDF — 12 months assumed."
      : "";
    // Try to link the matching site, if this client also has one from the wage bill.
    const siteEntry = [...siteByKey.entries()].find(([, s]) => s.clientId === client.id);
    await prisma.clientContract.create({
      data: {
        clientId: client.id,
        siteId: siteEntry ? siteEntry[1].id : null,
        startDate, endDate,
        amount: row.value,
        status: ContractStatus.ACTIVE,
        notes: `Imported from Contract Tracker PDF (2026-09-22). Start date estimated by counting back the stated duration (${row.durationMonths} months) from the wage-bill period end (31 Aug 2026) — confirm the actual signing date and correct if needed.${durationNote}`,
      },
    });
    clientContractsCreated++;
  }
  console.log(`Client contracts created: ${clientContractsCreated}`);

  // --- Employees + Employee Contracts + Payroll Profiles ---
  const employeeIdByNumber = new Map<string, string>();
  let employeesCreated = 0, employeesUpdated = 0, contractsCreated = 0, profilesCreated = 0;

  for (const row of WAGE_ROWS) {
    const siteInfo = siteByKey.get(row.site) ?? null;
    const existing = await prisma.employee.findUnique({ where: { employeeNumber: row.employeeNumber } });

    let employee;
    if (existing) {
      employee = await prisma.employee.update({
        where: { id: existing.id },
        data: {
          fullName: row.fullName,
          position: row.position,
          napsaRegistered: row.napsaRegistered,
          assignedSiteId: siteInfo ? siteInfo.id : existing.assignedSiteId,
          assignedClientId: siteInfo ? siteInfo.clientId : existing.assignedClientId,
          contractStartDate: row.contractStart ? new Date(row.contractStart) : existing.contractStartDate,
        },
      });
      employeesUpdated++;
    } else {
      employee = await prisma.employee.create({
        data: {
          fullName: row.fullName,
          employeeNumber: row.employeeNumber,
          position: row.position,
          napsaRegistered: row.napsaRegistered,
          nhimaRegistered: false,
          assignedSiteId: siteInfo ? siteInfo.id : null,
          assignedClientId: siteInfo ? siteInfo.clientId : null,
          contractStartDate: row.contractStart ? new Date(row.contractStart) : null,
          notes: row.site === "Reliefer" ? "Floating / relief guard — no fixed site." : null,
        },
      });
      employeesCreated++;
    }
    employeeIdByNumber.set(row.employeeNumber, employee.id);

    // Payroll profile (NRC + pay method), only if we have something to store.
    if (row.nrc || row.payMethod) {
      const existingProfile = await prisma.employeePayrollProfile.findUnique({ where: { employeeId: employee.id } });
      if (!existingProfile) {
        await prisma.employeePayrollProfile.create({
          data: {
            employeeId: employee.id,
            nrcNumber: row.nrc,
            paymentMethod: row.payMethod === "Bank" ? "BANK_TRANSFER" : row.payMethod,
            notes: IMPORTED_BY,
          },
        });
        profilesCreated++;
      }
    }

    // Employee contract — only create if none already covers August 2026.
    const coveringContract = await prisma.employeeContract.findFirst({
      where: { employeeId: employee.id, startDate: { lte: PERIOD_END }, endDate: { gte: PERIOD } },
    });
    if (!coveringContract) {
      const startDateKnown = !!row.contractStart;
      const startDate = row.contractStart ? new Date(row.contractStart) : new Date(2026, 7, 1);
      // A flat "start + 12 months" can land BEFORE the wage-bill period for
      // anyone whose real start date is over a year old (e.g. 2024) — that
      // produced a contract that doesn't cover August 2026 at all, so the
      // coveringContract check above never found it and re-running this
      // script kept creating fresh duplicates. Always extend at least one
      // month past the period being imported so the contract genuinely
      // covers it, regardless of how old the real start date is.
      const endDate = new Date(Math.max(addMonths(startDate, 12).getTime(), addMonths(PERIOD_END, 1).getTime()));
      await prisma.employeeContract.create({
        data: {
          employeeId: employee.id,
          startDate, endDate,
          payType: PayType.MONTHLY,
          salary: row.basic,
          status: ContractStatus.ACTIVE,
          notes: startDateKnown
            ? "Start date from the employee's payslip record. End date is an assumed 12-month term (not in the source data) — confirm and correct."
            : "Start date NOT found in the source data — placeholder of 1 Aug 2026 used. End date is an assumed 12-month term. Please correct both.",
        },
      });
      contractsCreated++;
    }
  }
  console.log(`Employees: ${employeesCreated} created, ${employeesUpdated} updated. Contracts created: ${contractsCreated}. Payroll profiles created: ${profilesCreated}.`);

  // --- Payroll run for August 2026 ---
  const existingRun = await prisma.payrollRun.findFirst({ where: { period: PERIOD, clientId: null, siteId: null } });
  if (existingRun) {
    console.log(`A payroll run for August 2026 already exists (id ${existingRun.id}, status ${existingRun.status}) — skipping payroll import to avoid duplicating it. Delete it first if you want this script to recreate it.`);
    await prisma.$disconnect();
    return;
  }

  const run = await prisma.payrollRun.create({
    data: {
      period: PERIOD,
      status: PayrollStatus.DRAFT,
      createdBy: IMPORTED_BY,
      notes: "Imported directly from AUGUST_MAGEN_SECURITY_Wage_Bill_2026_FINAL.xlsx — figures (allowances, deductions, gross, net) are copied as-is from that file, not recalculated.",
    },
  });

  let mismatchCount = 0;
  for (const row of WAGE_ROWS) {
    const employeeId = employeeIdByNumber.get(row.employeeNumber)!;
    const contract = await prisma.employeeContract.findFirst({
      where: { employeeId, startDate: { lte: PERIOD_END }, endDate: { gte: PERIOD } },
      orderBy: [{ startDate: "desc" }],
    });

    const totalAllowances = round2(row.housing + row.lunch + row.transport);
    const totalDeductions = round2(row.napsa + row.nhima + row.paye + row.penalty + row.otherDeduction);
    const computedGross = round2(row.basic + row.overtime + totalAllowances);
    const computedNet = round2(computedGross - totalDeductions - row.advance);
    if (Math.abs(computedGross - row.gross) > 0.01 || Math.abs(computedNet - row.net) > 0.01) {
      console.warn(`  Mismatch for ${row.employeeNumber} ${row.fullName}: computed gross/net ${computedGross}/${computedNet} vs wage-bill ${row.gross}/${row.net} — using the wage-bill figures.`);
      mismatchCount++;
    }

    const lineItem = await prisma.payrollLineItem.create({
      data: {
        payrollRunId: run.id,
        employeeId,
        employeeContractId: contract ? contract.id : null,
        fullNameSnapshot: row.fullName,
        positionSnapshot: row.position,
        payType: PayType.MONTHLY,
        basicSalary: row.basic,
        overtime: row.overtime,
        advances: row.advance,
        totalAllowances,
        totalDeductions,
        grossPay: row.gross,
        netPay: row.net,
      },
    });

    if (row.housing > 0) await prisma.payrollAllowance.create({ data: { payrollLineItemId: lineItem.id, allowanceTypeId: housingType.id, amount: row.housing } });
    if (row.lunch > 0) await prisma.payrollAllowance.create({ data: { payrollLineItemId: lineItem.id, allowanceTypeId: lunchType.id, amount: row.lunch } });
    if (row.transport > 0) await prisma.payrollAllowance.create({ data: { payrollLineItemId: lineItem.id, allowanceTypeId: transportType.id, amount: row.transport } });

    if (row.napsa > 0) await prisma.payrollDeduction.create({ data: { payrollLineItemId: lineItem.id, deductionTypeId: napsaType.id, amount: row.napsa, isStatutory: true } });
    if (row.nhima > 0) await prisma.payrollDeduction.create({ data: { payrollLineItemId: lineItem.id, deductionTypeId: nhimaType.id, amount: row.nhima, isStatutory: true } });
    if (row.paye > 0) await prisma.payrollDeduction.create({ data: { payrollLineItemId: lineItem.id, deductionTypeId: payeType.id, amount: row.paye, isStatutory: true } });
    if (row.penalty > 0) await prisma.payrollDeduction.create({ data: { payrollLineItemId: lineItem.id, deductionTypeId: penaltyType.id, amount: row.penalty, isStatutory: false } });
    if (row.otherDeduction > 0) await prisma.payrollDeduction.create({ data: { payrollLineItemId: lineItem.id, deductionTypeId: otherDeductionType.id, amount: row.otherDeduction, isStatutory: false } });
  }

  const totalGrossPay = round2(WAGE_ROWS.reduce((s, r) => s + r.gross, 0));
  const totalDeductionsAll = round2(WAGE_ROWS.reduce((s, r) => s + r.napsa + r.nhima + r.paye + r.penalty + r.otherDeduction + r.advance, 0));
  const totalNetPay = round2(WAGE_ROWS.reduce((s, r) => s + r.net, 0));

  const now = new Date();
  await prisma.payrollRun.update({
    where: { id: run.id },
    data: {
      totalGrossPay, totalDeductions: totalDeductionsAll, totalNetPay,
      status: PayrollStatus.FINALIZED,
      reviewedBy: IMPORTED_BY, reviewedAt: now,
      finalizedBy: IMPORTED_BY, finalizedAt: now,
    },
  });

  await prisma.payrollAuditLog.createMany({
    data: [
      { payrollRunId: run.id, action: "CREATED", performedBy: IMPORTED_BY, details: `Imported ${WAGE_ROWS.length} line item(s) from AUGUST_MAGEN_SECURITY_Wage_Bill_2026_FINAL.xlsx.` },
      { payrollRunId: run.id, action: "STATUS_CHANGED", performedBy: IMPORTED_BY, details: "DRAFT -> REVIEWED -> FINALIZED (imported as already-final; mark PAID from the UI once disbursement is confirmed)." },
    ],
  });

  console.log(`Payroll run created: ${run.id} (period Aug 2026, ${WAGE_ROWS.length} line items, status FINALIZED).`);
  if (mismatchCount > 0) console.log(`${mismatchCount} employee(s) had a gross/net mismatch vs. the recalculated figures — wage-bill figures were used; worth a manual check.`);

  // --- Payslip records (the persisted "logs" used for PDF generation) ---
  // Self-contained equivalent of the app's generatePayslips() — see the
  // note at the top of the file for why this isn't imported instead.
  const prefix = `PSL-2026-08`;
  let seq = 1;
  const payslipRows = [];
  for (const row of WAGE_ROWS) {
    const employeeId = employeeIdByNumber.get(row.employeeNumber)!;
    const lineItem = await prisma.payrollLineItem.findFirst({ where: { payrollRunId: run.id, employeeId } });
    if (!lineItem) continue;
    const allowanceBreakdown = [
      ...(row.housing > 0 ? [{ name: "Housing Allowance", amount: row.housing }] : []),
      ...(row.lunch > 0 ? [{ name: "Lunch Allowance", amount: row.lunch }] : []),
      ...(row.transport > 0 ? [{ name: "Transport Allowance", amount: row.transport }] : []),
    ];
    payslipRows.push({
      payrollRunId: run.id,
      lineItemId: lineItem.id,
      employeeId,
      employeeName: row.fullName,
      position: row.position,
      department: null,
      period: PERIOD,
      payslipNumber: `${prefix}-${String(seq++).padStart(4, "0")}`,
      basicSalary: row.basic,
      shiftEarnings: 0,
      allowanceBreakdown,
      allowances: round2(row.housing + row.lunch + row.transport),
      overtime: row.overtime,
      bonuses: 0,
      otherEarnings: 0,
      grossPay: row.gross,
      paye: row.paye,
      napsa: row.napsa,
      nhima: row.nhima,
      loanDeduction: 0,
      advanceDeduction: row.advance,
      otherDeductions: round2(row.penalty + row.otherDeduction),
      totalDeductions: round2(row.napsa + row.nhima + row.paye + row.penalty + row.otherDeduction + row.advance),
      netPay: row.net,
      napsaEmployer: 0,
      nhimaEmployer: 0,
      totalEmployerContributions: 0,
      employeeNumber: row.employeeNumber,
      nrcNumber: row.nrc,
      contractStartDate: row.contractStart ? new Date(row.contractStart) : null,
      paymentMethod: row.payMethod === "Bank" ? "BANK_TRANSFER" : row.payMethod,
      paymentDate: null,
    });
  }
  await prisma.$transaction(payslipRows.map((p) => prisma.payslipRecord.create({ data: p })));
  console.log(`Payslip records created: ${payslipRows.length} (payslip numbers ${prefix}-0001 .. ${prefix}-${String(payslipRows.length).padStart(4, "0")}).`);

  console.log("== Import complete ==");
}

main()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
