-- Cached AI narratives for client site assessments and multi-site portfolios. Additive only.

CREATE TABLE IF NOT EXISTS discovery_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  report_key text NOT NULL,
  source_hash text NOT NULL,
  content jsonb NOT NULL,
  model text,
  created_by_membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS discovery_reports_key_idx ON discovery_reports(organization_id, kind, report_key);
