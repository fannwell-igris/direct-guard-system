// Default values for every settings section.
// These are used when a section has never been saved to the DB yet.
// Frontend always gets a complete object — never null.

export const SETTINGS_DEFAULTS: Record<string, unknown> = {
  company: {
    name: "Magen Security Limited",
    legalName: "",
    registrationNumber: "",
    taxNumber: "",
    address: "",
    city: "Lusaka",
    country: "Zambia",
    phone: "",
    email: "",
    website: "",
    currency: "ZMW",
    currencySymbol: "K",
    dateFormat: "DD/MM/YYYY",
    timeZone: "Africa/Lusaka",
    logoUrl: null,
  },

  alerts: {
    contractExpiryDays: 30,        // warn this many days before contract expires
    payrollDueWarningDays: 7,       // warn this many days before end of month
    invoiceOverdueDays: 0,          // warn immediately when overdue (0 = on due date)
    lowStockThreshold: 5,           // warn when consumable qty <= this
    propertyNotReturnedDays: 7,     // warn when taken home longer than this many days
    taskOverdueEnabled: true,       // whether to show task overdue alerts
    rosterGapEnabled: true,         // whether to show roster gap alerts
  },

  finance: {
    defaultInvoiceDueDays: 30,      // default payment terms in days
    invoicePrefix: "INV",           // e.g. INV-2026-0001
    invoiceNumberSequences: {},     // { "2026": 399 } = next invoice number
                                     // to hand out for that year; see
                                     // invoices.service.ts generateInvoiceNumber
    invoiceNotes: "",               // default notes on every invoice
    paymentMethods: [
      "Bank Transfer",
      "Cash",
      "Mobile Money",
      "Cheque",
      "Other",
    ],
    expenseCategories: [
      "Fuel",
      "Repairs & Maintenance",
      "Office Expenses",
      "Equipment",
      "Transport",
      "Marketing",
      "Utilities",
      "Rent",
      "Staff Welfare",
      "Other",
    ],
  },

  inventory: {
    assetCategories: [
      "Computers & Laptops",
      "Furniture",
      "Printers & Copiers",
      "Uniforms",
      "Boots",
      "Jackets",
      "Caps",
      "Equipment",
      "Office Supplies",
      "Vehicles",
      "Other",
    ],
    assetConditions: [
      "New",
      "Good",
      "Fair",
      "Poor",
      "Under Repair",
      "Condemned",
    ],
    locations: [
      "Head Office",
      "Warehouse",
      "Other",
    ],
    defaultLowStockThreshold: 5,
    defaultCanTakeHome: false,
  },

  reports: {
    headerTitle: "Magen Security Limited",
    headerSubtitle: "",
    footerText: "Confidential — For internal use only",
    showLogo: true,
    showPageNumbers: true,
    dateFormat: "DD/MM/YYYY",
    paperSize: "A4",
  },

  payroll: {
    payFrequency: "MONTHLY",        // MONTHLY | BIWEEKLY | WEEKLY
    payrollPrefix: "PAY",           // e.g. PAY-2026-09
    payslipPrefix: "PSL",           // e.g. PSL-2026-0001
    approvalRequired: true,         // whether payroll requires review before finalize
    defaultPayDay: 25,              // day of month payroll is typically paid
    napsaRate: 5,                   // % employee contribution (configurable — can change)
    nhimaRate: 1,                   // % employee contribution
    napsaCeiling: 1073.20,          // monthly ceiling in ZMW
  },

  operations: {
    shiftTypes: ["Day", "Night", "Split", "Other"],
    coverageThreshold: 80,          // % below which a site is flagged as under-covered
    operationalIssueCategories: [
      "Security Breach",
      "Equipment Failure",
      "Staff Absence",
      "Client Complaint",
      "Incident",
      "Other",
    ],
    replacementReasons: [
      "Sick Leave",
      "Annual Leave",
      "No Show",
      "Emergency",
      "Other",
    ],
    siteIssueSeverities: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
  },
};

export const VALID_SECTIONS = Object.keys(SETTINGS_DEFAULTS);
