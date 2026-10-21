-- Remediation tasks and client info requests for site walks. Additive only.

CREATE TABLE IF NOT EXISTS discovery_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES discovery_projects(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual',
  source_ref text,
  area text,
  title text NOT NULL,
  detail text,
  priority text NOT NULL DEFAULT 'Medium',
  status text NOT NULL DEFAULT 'open',
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  completed_by_membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  created_by_membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discovery_tasks_project_idx ON discovery_tasks(project_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS discovery_tasks_source_idx ON discovery_tasks(project_id, source_ref) WHERE source_ref IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS discovery_info_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES discovery_projects(id) ON DELETE CASCADE,
  token text NOT NULL,
  recipient_name text,
  recipient_email text,
  message text,
  question_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  sent_at timestamptz,
  first_viewed_at timestamptz,
  submitted_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_by_membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS discovery_info_requests_token_idx ON discovery_info_requests(token);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discovery_info_requests_project_idx ON discovery_info_requests(project_id);
