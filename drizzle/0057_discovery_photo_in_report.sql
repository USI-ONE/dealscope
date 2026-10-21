-- Let the walker pick which photos appear in the client assessment. Additive only.
ALTER TABLE discovery_photos ADD COLUMN IF NOT EXISTS in_report boolean NOT NULL DEFAULT false;
