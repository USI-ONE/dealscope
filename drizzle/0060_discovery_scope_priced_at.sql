-- Scope line prices are set per sales order; record when. Additive only.

ALTER TABLE discovery_scope_lines ADD COLUMN IF NOT EXISTS priced_at timestamptz;
