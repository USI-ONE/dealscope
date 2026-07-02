/**
 * Adds the DealScope MA domain tables to the database.
 * Safe to run multiple times — all statements use IF NOT EXISTS.
 * Run: pnpm tsx scripts/migrate-ma-tables.ts
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function run() {
  console.log("Applying DealScope MA table migrations...");

  // ── ENUMS ──────────────────────────────────────────────────────────────────

  const enums: [string, string[]][] = [
    ["ma_contract_type", ["customer","vendor","employment","ip_assignment","lease","loan","nda","partnership","regulatory","other"]],
    ["ma_assignable", ["yes","no","with_consent","unknown"]],
    ["ma_ip_type", ["patent","trademark","trade_secret","copyright","domain","software_license","open_source_component","other"]],
    ["ma_litigation_status", ["pending","active","settled","dismissed","judgment","appeal","closed"]],
    ["ma_litigation_claim_type", ["employment","ip","commercial","regulatory","environmental","tax","personal_injury","other"]],
    ["ma_plaintiff_or_defendant", ["plaintiff","defendant","third_party"]],
    ["ma_regulatory_matter_type", ["investigation","audit","notice","consent_order","fine","license_issue","permit_issue","other"]],
    ["ma_regulatory_status", ["open","resolved","ongoing","pending_response"]],
    ["ma_statement_type", ["income_statement","balance_sheet","cash_flow","trial_balance","tax_return","audit_report","management_accounts"]],
    ["ma_debt_instrument_type", ["term_loan","revolver","line_of_credit","equipment_financing","mortgage","convertible_note","sba_loan","seller_note","bonds","other"]],
    ["ma_contract_status", ["under_contract","month_to_month","no_contract","expired","unknown"]],
    ["ma_churn_risk", ["low","medium","high","unknown"]],
    ["ma_working_capital_item_type", ["accounts_receivable","inventory","prepaid","accounts_payable","accrued_liabilities","deferred_revenue","other_current_asset","other_current_liability"]],
    ["ma_property_type", ["office","warehouse","manufacturing","retail","mixed_use","land","data_center","other"]],
    ["ma_ownership_type", ["owned","leased","subleased","licensed","other"]],
    ["ma_property_condition", ["excellent","good","fair","poor","unknown"]],
    ["ma_environmental_severity", ["low","medium","high","critical"]],
    ["ma_environmental_status", ["identified","under_assessment","remediation_in_progress","remediated","closed","no_action_required"]],
    ["ma_employment_type", ["full_time","part_time","contractor","temp","intern"]],
    ["ma_benefits_plan_type", ["medical","dental","vision","life","std","ltd","401k","pension","equity","other"]],
    ["ma_retention_risk", ["low","medium","high","unknown"]],
    ["ma_labor_matter_type", ["wage_hour","discrimination","harassment","wrongful_termination","nlrb","osha","other"]],
    ["ma_labor_matter_status", ["open","resolved","settled","dismissed","pending"]],
  ];

  for (const [name, values] of enums) {
    // Check if type exists first
    const exists = await sql`
      SELECT 1 FROM pg_type WHERE typname = ${name}
    `;
    if (exists.length > 0) {
      console.log(`  enum ${name}: already exists, skipping`);
      continue;
    }
    const valueList = values.map((v) => `'${v}'`).join(", ");
    // neon HTTP client accepts a plain string call (same overload, no .unsafe method)
    await (sql as any)(`CREATE TYPE ${name} AS ENUM (${valueList})`);
    console.log(`  enum ${name}: created`);
  }

  // ── TABLES ─────────────────────────────────────────────────────────────────

  const tables: { name: string; sql: string }[] = [
    {
      name: "ma_contracts",
      sql: `CREATE TABLE IF NOT EXISTS ma_contracts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        title text NOT NULL,
        contract_type ma_contract_type NOT NULL,
        parties text,
        effective_date date,
        expiry_date date,
        auto_renews boolean NOT NULL DEFAULT false,
        assignable ma_assignable NOT NULL DEFAULT 'unknown',
        change_of_control_clause boolean NOT NULL DEFAULT false,
        notice_required_days integer,
        annual_value_cents integer,
        risk_level diligence_risk_level NOT NULL DEFAULT 'info',
        summary text,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_ip_items",
      sql: `CREATE TABLE IF NOT EXISTS ma_ip_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        ip_type ma_ip_type NOT NULL,
        title text NOT NULL,
        jurisdiction text,
        registration_number text,
        filing_date date,
        expiry_date date,
        owner text,
        assigned_to_company boolean NOT NULL DEFAULT true,
        encumbered boolean NOT NULL DEFAULT false,
        risk_level diligence_risk_level NOT NULL DEFAULT 'info',
        summary text,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_litigations",
      sql: `CREATE TABLE IF NOT EXISTS ma_litigations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        case_title text NOT NULL,
        case_number text,
        court text,
        status ma_litigation_status NOT NULL DEFAULT 'pending',
        claim_type ma_litigation_claim_type NOT NULL,
        plaintiff_or_defendant ma_plaintiff_or_defendant NOT NULL,
        exposure_low_cents integer,
        exposure_high_cents integer,
        provisioned boolean NOT NULL DEFAULT false,
        provision_amount_cents integer,
        filed_date date,
        expected_resolution_date date,
        summary text,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_regulatory_matters",
      sql: `CREATE TABLE IF NOT EXISTS ma_regulatory_matters (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        agency text NOT NULL,
        matter_type ma_regulatory_matter_type NOT NULL,
        status ma_regulatory_status NOT NULL DEFAULT 'open',
        description text,
        fine_amount_cents integer,
        resolved_date date,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_financial_statements",
      sql: `CREATE TABLE IF NOT EXISTS ma_financial_statements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        statement_type ma_statement_type NOT NULL,
        period_start date,
        period_end date,
        audited boolean NOT NULL DEFAULT false,
        auditor_name text,
        currency text NOT NULL DEFAULT 'USD',
        revenue_cents integer,
        gross_profit_cents integer,
        ebitda_cents integer,
        net_income_cents integer,
        total_assets_cents integer,
        total_liabilities_cents integer,
        total_equity_cents integer,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_debt_instruments",
      sql: `CREATE TABLE IF NOT EXISTS ma_debt_instruments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        instrument_type ma_debt_instrument_type NOT NULL,
        lender_name text NOT NULL,
        principal_cents integer,
        outstanding_cents integer,
        interest_rate text,
        maturity_date date,
        personal_guarantee boolean NOT NULL DEFAULT false,
        secured boolean NOT NULL DEFAULT false,
        collateral text,
        change_of_control_clause boolean NOT NULL DEFAULT false,
        covenants text,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_customer_revenues",
      sql: `CREATE TABLE IF NOT EXISTS ma_customer_revenues (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        customer_name text NOT NULL,
        annual_revenue_cents integer,
        revenue_percent text,
        contract_status ma_contract_status NOT NULL DEFAULT 'unknown',
        contract_expiry_date date,
        churn_risk ma_churn_risk NOT NULL DEFAULT 'unknown',
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_working_capital_items",
      sql: `CREATE TABLE IF NOT EXISTS ma_working_capital_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        item_type ma_working_capital_item_type NOT NULL,
        description text,
        amount_cents integer,
        aging_days integer,
        normalized_amount_cents integer,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_real_properties",
      sql: `CREATE TABLE IF NOT EXISTS ma_real_properties (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        address text NOT NULL,
        property_type ma_property_type NOT NULL DEFAULT 'office',
        ownership_type ma_ownership_type NOT NULL DEFAULT 'leased',
        square_footage integer,
        condition ma_property_condition NOT NULL DEFAULT 'unknown',
        year_built integer,
        deferred_maintenance_cents integer,
        environmental_issues boolean NOT NULL DEFAULT false,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_leases",
      sql: `CREATE TABLE IF NOT EXISTS ma_leases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        property_id uuid REFERENCES ma_real_properties(id) ON DELETE SET NULL,
        location_description text NOT NULL,
        landlord_name text,
        lease_start date,
        lease_expiry date,
        monthly_rent_cents integer,
        has_renewal_options boolean NOT NULL DEFAULT false,
        renewal_terms text,
        assignable boolean NOT NULL DEFAULT false,
        change_of_control_clause boolean NOT NULL DEFAULT false,
        personal_guarantee boolean NOT NULL DEFAULT false,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_environmental_items",
      sql: `CREATE TABLE IF NOT EXISTS ma_environmental_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        property_id uuid REFERENCES ma_real_properties(id) ON DELETE SET NULL,
        issue_type text NOT NULL,
        severity ma_environmental_severity NOT NULL DEFAULT 'low',
        remediation_required boolean NOT NULL DEFAULT false,
        estimated_remediation_cents integer,
        status ma_environmental_status NOT NULL DEFAULT 'identified',
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_headcount_snapshots",
      sql: `CREATE TABLE IF NOT EXISTS ma_headcount_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        snapshot_date date,
        department text NOT NULL,
        employment_type ma_employment_type NOT NULL DEFAULT 'full_time',
        headcount integer NOT NULL DEFAULT 0,
        average_base_salary_cents integer,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_benefits_plans",
      sql: `CREATE TABLE IF NOT EXISTS ma_benefits_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        plan_type ma_benefits_plan_type NOT NULL,
        carrier text,
        plan_name text,
        employee_cost_cents integer,
        employer_cost_cents integer,
        renewal_date date,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_key_people",
      sql: `CREATE TABLE IF NOT EXISTS ma_key_people (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        full_name text NOT NULL,
        title text,
        department text,
        base_salary_cents integer,
        total_comp_cents integer,
        retention_risk ma_retention_risk NOT NULL DEFAULT 'unknown',
        flight_risk boolean NOT NULL DEFAULT false,
        has_non_compete boolean NOT NULL DEFAULT false,
        has_non_solicitation boolean NOT NULL DEFAULT false,
        equity_holder boolean NOT NULL DEFAULT false,
        equity_details text,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "ma_labor_matters",
      sql: `CREATE TABLE IF NOT EXISTS ma_labor_matters (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES diligence_engagements(id) ON DELETE CASCADE,
        matter_type ma_labor_matter_type NOT NULL,
        description text NOT NULL,
        status ma_labor_matter_status NOT NULL DEFAULT 'open',
        affected_headcount integer,
        exposure_cents integer,
        filed_date date,
        notes text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )`,
    },
  ];

  for (const t of tables) {
    await (sql as any)(t.sql);
    console.log(`  table ${t.name}: OK`);
  }

  // ── INDEXES ────────────────────────────────────────────────────────────────

  const indexes = [
    "CREATE INDEX IF NOT EXISTS ma_contracts_org_idx ON ma_contracts(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_contracts_engagement_idx ON ma_contracts(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_ip_items_org_idx ON ma_ip_items(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_ip_items_engagement_idx ON ma_ip_items(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_litigations_org_idx ON ma_litigations(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_litigations_engagement_idx ON ma_litigations(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_regulatory_matters_org_idx ON ma_regulatory_matters(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_regulatory_matters_engagement_idx ON ma_regulatory_matters(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_financial_statements_org_idx ON ma_financial_statements(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_financial_statements_engagement_idx ON ma_financial_statements(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_debt_instruments_org_idx ON ma_debt_instruments(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_debt_instruments_engagement_idx ON ma_debt_instruments(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_customer_revenues_org_idx ON ma_customer_revenues(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_customer_revenues_engagement_idx ON ma_customer_revenues(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_working_capital_items_org_idx ON ma_working_capital_items(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_working_capital_items_engagement_idx ON ma_working_capital_items(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_real_properties_org_idx ON ma_real_properties(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_real_properties_engagement_idx ON ma_real_properties(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_leases_org_idx ON ma_leases(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_leases_engagement_idx ON ma_leases(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_environmental_items_org_idx ON ma_environmental_items(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_environmental_items_engagement_idx ON ma_environmental_items(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_headcount_snapshots_org_idx ON ma_headcount_snapshots(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_headcount_snapshots_engagement_idx ON ma_headcount_snapshots(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_benefits_plans_org_idx ON ma_benefits_plans(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_benefits_plans_engagement_idx ON ma_benefits_plans(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_key_people_org_idx ON ma_key_people(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_key_people_engagement_idx ON ma_key_people(engagement_id)",
    "CREATE INDEX IF NOT EXISTS ma_labor_matters_org_idx ON ma_labor_matters(organization_id)",
    "CREATE INDEX IF NOT EXISTS ma_labor_matters_engagement_idx ON ma_labor_matters(engagement_id)",
  ];

  for (const idx of indexes) {
    await (sql as any)(idx);
  }
  console.log(`  indexes: OK`);

  console.log("\nDone. All MA tables are in place.");
}

run().catch((e) => { console.error(e); process.exit(1); });
