-- Migration: add ContractType enum to employee_contracts
-- 2026-09-29

CREATE TYPE "ContractType" AS ENUM (
  'PROBATION',
  'PERMANENT',
  'FIXED_TERM',
  'ANNUAL'
);

ALTER TABLE "employee_contracts"
  ADD COLUMN "contractType" "ContractType";
