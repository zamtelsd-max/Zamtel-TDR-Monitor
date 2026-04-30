-- Add follow_up to ProspectStatus enum
ALTER TYPE "ProspectStatus" ADD VALUE IF NOT EXISTS 'follow_up';
