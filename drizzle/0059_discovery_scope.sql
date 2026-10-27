-- Install scope / bill of materials for site walks. Additive only.

CREATE TABLE IF NOT EXISTS discovery_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'Other',
  vendor text,
  unit text NOT NULL DEFAULT 'ea',
  price_cents integer,
  recurring boolean NOT NULL DEFAULT false,
  qb_item text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS discovery_catalog_items_sku_idx ON discovery_catalog_items(organization_id, sku);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS discovery_scope_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES discovery_projects(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual',
  source_ref text,
  sku text NOT NULL,
  qty numeric(10, 2) NOT NULL DEFAULT 1,
  price_cents integer,
  reason text,
  notes text,
  included boolean NOT NULL DEFAULT true,
  edited boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS discovery_scope_lines_project_idx ON discovery_scope_lines(project_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS discovery_scope_lines_source_idx ON discovery_scope_lines(project_id, source_ref) WHERE source_ref IS NOT NULL;
