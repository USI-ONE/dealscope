-- Pre-install site discovery (mobile field walkthrough).
-- Additive only: four new discovery_* tables + one new enum.

DO $$ BEGIN
  CREATE TYPE discovery_project_status AS ENUM ('planning', 'in_progress', 'review', 'complete', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS discovery_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  template_key text NOT NULL DEFAULT 'pre_install_v1',
  status discovery_project_status NOT NULL DEFAULT 'planning',
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  engagement_id uuid REFERENCES diligence_engagements(id) ON DELETE SET NULL,
  site_address text,
  lead_membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  scheduled_date date,
  started_at timestamptz,
  completed_at timestamptz,
  summary text,
  na_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  archived_at timestamptz,
  created_by_membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discovery_projects_org_idx ON discovery_projects(organization_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discovery_projects_client_idx ON discovery_projects(client_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS discovery_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES discovery_projects(id) ON DELETE CASCADE,
  question_key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  not_applicable boolean NOT NULL DEFAULT false,
  notes text,
  answered_by_membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  client_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS discovery_answers_project_key_uq ON discovery_answers(project_id, question_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS discovery_records (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES discovery_projects(id) ON DELETE CASCADE,
  table_key text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  client_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discovery_records_project_table_idx ON discovery_records(project_id, table_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS discovery_photos (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES discovery_projects(id) ON DELETE CASCADE,
  question_key text,
  record_id uuid REFERENCES discovery_records(id) ON DELETE CASCADE,
  section_key text,
  url text NOT NULL,
  pathname text NOT NULL,
  mime_type text,
  size_bytes integer,
  width_px integer,
  height_px integer,
  caption text,
  taken_at timestamptz,
  uploaded_by_membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discovery_photos_project_idx ON discovery_photos(project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discovery_photos_question_idx ON discovery_photos(project_id, question_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discovery_photos_record_idx ON discovery_photos(record_id);
