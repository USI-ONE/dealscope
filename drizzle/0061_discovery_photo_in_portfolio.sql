-- Let users pick key photos for the multi-site portfolio summary. Additive only.
ALTER TABLE discovery_photos ADD COLUMN IF NOT EXISTS in_portfolio boolean NOT NULL DEFAULT false;
