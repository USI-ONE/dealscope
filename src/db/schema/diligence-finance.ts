import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { organizations } from "./organizations";
import { diligenceEngagements } from "./diligence";

/* ============================================================================
 * ENUMS
 * ========================================================================== */

export const maStatementTypeEnum = pgEnum("ma_statement_type", [
  "income_statement",
  "balance_sheet",
  "cash_flow",
  "trial_balance",
  "tax_return",
  "audit_report",
  "management_accounts",
]);

export const maDebtInstrumentTypeEnum = pgEnum("ma_debt_instrument_type", [
  "term_loan",
  "revolver",
  "line_of_credit",
  "equipment_financing",
  "mortgage",
  "convertible_note",
  "sba_loan",
  "seller_note",
  "bonds",
  "other",
]);

export const maContractStatusEnum = pgEnum("ma_contract_status", [
  "under_contract",
  "month_to_month",
  "no_contract",
  "expired",
  "unknown",
]);

export const maChurnRiskEnum = pgEnum("ma_churn_risk", [
  "low",
  "medium",
  "high",
  "unknown",
]);

export const maWorkingCapitalItemTypeEnum = pgEnum("ma_working_capital_item_type", [
  "accounts_receivable",
  "inventory",
  "prepaid",
  "accounts_payable",
  "accrued_liabilities",
  "deferred_revenue",
  "other_current_asset",
  "other_current_liability",
]);

/* ============================================================================
 * TABLES
 * ========================================================================== */

/**
 * Financial statement references for the target company.
 * Tracks key summary metrics by period to identify trends and quality-of-earnings
 * issues without storing full statement detail in the DB.
 */
export const maFinancialStatements = pgTable(
  "ma_financial_statements",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    statementType: maStatementTypeEnum("statement_type").notNull(),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    audited: boolean("audited").notNull().default(false),
    /** Name of the auditing firm, if audited. */
    auditorName: text("auditor_name"),
    /** ISO 4217 currency code for all monetary fields. */
    currency: text("currency").notNull().default("USD"),
    /** Total revenue/net sales for the period, in cents. */
    revenueCents: integer("revenue_cents"),
    /** Gross profit (revenue minus COGS) in cents. */
    grossProfitCents: integer("gross_profit_cents"),
    /** Earnings before interest, taxes, depreciation, and amortization, in cents. */
    ebitdaCents: integer("ebitda_cents"),
    /** Net income (bottom line) in cents. */
    netIncomeCents: integer("net_income_cents"),
    /** Total assets as of period end, in cents. */
    totalAssetsCents: integer("total_assets_cents"),
    /** Total liabilities as of period end, in cents. */
    totalLiabilitiesCents: integer("total_liabilities_cents"),
    /** Total equity as of period end, in cents. */
    totalEquityCents: integer("total_equity_cents"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_financial_statements_org_idx").on(t.organizationId),
    engagementIdx: index("ma_financial_statements_engagement_idx").on(t.engagementId),
    typeIdx: index("ma_financial_statements_type_idx").on(
      t.engagementId,
      t.statementType,
    ),
  }),
);

/**
 * Debt and financing instrument schedule for the target company.
 * Surfaces personal guarantees, change-of-control provisions, and covenant
 * packages that could require lender consent at close.
 */
export const maDebtInstruments = pgTable(
  "ma_debt_instruments",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    instrumentType: maDebtInstrumentTypeEnum("instrument_type").notNull(),
    lenderName: text("lender_name").notNull(),
    /** Original principal amount in cents. */
    principalCents: integer("principal_cents"),
    /** Current outstanding balance in cents. */
    outstandingCents: integer("outstanding_cents"),
    /** Interest rate description (e.g. "Prime + 2%" or "8.5% fixed"). */
    interestRate: text("interest_rate"),
    maturityDate: date("maturity_date"),
    /** True if personally guaranteed by a founder or owner. */
    personalGuarantee: boolean("personal_guarantee").notNull().default(false),
    /** True if secured by company assets. */
    secured: boolean("secured").notNull().default(false),
    /** Description of collateral securing the instrument, if any. */
    collateral: text("collateral"),
    /** True if the instrument contains a change-of-control clause. */
    changeOfControlClause: boolean("change_of_control_clause").notNull().default(false),
    /** Material financial covenants (e.g. minimum DSCR, leverage ratio). */
    covenants: text("covenants"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_debt_instruments_org_idx").on(t.organizationId),
    engagementIdx: index("ma_debt_instruments_engagement_idx").on(t.engagementId),
  }),
);

/**
 * Top customer revenue concentration analysis.
 * Customer names may be anonymized (e.g. "Customer A") to facilitate
 * pre-NDA sharing of concentration data.
 */
export const maCustomerRevenues = pgTable(
  "ma_customer_revenues",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    /** Customer name or anonymized label (e.g. "Customer A"). */
    customerName: text("customer_name").notNull(),
    /** Annual revenue attributable to this customer in cents. */
    annualRevenueCents: integer("annual_revenue_cents"),
    /**
     * Percentage of total company revenue. Stored as text (e.g. "23.4%")
     * to avoid floating-point precision issues and rounding debates.
     */
    revenuePercent: text("revenue_percent"),
    contractStatus: maContractStatusEnum("contract_status").notNull().default("unknown"),
    contractExpiryDate: date("contract_expiry_date"),
    churnRisk: maChurnRiskEnum("churn_risk").notNull().default("unknown"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_customer_revenues_org_idx").on(t.organizationId),
    engagementIdx: index("ma_customer_revenues_engagement_idx").on(t.engagementId),
  }),
);

/**
 * Notable working capital and balance sheet items.
 * Used to document normalization adjustments and aging issues that affect
 * the quality-of-earnings or working capital peg negotiation.
 */
export const maWorkingCapitalItems = pgTable(
  "ma_working_capital_items",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    itemType: maWorkingCapitalItemTypeEnum("item_type").notNull(),
    description: text("description"),
    /** As-reported amount in cents. */
    amountCents: integer("amount_cents"),
    /** Average aging in days (most relevant for AR and AP). */
    agingDays: integer("aging_days"),
    /** Normalized/adjusted amount in cents after diligence adjustments. */
    normalizedAmountCents: integer("normalized_amount_cents"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_working_capital_items_org_idx").on(t.organizationId),
    engagementIdx: index("ma_working_capital_items_engagement_idx").on(t.engagementId),
    typeIdx: index("ma_working_capital_items_type_idx").on(
      t.engagementId,
      t.itemType,
    ),
  }),
);

/* ============================================================================
 * RELATIONS
 * ========================================================================== */

export const maFinancialStatementsRelations = relations(
  maFinancialStatements,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [maFinancialStatements.organizationId],
      references: [organizations.id],
    }),
    engagement: one(diligenceEngagements, {
      fields: [maFinancialStatements.engagementId],
      references: [diligenceEngagements.id],
    }),
  }),
);

export const maDebtInstrumentsRelations = relations(maDebtInstruments, ({ one }) => ({
  organization: one(organizations, {
    fields: [maDebtInstruments.organizationId],
    references: [organizations.id],
  }),
  engagement: one(diligenceEngagements, {
    fields: [maDebtInstruments.engagementId],
    references: [diligenceEngagements.id],
  }),
}));

export const maCustomerRevenuesRelations = relations(maCustomerRevenues, ({ one }) => ({
  organization: one(organizations, {
    fields: [maCustomerRevenues.organizationId],
    references: [organizations.id],
  }),
  engagement: one(diligenceEngagements, {
    fields: [maCustomerRevenues.engagementId],
    references: [diligenceEngagements.id],
  }),
}));

export const maWorkingCapitalItemsRelations = relations(
  maWorkingCapitalItems,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [maWorkingCapitalItems.organizationId],
      references: [organizations.id],
    }),
    engagement: one(diligenceEngagements, {
      fields: [maWorkingCapitalItems.engagementId],
      references: [diligenceEngagements.id],
    }),
  }),
);

/* ============================================================================
 * TYPES
 * ========================================================================== */

export type MaFinancialStatement = typeof maFinancialStatements.$inferSelect;
export type NewMaFinancialStatement = typeof maFinancialStatements.$inferInsert;
export type MaDebtInstrument = typeof maDebtInstruments.$inferSelect;
export type NewMaDebtInstrument = typeof maDebtInstruments.$inferInsert;
export type MaCustomerRevenue = typeof maCustomerRevenues.$inferSelect;
export type NewMaCustomerRevenue = typeof maCustomerRevenues.$inferInsert;
export type MaWorkingCapitalItem = typeof maWorkingCapitalItems.$inferSelect;
export type NewMaWorkingCapitalItem = typeof maWorkingCapitalItems.$inferInsert;
