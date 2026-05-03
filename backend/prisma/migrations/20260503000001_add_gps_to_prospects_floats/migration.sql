-- Add GPS coordinates to prospects
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Add GPS coordinates to float_issues
ALTER TABLE float_issues ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE float_issues ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
