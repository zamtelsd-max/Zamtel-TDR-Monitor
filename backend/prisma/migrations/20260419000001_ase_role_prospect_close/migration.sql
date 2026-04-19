-- Add ASE role to enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ASE';

-- Add closure tracking fields to prospects
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "closedByTdr" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "zbmApprovalRequired" BOOLEAN NOT NULL DEFAULT false;

-- Add aseId to users (ZBM assigns TDRs to an ASE)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "aseId" TEXT;
