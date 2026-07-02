/**
 * DealScope — M&A question library for non-IT tracks.
 *
 * Covers Legal, Finance, Facilities, and HR diligence. The IT track
 * lives in `question-library.ts`. Each question has a stable `key`
 * (never change once shipped) and a `track` field that drives which
 * tab/section it appears in on the engagement page.
 *
 * Key conventions:
 *   "<track>.<category-slug>.<short-name>"
 *   e.g. "legal.contracts.change_of_control"
 */

export type MaTrack = "legal" | "finance" | "facilities" | "hr";

export type MaQuestionKind =
  | "text"
  | "longtext"
  | "yes_no"
  | "number"
  | "select"
  | "multiselect";

export type MaQuestion = {
  /** Stable identifier — used as the storage key. Never change once shipped. */
  key: string;
  track: MaTrack;
  category: string;
  subcategory: string;
  text: string;
  hint?: string;
  kind: MaQuestionKind;
  options?: string[];
  unit?: string;
};

/* ============================================================================
 * LEGAL TRACK
 * ========================================================================== */
const LEGAL: MaQuestion[] = [
  /* --- Corporate structure & governance --------------------------------- */
  q("legal.corporate.entity_structure", "legal", "Corporate", "Entity structure", "Legal entity type(s) and jurisdiction(s) of incorporation", "longtext", { hint: "C-Corp, S-Corp, LLC, LP, etc. State/country of formation for each entity." }),
  q("legal.corporate.subsidiary_list", "legal", "Corporate", "Entity structure", "Full list of subsidiaries, JVs, and affiliates with ownership percentages", "longtext"),
  q("legal.corporate.cap_table", "legal", "Corporate", "Cap table", "Current capitalization table — common, preferred, options, warrants, SAFEs, convertibles", "longtext"),
  q("legal.corporate.founder_equity", "legal", "Corporate", "Cap table", "Founder/key employee equity — vesting schedules and acceleration provisions", "longtext"),
  q("legal.corporate.board_composition", "legal", "Corporate", "Governance", "Board composition — members, investor seats, independent directors", "longtext"),
  q("legal.corporate.board_minutes", "legal", "Corporate", "Governance", "Board and shareholder meeting minutes current and complete?", "yes_no"),
  q("legal.corporate.good_standing", "legal", "Corporate", "Governance", "Is the entity in good standing in all states/jurisdictions where it operates?", "yes_no"),
  q("legal.corporate.foreign_qualifications", "legal", "Corporate", "Governance", "Foreign qualifications filed where required?", "longtext"),
  q("legal.corporate.shareholder_agreements", "legal", "Corporate", "Governance", "Shareholder / LLC operating agreement — ROFR, drag-along, co-sale provisions", "longtext"),
  q("legal.corporate.prior_transactions", "legal", "Corporate", "History", "Prior M&A transactions (acquisitions, divestitures, spin-offs) in last 5 years", "longtext"),

  /* --- Material contracts ------------------------------------------------- */
  q("legal.contracts.customer_top10", "legal", "Contracts", "Customer contracts", "Top 10 customer contracts by revenue — term, renewal, CoC provisions", "longtext"),
  q("legal.contracts.vendor_critical", "legal", "Contracts", "Vendor contracts", "Critical vendor/supplier contracts — sole-source dependencies, minimum commitments", "longtext"),
  q("legal.contracts.change_of_control", "legal", "Contracts", "Change of control", "Number of material contracts with change-of-control clauses requiring consent", "number", { unit: "contracts" }),
  q("legal.contracts.coc_consent_strategy", "legal", "Contracts", "Change of control", "Plan for obtaining CoC consents before or after close", "longtext"),
  q("legal.contracts.assignment_restrictions", "legal", "Contracts", "Assignability", "Contracts that cannot be assigned and require novation", "longtext"),
  q("legal.contracts.auto_renewals_near", "legal", "Contracts", "Renewals", "Material contracts auto-renewing within 90 days of expected close", "longtext"),
  q("legal.contracts.earnout_obligations", "legal", "Contracts", "Obligations", "Any earnout, milestone payment, or contingent compensation obligations?", "yes_no"),
  q("legal.contracts.earnout_detail", "legal", "Contracts", "Obligations", "Earnout details — triggers, amounts, dispute resolution", "longtext"),
  q("legal.contracts.exclusivity", "legal", "Contracts", "Obligations", "Any exclusivity or non-compete arrangements with customers/partners?", "longtext"),
  q("legal.contracts.most_favored_nation", "legal", "Contracts", "Obligations", "Most-favored-nation or pricing parity clauses with customers?", "longtext"),
  q("legal.contracts.government_contracts", "legal", "Contracts", "Government", "Any government/public-sector contracts? FAR/DFAR applicability?", "longtext"),

  /* --- Intellectual property -------------------------------------------- */
  q("legal.ip.patent_inventory", "legal", "IP", "Patents", "Issued and pending patents — jurisdiction, coverage, expiry", "longtext"),
  q("legal.ip.trademark_inventory", "legal", "IP", "Trademarks", "Registered trademarks and service marks — brands, logos, product names", "longtext"),
  q("legal.ip.trade_secrets", "legal", "IP", "Trade secrets", "Key trade secrets and how they are protected (NDAs, access controls)", "longtext"),
  q("legal.ip.domain_names", "legal", "IP", "Domains", "Domain names owned and registrar", "longtext"),
  q("legal.ip.software_ownership", "legal", "IP", "Software", "Who owns the IP in software created by employees and contractors?", "longtext"),
  q("legal.ip.open_source_compliance", "legal", "IP", "Software", "Open-source usage audit — any GPL/AGPL components in commercial products?", "longtext"),
  q("legal.ip.third_party_licenses", "legal", "IP", "Licenses", "Third-party IP licenses the business depends on (in-licensed)", "longtext"),
  q("legal.ip.out_licensed", "legal", "IP", "Licenses", "IP licensed out to third parties", "longtext"),
  q("legal.ip.ip_assignments", "legal", "IP", "Assignments", "IP assignment agreements signed by all current and former employees/contractors?", "yes_no"),
  q("legal.ip.infringement_claims", "legal", "IP", "Claims", "Any pending or threatened IP infringement claims (given or received)?", "longtext"),

  /* --- Litigation & disputes -------------------------------------------- */
  q("legal.litigation.pending_list", "legal", "Litigation", "Pending matters", "All pending litigation, arbitration, and administrative proceedings", "longtext"),
  q("legal.litigation.threatened_claims", "legal", "Litigation", "Threatened claims", "Threatened claims or demand letters not yet in formal proceedings", "longtext"),
  q("legal.litigation.total_exposure", "legal", "Litigation", "Exposure", "Total aggregate litigation exposure (low/high estimate)", "longtext"),
  q("legal.litigation.insurance_coverage", "legal", "Litigation", "Insurance", "D&O, E&O, and general liability coverage limits and current claims", "longtext"),
  q("legal.litigation.settlements_last3", "legal", "Litigation", "History", "Material litigation settlements in last 3 years — amount, nature", "longtext"),
  q("legal.litigation.employment_claims", "legal", "Litigation", "Employment", "Employment-related claims — EEOC, wrongful termination, harassment, discrimination", "longtext"),

  /* --- Regulatory & compliance ------------------------------------------ */
  q("legal.regulatory.licenses_permits", "legal", "Regulatory", "Licenses & permits", "Material business licenses and permits required to operate", "longtext"),
  q("legal.regulatory.transferable", "legal", "Regulatory", "Licenses & permits", "Which licenses are transferable vs. require re-application post-close?", "longtext"),
  q("legal.regulatory.industry_regs", "legal", "Regulatory", "Industry-specific", "Sector-specific regulatory requirements (FINRA, FDA, FCC, FERC, etc.)", "longtext"),
  q("legal.regulatory.regulatory_investigations", "legal", "Regulatory", "Investigations", "Any open regulatory investigations, audits, or consent orders?", "longtext"),
  q("legal.regulatory.export_controls", "legal", "Regulatory", "Export controls", "ITAR, EAR, or other export control applicability?", "yes_no"),
  q("legal.regulatory.anti_bribery", "legal", "Regulatory", "Anti-corruption", "FCPA/UK Bribery Act compliance — international operations, third-party agents?", "longtext"),

  /* --- Data privacy & cyber --------------------------------------------- */
  q("legal.privacy.frameworks_applicable", "legal", "Privacy", "Frameworks", "Applicable privacy frameworks (GDPR, CCPA, HIPAA, GLBA, FERPA, etc.)", "multiselect", { options: ["GDPR", "UK GDPR", "CCPA / CPRA", "HIPAA", "GLBA", "FERPA", "PIPEDA", "LGPD", "APPI", "None applicable"] }),
  q("legal.privacy.privacy_policy", "legal", "Privacy", "Policies", "Current privacy policy — last updated, covers all data collection?", "longtext"),
  q("legal.privacy.dpa_coverage", "legal", "Privacy", "Data processing", "DPAs / data processing agreements in place with all processors?", "yes_no"),
  q("legal.privacy.data_breach_history", "legal", "Privacy", "Incidents", "Data breaches or privacy incidents in last 3 years — notifications made?", "longtext"),
  q("legal.privacy.cross_border_transfers", "legal", "Privacy", "Data processing", "Cross-border data transfers and applicable mechanisms (SCCs, BCRs, adequacy)", "longtext"),
  q("legal.privacy.consent_management", "legal", "Privacy", "Consent", "Cookie consent and marketing consent management in place?", "yes_no"),

  /* --- Employment law ---------------------------------------------------- */
  q("legal.employment.agreements_coverage", "legal", "Employment", "Agreements", "% of employees with signed offer letters / employment agreements", "text"),
  q("legal.employment.noncompete_coverage", "legal", "Employment", "Agreements", "Employees with enforceable non-compete agreements — jurisdictions", "longtext"),
  q("legal.employment.handbook_current", "legal", "Employment", "Policies", "Employee handbook current and legally reviewed?", "yes_no"),
  q("legal.employment.handbook_date", "legal", "Employment", "Policies", "Date of last handbook review", "text"),
  q("legal.employment.misclassification", "legal", "Employment", "Classification", "Any contractor-vs-employee misclassification risk?", "longtext"),
  q("legal.employment.wage_hour_compliance", "legal", "Employment", "Compliance", "Wage and hour compliance — overtime exemptions reviewed, state law compliance?", "longtext"),
];

/* ============================================================================
 * FINANCE TRACK
 * ========================================================================== */
const FINANCE: MaQuestion[] = [
  /* --- Financial overview ------------------------------------------------ */
  q("finance.overview.fiscal_year_end", "finance", "Overview", "Financial year", "Fiscal year end date", "text"),
  q("finance.overview.accounting_basis", "finance", "Overview", "Financial year", "Accounting basis", "select", { options: ["GAAP", "Cash", "IFRS", "Modified cash", "Tax basis", "Other"] }),
  q("finance.overview.auditor", "finance", "Overview", "Audit", "CPA firm and type of engagement (audit, review, compilation, tax-only)", "text"),
  q("finance.overview.last_audit_date", "finance", "Overview", "Audit", "Most recent audit / review completion date", "text"),
  q("finance.overview.audit_opinions", "finance", "Overview", "Audit", "Audit opinion type in last 3 years", "select", { options: ["Unqualified (clean)", "Qualified", "Adverse", "Disclaimer", "Review only", "Compilation only"] }),
  q("finance.overview.internal_controls", "finance", "Overview", "Controls", "Material weaknesses or significant deficiencies noted by auditors?", "longtext"),
  q("finance.overview.restatements", "finance", "Overview", "History", "Any financial restatements in last 5 years?", "yes_no"),
  q("finance.overview.restatement_detail", "finance", "Overview", "History", "Restatement details — reason and impact", "longtext"),
  q("finance.overview.erp_platform", "finance", "Overview", "Systems", "Accounting / ERP platform", "text"),
  q("finance.overview.close_timeline", "finance", "Overview", "Systems", "Monthly close timeline (how many days to close each month)", "number", { unit: "days" }),

  /* --- Revenue & growth -------------------------------------------------- */
  q("finance.revenue.ttm_total", "finance", "Revenue", "Run rate", "Trailing 12-month total revenue", "number", { unit: "$/yr" }),
  q("finance.revenue.3yr_history", "finance", "Revenue", "History", "Revenue for each of the last 3 fiscal years", "longtext"),
  q("finance.revenue.growth_rate", "finance", "Revenue", "History", "Organic revenue CAGR over last 3 years", "number", { unit: "%" }),
  q("finance.revenue.recurring_pct", "finance", "Revenue", "Quality", "% of revenue that is recurring (subscriptions, contracts, retainers)", "number", { unit: "%" }),
  q("finance.revenue.revenue_model", "finance", "Revenue", "Quality", "Revenue model breakdown (recurring, project, product, other)", "longtext"),
  q("finance.revenue.seasonality", "finance", "Revenue", "Quality", "Material revenue seasonality?", "longtext"),
  q("finance.revenue.customer_concentration", "finance", "Revenue", "Concentration", "Top customer as % of total revenue", "number", { unit: "%" }),
  q("finance.revenue.top5_concentration", "finance", "Revenue", "Concentration", "Top 5 customers as % of total revenue", "number", { unit: "%" }),
  q("finance.revenue.churn_rate", "finance", "Revenue", "Quality", "Annual revenue / customer churn rate", "number", { unit: "%" }),
  q("finance.revenue.net_revenue_retention", "finance", "Revenue", "Quality", "Net revenue retention (for SaaS / subscription businesses)", "number", { unit: "%" }),
  q("finance.revenue.backlog", "finance", "Revenue", "Pipeline", "Current contracted backlog / revenue under contract not yet recognized", "number", { unit: "$" }),
  q("finance.revenue.pipeline", "finance", "Revenue", "Pipeline", "Active sales pipeline — total and weighted", "longtext"),
  q("finance.revenue.recognized_deferred", "finance", "Revenue", "Quality", "Deferred revenue balance — nature and typical recognition timeline", "longtext"),

  /* --- Profitability ----------------------------------------------------- */
  q("finance.profit.gross_margin", "finance", "Profitability", "Margins", "Gross margin % (TTM)", "number", { unit: "%" }),
  q("finance.profit.ebitda_ttm", "finance", "Profitability", "EBITDA", "Adjusted EBITDA (TTM)", "number", { unit: "$" }),
  q("finance.profit.ebitda_margin", "finance", "Profitability", "EBITDA", "Adjusted EBITDA margin %", "number", { unit: "%" }),
  q("finance.profit.ebitda_adjustments", "finance", "Profitability", "EBITDA", "EBITDA normalization adjustments — owner comp, one-times, non-recurring items", "longtext"),
  q("finance.profit.owner_comp_above_market", "finance", "Profitability", "EBITDA", "Owner/founder compensation above market replacement cost", "number", { unit: "$/yr" }),
  q("finance.profit.nonrecurring_items", "finance", "Profitability", "EBITDA", "Non-recurring revenue or expense items in last 12 months", "longtext"),
  q("finance.profit.capex_ttm", "finance", "Profitability", "CapEx", "CapEx in last 12 months (maintenance vs. growth breakdown)", "longtext"),
  q("finance.profit.capex_requirements", "finance", "Profitability", "CapEx", "Anticipated CapEx over next 2 years", "longtext"),

  /* --- Balance sheet & working capital ----------------------------------- */
  q("finance.balance.cash_on_hand", "finance", "Balance sheet", "Cash", "Cash and cash equivalents on hand", "number", { unit: "$" }),
  q("finance.balance.total_debt", "finance", "Balance sheet", "Debt", "Total funded debt outstanding", "number", { unit: "$" }),
  q("finance.balance.net_debt", "finance", "Balance sheet", "Debt", "Net debt (total debt minus cash)", "number", { unit: "$" }),
  q("finance.balance.debt_terms", "finance", "Balance sheet", "Debt", "Debt structure — tranches, maturity, interest, covenants", "longtext"),
  q("finance.balance.peg_to_be_assumed", "finance", "Balance sheet", "Debt", "Debt that acquirer will assume at close", "longtext"),
  q("finance.balance.ar_days", "finance", "Balance sheet", "Working capital", "Accounts receivable DSO (days sales outstanding)", "number", { unit: "days" }),
  q("finance.balance.ar_aging_over90", "finance", "Balance sheet", "Working capital", "AR aging > 90 days as % of total AR", "number", { unit: "%" }),
  q("finance.balance.bad_debt_rate", "finance", "Balance sheet", "Working capital", "Historical bad debt / write-off rate", "number", { unit: "%" }),
  q("finance.balance.ap_days", "finance", "Balance sheet", "Working capital", "Accounts payable DPO (days payable outstanding)", "number", { unit: "days" }),
  q("finance.balance.inventory_turns", "finance", "Balance sheet", "Working capital", "Inventory turns (for product businesses)", "number", { unit: "x/yr" }),
  q("finance.balance.normalized_working_capital", "finance", "Balance sheet", "Working capital", "Normalized working capital target and methodology", "longtext"),
  q("finance.balance.off_balance_items", "finance", "Balance sheet", "Off-balance", "Material off-balance-sheet obligations (operating leases pre-ASC 842, contingent liabilities)", "longtext"),

  /* --- Cash flow --------------------------------------------------------- */
  q("finance.cashflow.fcf_ttm", "finance", "Cash flow", "FCF", "Free cash flow (TTM)", "number", { unit: "$" }),
  q("finance.cashflow.fcf_conversion", "finance", "Cash flow", "FCF", "FCF conversion rate (FCF / EBITDA %)", "number", { unit: "%" }),
  q("finance.cashflow.cash_burn", "finance", "Cash flow", "FCF", "Is the business cash flow positive? If not, monthly burn rate", "longtext"),
  q("finance.cashflow.seasonal_needs", "finance", "Cash flow", "FCF", "Seasonal working capital needs or credit facility draws", "longtext"),

  /* --- Tax --------------------------------------------------------------- */
  q("finance.tax.structure", "finance", "Tax", "Structure", "Entity tax status (C-Corp, S-Corp, LLC pass-through, etc.)", "select", { options: ["C-Corp (federal/state income tax)", "S-Corp (pass-through)", "LLC taxed as partnership", "LLC taxed as S-Corp", "LLC taxed as C-Corp", "Partnership", "Sole proprietorship"] }),
  q("finance.tax.nols", "finance", "Tax", "NOLs & credits", "Net operating losses (NOLs) — federal and state, expiry, 382 limitation risk?", "longtext"),
  q("finance.tax.open_tax_years", "finance", "Tax", "Audits", "Open tax years at federal and state level", "text"),
  q("finance.tax.audit_history", "finance", "Tax", "Audits", "Tax audits in last 5 years — jurisdictions and outcomes", "longtext"),
  q("finance.tax.state_nexus", "finance", "Tax", "Nexus", "States where the company has tax nexus — income and sales tax", "longtext"),
  q("finance.tax.sales_tax_compliance", "finance", "Tax", "Sales tax", "Sales tax collection and remittance compliance — any exposure?", "longtext"),
  q("finance.tax.transfer_pricing", "finance", "Tax", "Transfer pricing", "Intercompany transactions and transfer pricing documentation (for multi-entity)", "longtext"),
  q("finance.tax.deferred_tax", "finance", "Tax", "Structure", "Material deferred tax assets or liabilities", "longtext"),

  /* --- Financial controls & reporting ------------------------------------ */
  q("finance.controls.segregation_of_duties", "finance", "Controls", "Internal controls", "Segregation of duties in place for financial processes?", "longtext"),
  q("finance.controls.approval_matrix", "finance", "Controls", "Internal controls", "Spend approval matrix — who can approve what amounts?", "longtext"),
  q("finance.controls.procurement_process", "finance", "Controls", "Internal controls", "Procurement and PO process", "longtext"),
  q("finance.controls.expense_reporting", "finance", "Controls", "Internal controls", "Expense reporting process and policy", "text"),
  q("finance.controls.bank_reconciliations", "finance", "Controls", "Internal controls", "Monthly bank reconciliations performed and reviewed?", "yes_no"),
  q("finance.controls.management_reporting", "finance", "Controls", "Reporting", "Management reporting package — what's produced, how often, to whom", "longtext"),
  q("finance.controls.kpi_dashboard", "finance", "Controls", "Reporting", "KPIs tracked on a regular basis (revenue, margins, collections, etc.)", "longtext"),
  q("finance.controls.revenue_recognition", "finance", "Controls", "Reporting", "Revenue recognition policy — ASC 606 compliant?", "longtext"),
];

/* ============================================================================
 * FACILITIES TRACK
 * ========================================================================== */
const FACILITIES: MaQuestion[] = [
  /* --- Property overview ------------------------------------------------- */
  q("facilities.overview.total_locations", "facilities", "Overview", "Properties", "Total number of physical locations (offices, warehouses, retail, manufacturing)", "number", { unit: "locations" }),
  q("facilities.overview.total_sqft", "facilities", "Overview", "Properties", "Total square footage across all locations", "number", { unit: "sq ft" }),
  q("facilities.overview.owned_vs_leased", "facilities", "Overview", "Properties", "Breakdown of owned vs. leased vs. month-to-month space", "longtext"),
  q("facilities.overview.hq_location", "facilities", "Overview", "Properties", "Headquarters location and importance to operations", "text"),
  q("facilities.overview.critical_locations", "facilities", "Overview", "Properties", "Mission-critical locations that cannot be disrupted post-close", "longtext"),

  /* --- Owned properties -------------------------------------------------- */
  q("facilities.owned.list", "facilities", "Owned properties", "Inventory", "List of owned real property — address, square footage, use, estimated value", "longtext"),
  q("facilities.owned.mortgages", "facilities", "Owned properties", "Encumbrances", "Mortgages, liens, or encumbrances on owned properties", "longtext"),
  q("facilities.owned.title_issues", "facilities", "Owned properties", "Encumbrances", "Any known title defects or easements affecting owned properties?", "longtext"),
  q("facilities.owned.appraisals", "facilities", "Owned properties", "Valuation", "Recent property appraisals — date, value, appraiser", "longtext"),

  /* --- Leases ------------------------------------------------------------ */
  q("facilities.leases.lease_count", "facilities", "Leases", "Inventory", "Total number of active leases", "number", { unit: "leases" }),
  q("facilities.leases.total_annual_rent", "facilities", "Leases", "Cost", "Total annual base rent commitment across all leases", "number", { unit: "$/yr" }),
  q("facilities.leases.expiring_24mo", "facilities", "Leases", "Expiry", "Leases expiring within 24 months of expected close", "longtext"),
  q("facilities.leases.renewal_options", "facilities", "Leases", "Expiry", "Key renewal options and notice periods", "longtext"),
  q("facilities.leases.coc_clauses", "facilities", "Leases", "Change of control", "Leases with change-of-control or assignment restriction clauses", "longtext"),
  q("facilities.leases.landlord_consents", "facilities", "Leases", "Change of control", "Plan for obtaining landlord consents pre-close", "longtext"),
  q("facilities.leases.subleases", "facilities", "Leases", "Subleases", "Any subleased space (as sublessor) — terms and counterparties", "longtext"),
  q("facilities.leases.personal_guarantees", "facilities", "Leases", "Obligations", "Leases personally guaranteed by owners/founders?", "longtext"),
  q("facilities.leases.deferred_rent", "facilities", "Leases", "Obligations", "Deferred rent arrangements from COVID or other accommodations", "longtext"),

  /* --- Building condition & CapEx ---------------------------------------- */
  q("facilities.condition.recent_improvements", "facilities", "Condition & CapEx", "Capital improvements", "Material capital improvements in last 3 years — cost and nature", "longtext"),
  q("facilities.condition.deferred_maintenance", "facilities", "Condition & CapEx", "Deferred maintenance", "Known deferred maintenance — roofs, HVAC, electrical, plumbing", "longtext"),
  q("facilities.condition.capex_planned", "facilities", "Condition & CapEx", "Planned CapEx", "CapEx projects planned or committed in next 2 years", "longtext"),
  q("facilities.condition.building_systems", "facilities", "Condition & CapEx", "Building systems", "Age and condition of major building systems (HVAC, elevator, electrical, sprinkler)", "longtext"),
  q("facilities.condition.security_systems", "facilities", "Condition & CapEx", "Security", "Physical security systems (access control, CCTV, alarms) — owned vs. monitored", "longtext"),
  q("facilities.condition.ada_compliance", "facilities", "Condition & CapEx", "Compliance", "ADA / accessibility compliance status of owned and leased locations", "text"),
  q("facilities.condition.zoning_compliance", "facilities", "Condition & CapEx", "Compliance", "Zoning compliance — uses are consistent with zoning for all locations?", "yes_no"),

  /* --- Environmental ----------------------------------------------------- */
  q("facilities.env.phase1_conducted", "facilities", "Environmental", "Assessments", "Phase I ESA conducted for owned properties? Date and outcome", "longtext"),
  q("facilities.env.phase2_conducted", "facilities", "Environmental", "Assessments", "Phase II ESA conducted? Findings and remediation status", "longtext"),
  q("facilities.env.known_contamination", "facilities", "Environmental", "Issues", "Any known soil or groundwater contamination?", "yes_no"),
  q("facilities.env.ust_ast", "facilities", "Environmental", "Issues", "Underground or aboveground storage tanks (UST/AST) — registered, inspected?", "longtext"),
  q("facilities.env.asbestos_lead", "facilities", "Environmental", "Issues", "Asbestos, lead paint, or other hazardous materials in buildings?", "longtext"),
  q("facilities.env.regulatory_orders", "facilities", "Environmental", "Regulatory", "Open environmental regulatory orders, consent decrees, or violations?", "longtext"),
  q("facilities.env.remediation_costs", "facilities", "Environmental", "Remediation", "Estimated remediation costs for any identified environmental issues", "number", { unit: "$" }),

  /* --- Facilities management --------------------------------------------- */
  q("facilities.mgmt.internal_vs_outsourced", "facilities", "Management", "Operations", "Facilities management structure — in-house vs. outsourced, key vendors", "longtext"),
  q("facilities.mgmt.maintenance_platform", "facilities", "Management", "Operations", "CMMS / maintenance management platform in use", "text"),
  q("facilities.mgmt.utilities_costs", "facilities", "Management", "Costs", "Annual utilities cost (electricity, gas, water) across all locations", "number", { unit: "$/yr" }),
  q("facilities.mgmt.insurance", "facilities", "Management", "Insurance", "Property and casualty insurance — carrier, limits, recent claims", "longtext"),
  q("facilities.mgmt.disaster_recovery", "facilities", "Management", "Resilience", "Business continuity / disaster recovery plan for facilities", "longtext"),
];

/* ============================================================================
 * HR TRACK
 * ========================================================================== */
const HR: MaQuestion[] = [
  /* --- Headcount & organization ------------------------------------------ */
  q("hr.headcount.total_employees", "hr", "Headcount", "Overview", "Total employees (FTE) as of today", "number", { unit: "FTEs" }),
  q("hr.headcount.contractors", "hr", "Headcount", "Overview", "Total contractors / 1099s engaged regularly", "number", { unit: "people" }),
  q("hr.headcount.org_chart", "hr", "Headcount", "Structure", "Organizational chart — functions, layers, spans of control", "longtext"),
  q("hr.headcount.by_department", "hr", "Headcount", "Structure", "Headcount by department / function", "longtext"),
  q("hr.headcount.by_location", "hr", "Headcount", "Structure", "Headcount by location / geography", "longtext"),
  q("hr.headcount.remote_pct", "hr", "Headcount", "Structure", "% of workforce remote / hybrid / in-office", "longtext"),
  q("hr.headcount.turnover_rate", "hr", "Headcount", "Attrition", "Annual voluntary turnover rate (last 12 months)", "number", { unit: "%" }),
  q("hr.headcount.involuntary_turnover", "hr", "Headcount", "Attrition", "Involuntary separations in last 12 months — performance, layoffs", "longtext"),
  q("hr.headcount.open_reqs", "hr", "Headcount", "Hiring", "Open job requisitions — count and critical roles", "longtext"),
  q("hr.headcount.hiring_plan", "hr", "Headcount", "Hiring", "Hiring plan for next 12 months", "longtext"),
  q("hr.headcount.recent_rif", "hr", "Headcount", "History", "Any reductions-in-force in last 3 years — size, reason, WARN Act compliance", "longtext"),

  /* --- Compensation ------------------------------------------------------- */
  q("hr.comp.total_payroll", "hr", "Compensation", "Run rate", "Total annualized payroll run rate (base salaries only)", "number", { unit: "$/yr" }),
  q("hr.comp.total_comp_package", "hr", "Compensation", "Run rate", "Total compensation run rate including bonuses, commissions, benefits employer cost", "number", { unit: "$/yr" }),
  q("hr.comp.pay_bands", "hr", "Compensation", "Structure", "Compensation banding / grade structure in place?", "yes_no"),
  q("hr.comp.merit_process", "hr", "Compensation", "Structure", "Merit review process — cycle, typical increase %", "longtext"),
  q("hr.comp.bonus_structure", "hr", "Compensation", "Variable pay", "Bonus plan structure — target %, metrics, payout history", "longtext"),
  q("hr.comp.commission_plan", "hr", "Compensation", "Variable pay", "Sales commission plan — structure, quota attainment, payout mechanics", "longtext"),
  q("hr.comp.equity_program", "hr", "Compensation", "Equity", "Equity program details — options, RSUs, phantom equity, cap table impact", "longtext"),
  q("hr.comp.equity_vesting", "hr", "Compensation", "Equity", "Vesting schedules and acceleration provisions on close", "longtext"),
  q("hr.comp.executive_agreements", "hr", "Compensation", "Executive", "Executive employment agreements — change-of-control payouts, golden parachutes", "longtext"),
  q("hr.comp.retention_program", "hr", "Compensation", "Retention", "Retention bonus or stay bonus program planned for close / integration?", "longtext"),
  q("hr.comp.benchmarking", "hr", "Compensation", "Benchmarking", "Is compensation benchmarked to market? Last benchmarking study date", "longtext"),

  /* --- Benefits ---------------------------------------------------------- */
  q("hr.benefits.health_plan", "hr", "Benefits", "Health", "Medical plan(s) — carrier, type (PPO/HDHP/HMO), employee vs. employer premium split", "longtext"),
  q("hr.benefits.dental_vision", "hr", "Benefits", "Health", "Dental and vision plans — carrier, coverage levels, cost split", "longtext"),
  q("hr.benefits.total_benefits_cost", "hr", "Benefits", "Cost", "Total employer benefits cost (annualized)", "number", { unit: "$/yr" }),
  q("hr.benefits.benefits_per_ee", "hr", "Benefits", "Cost", "Average employer benefits cost per employee per year", "number", { unit: "$/emp/yr" }),
  q("hr.benefits.401k_plan", "hr", "Benefits", "Retirement", "401(k) or retirement plan — plan type, employer match, vesting", "longtext"),
  q("hr.benefits.pension_obligations", "hr", "Benefits", "Retirement", "Any defined benefit pension or SERP obligations?", "longtext"),
  q("hr.benefits.pto_policy", "hr", "Benefits", "Time off", "PTO / vacation policy — accrual vs. unlimited, carryover, payout on separation", "longtext"),
  q("hr.benefits.pto_liability", "hr", "Benefits", "Time off", "Accrued PTO balance (total hours × average rate) — balance sheet liability", "number", { unit: "$" }),
  q("hr.benefits.life_disability", "hr", "Benefits", "Insurance", "Life, STD, LTD coverage — employer paid vs. voluntary", "longtext"),
  q("hr.benefits.other_perks", "hr", "Benefits", "Other", "Other notable benefits or perks (tuition reimbursement, wellness stipend, remote stipend, etc.)", "longtext"),
  q("hr.benefits.open_enrollment_upcoming", "hr", "Benefits", "Renewals", "Upcoming benefits renewals within 6 months of close", "longtext"),

  /* --- Key people & retention risk --------------------------------------- */
  q("hr.retention.key_people_list", "hr", "Key people", "Identification", "Employees critical to the business (top performers, unique knowledge, client relationships)", "longtext"),
  q("hr.retention.owner_dependency", "hr", "Key people", "Identification", "Owner / founder day-to-day operational dependency — what would break without them?", "longtext"),
  q("hr.retention.single_points", "hr", "Key people", "Identification", "Single points of failure — roles with no backup", "longtext"),
  q("hr.retention.flight_risk", "hr", "Key people", "Risk", "Employees known or suspected to be flight risks post-announcement", "longtext"),
  q("hr.retention.customer_relationships", "hr", "Key people", "Risk", "Employees who own key customer relationships that could walk with them", "longtext"),
  q("hr.retention.noncompetes_enforced", "hr", "Key people", "Risk", "States / jurisdictions where non-competes are enforceable for key people", "longtext"),
  q("hr.retention.succession_planning", "hr", "Key people", "Succession", "Succession planning in place for key roles?", "longtext"),

  /* --- Labor relations --------------------------------------------------- */
  q("hr.labor.unionized", "hr", "Labor relations", "Union status", "Any unionized workforce?", "yes_no"),
  q("hr.labor.cba_details", "hr", "Labor relations", "Union status", "CBA details — bargaining unit, expiry, upcoming negotiations", "longtext"),
  q("hr.labor.organizing_activity", "hr", "Labor relations", "Union status", "Any union organizing activity or campaigns?", "yes_no"),
  q("hr.labor.labor_disputes", "hr", "Labor relations", "Disputes", "Active labor grievances, arbitrations, or NLRB charges", "longtext"),
  q("hr.labor.worker_classification", "hr", "Labor relations", "Classification", "Contractor / gig worker classification review — misclassification exposure?", "longtext"),
  q("hr.labor.joint_employer", "hr", "Labor relations", "Classification", "Any joint-employer exposure (franchisees, staffing agencies, contractors)?", "longtext"),

  /* --- HR compliance ----------------------------------------------------- */
  q("hr.compliance.i9_current", "hr", "HR compliance", "Documentation", "I-9 records current and audit-ready?", "yes_no"),
  q("hr.compliance.e_verify", "hr", "HR compliance", "Documentation", "E-Verify enrollment — required or voluntary?", "text"),
  q("hr.compliance.osha_compliance", "hr", "HR compliance", "Safety", "OSHA recordable incident rate (last 3 years) and any open citations", "longtext"),
  q("hr.compliance.workers_comp_history", "hr", "HR compliance", "Safety", "Workers' compensation claims history — frequency, severity, EMR modifier", "longtext"),
  q("hr.compliance.eeoc_history", "hr", "HR compliance", "EEO", "EEOC charges or complaints in last 5 years", "longtext"),
  q("hr.compliance.pay_equity", "hr", "HR compliance", "EEO", "Pay equity analysis conducted? Any disparities identified or remediated?", "longtext"),
  q("hr.compliance.affirmative_action", "hr", "HR compliance", "EEO", "Federal contractor affirmative action plan obligations?", "yes_no"),
  q("hr.compliance.leave_compliance", "hr", "HR compliance", "Leave", "FMLA, state leave, and military leave compliance", "longtext"),

  /* --- Culture & integration readiness ---------------------------------- */
  q("hr.culture.engagement_scores", "hr", "Culture", "Engagement", "Employee engagement / eNPS scores — last measurement and trend", "longtext"),
  q("hr.culture.glassdoor_presence", "hr", "Culture", "Engagement", "Glassdoor / Indeed ratings — overall score and notable themes in reviews", "longtext"),
  q("hr.culture.core_values", "hr", "Culture", "Culture", "Stated core values and cultural norms that define the business", "longtext"),
  q("hr.culture.leadership_style", "hr", "Culture", "Culture", "Leadership / management style — top-down vs. collaborative, data-driven vs. gut?", "longtext"),
  q("hr.culture.integration_sensitivity", "hr", "Culture", "Integration", "Likely employee reaction to acquisition announcement", "select", { options: ["Very positive", "Mixed / uncertain", "Likely concerned", "Likely negative", "Unknown"] }),
  q("hr.culture.communication_plan_needed", "hr", "Culture", "Integration", "Day-1 employee communication plan — who, what, when", "longtext"),
  q("hr.culture.hris_platform", "hr", "Culture", "Systems", "HRIS platform in use (ADP, Rippling, BambooHR, Workday, Paylocity, etc.)", "text"),
  q("hr.culture.payroll_platform", "hr", "Culture", "Systems", "Payroll processing platform and cadence", "text"),
  q("hr.culture.ats_platform", "hr", "Culture", "Systems", "Applicant tracking system (ATS)", "text"),
  q("hr.culture.performance_mgmt", "hr", "Culture", "Systems", "Performance management platform and review cadence", "text"),
];

/* ============================================================================
 * Public API
 * ========================================================================== */
export const MA_LEGAL_QUESTIONS: MaQuestion[] = LEGAL;
export const MA_FINANCE_QUESTIONS: MaQuestion[] = FINANCE;
export const MA_FACILITIES_QUESTIONS: MaQuestion[] = FACILITIES;
export const MA_HR_QUESTIONS: MaQuestion[] = HR;

export const ALL_MA_QUESTIONS: MaQuestion[] = [
  ...LEGAL,
  ...FINANCE,
  ...FACILITIES,
  ...HR,
];

export function getMaQuestionsForTrack(track: MaTrack): MaQuestion[] {
  return ALL_MA_QUESTIONS.filter((q) => q.track === track);
}

/* ============================================================================
 * Helper (compact constructor)
 * ========================================================================== */
function q(
  key: string,
  track: MaTrack,
  category: string,
  subcategory: string,
  text: string,
  kind: MaQuestionKind,
  extra: Partial<Omit<MaQuestion, "key" | "track" | "category" | "subcategory" | "text" | "kind">> = {},
): MaQuestion {
  return { key, track, category, subcategory, text, kind, ...extra };
}
