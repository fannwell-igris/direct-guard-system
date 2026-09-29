-- Leave management: accrual (2 days/month) + deduction tracking per employee.
-- Accrual entries are written lazily (on-demand when the leave panel opens),
-- so no scheduled job is needed. Balance = sum(accruals) - sum(deductions).

CREATE TABLE "leave_accruals" (
    "id"           TEXT NOT NULL,
    "employeeId"   TEXT NOT NULL,
    "accrualYear"  INTEGER NOT NULL,
    "accrualMonth" INTEGER NOT NULL,
    "days"         DECIMAL(5,2) NOT NULL DEFAULT 2,
    "dateCreated"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_accruals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "leave_accruals_employeeId_accrualYear_accrualMonth_key"
  ON "leave_accruals"("employeeId", "accrualYear", "accrualMonth");
CREATE INDEX "leave_accruals_employeeId_idx" ON "leave_accruals"("employeeId");
ALTER TABLE "leave_accruals"
  ADD CONSTRAINT "leave_accruals_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "leave_deductions" (
    "id"            TEXT NOT NULL,
    "employeeId"    TEXT NOT NULL,
    "days"          DECIMAL(5,2) NOT NULL,
    "deductionDate" TIMESTAMP(3) NOT NULL,
    "reason"        TEXT,
    "recordedBy"    TEXT,
    "dateCreated"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leave_deductions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leave_deductions_employeeId_idx" ON "leave_deductions"("employeeId");
CREATE INDEX "leave_deductions_deductionDate_idx" ON "leave_deductions"("deductionDate");
ALTER TABLE "leave_deductions"
  ADD CONSTRAINT "leave_deductions_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
