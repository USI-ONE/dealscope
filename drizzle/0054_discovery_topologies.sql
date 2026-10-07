-- Network topologies extracted from photos/screenshots. Additive only.

CREATE TABLE IF NOT EXISTS discovery_topologies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES discovery_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  source_kind text NOT NULL DEFAULT 'other',
  source_photo_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'extracting',
  graph jsonb,
  error text,
  model text,
  created_by_membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discovery_topologies_project_idx ON discovery_topologies(project_id);
