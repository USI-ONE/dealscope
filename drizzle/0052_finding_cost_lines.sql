ALTER TABLE diligence_cost_lines
  ADD COLUMN IF NOT EXISTS finding_id uuid REFERENCES diligence_findings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_type text;

CREATE INDEX IF NOT EXISTS dil_cost_finding_idx ON diligence_cost_lines(finding_id) WHERE finding_id IS NOT NULL;
