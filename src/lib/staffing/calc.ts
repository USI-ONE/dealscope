/**
 * Pure FTE-demand calculator.
 *
 * The same functions run in three places:
 *   1. Server actions, when a staffing profile is saved
 *   2. The intake-form React component, for real-time recalc as a user types
 *   3. The forecast scenario builder, for "what if we add this client"
 *
 * No DB, no I/O, no React — just math. Algorithm comes directly from
 * the staffing-model spec so changes here are auditable.
 */

export type AutomationMaturity = "manual" | "partial" | "high";
export type StrategicIntensity = "none" | "low" | "medium" | "high";
export type SupportIntensity = "low" | "standard" | "high";

export type ComplexityInputs = {
  userCount: number;
  sites: number;
  servers: number;
  apps: number;
  automationMaturity: AutomationMaturity;
  strategicIntensity: StrategicIntensity;
  supportIntensity: SupportIntensity;
};

export type FteOutputs = {
  tier1Fte: number;
  tier2Fte: number;
  /** Strategic-intensity weight only — a CIO-review hint, NOT the
   *  authoritative Tier 3 number. The authoritative number per client is
   *  the sum of strategic_initiatives.tier3_fte_required for that client. */
  tier3StrategicWeight: number;
  /** Breakdown components so the UI can explain how a value was reached. */
  breakdown: {
    tier1: {
      base: number;
      supportMultiplier: number;
    };
    tier2: {
      envScore: number;
      automationOverhead: number;
      base: number;
      reactiveBuffer: number;
    };
  };
};

const SUPPORT_INTENSITY_MULT: Record<SupportIntensity, number> = {
  low: 0.7,
  standard: 1.0,
  high: 1.3,
};
const AUTOMATION_OVERHEAD: Record<AutomationMaturity, number> = {
  high: 0,
  partial: 0.5,
  manual: 1.0,
};
const STRATEGIC_WEIGHT: Record<StrategicIntensity, number> = {
  none: 0,
  low: 0.5,
  medium: 1.0,
  high: 1.5,
};

/** Tier 2 capacity baseline — environment-complexity score that one
 *  systems-admin FTE is assumed to cover. */
const TIER2_CAPACITY_PER_ADMIN = 8;

/** Reactive-work buffer applied on top of the baseline Tier 2 demand. */
const TIER2_REACTIVE_BUFFER_PCT = 0.35;

/** Tier 1 user-count baseline — one Tier 1 FTE per N standard users. */
const TIER1_USERS_PER_FTE = 150;

/** Round to nearest 0.25 — staffing is always rounded to quarter FTE
 *  for hiring conversations. */
function roundQuarter(n: number): number {
  return Math.round(n * 4) / 4;
}

export function calcFte(input: ComplexityInputs): FteOutputs {
  const supportMult = SUPPORT_INTENSITY_MULT[input.supportIntensity];
  const tier1Base = (input.userCount / TIER1_USERS_PER_FTE) * supportMult;
  const tier1Fte = roundQuarter(tier1Base);

  const automationOverhead = AUTOMATION_OVERHEAD[input.automationMaturity];
  const envScore =
    Math.max(1, input.sites) * 0.2 +
    Math.max(0, input.servers) * 0.3 +
    Math.max(0, input.apps) * 0.25 +
    automationOverhead;
  const tier2Base = envScore / TIER2_CAPACITY_PER_ADMIN;
  const tier2Reactive = tier2Base * TIER2_REACTIVE_BUFFER_PCT;
  const tier2Fte = roundQuarter(tier2Base + tier2Reactive);

  return {
    tier1Fte,
    tier2Fte,
    tier3StrategicWeight: STRATEGIC_WEIGHT[input.strategicIntensity],
    breakdown: {
      tier1: { base: tier1Base, supportMultiplier: supportMult },
      tier2: {
        envScore,
        automationOverhead,
        base: tier2Base,
        reactiveBuffer: tier2Reactive,
      },
    },
  };
}

/**
 * Sum tier totals across many profiles. Used by the dashboard + forecast.
 * Tier 3 is the authoritative number from initiative allocations rather
 * than from strategic-intensity weighting; pass it through `tier3Per`
 * if the caller already has it.
 */
export function sumDemand(
  profiles: Array<{ tier1Fte: number; tier2Fte: number; tier3Fte: number }>,
): { tier1: number; tier2: number; tier3: number; total: number } {
  const totals = profiles.reduce(
    (acc, p) => ({
      tier1: acc.tier1 + p.tier1Fte,
      tier2: acc.tier2 + p.tier2Fte,
      tier3: acc.tier3 + p.tier3Fte,
    }),
    { tier1: 0, tier2: 0, tier3: 0 },
  );
  return {
    ...totals,
    total: totals.tier1 + totals.tier2 + totals.tier3,
  };
}

/** Pretty 0.25-step formatter for FTE numbers. */
export function fmtFte(n: number): string {
  return (Math.round(n * 4) / 4).toFixed(2);
}

/**
 * Translate a numeric FTE shortfall into a hiring recommendation
 * statement. Rounds shortfalls under 0.25 FTE down to "no hire needed."
 */
export function hiringRecommendation(
  tier: 1 | 2 | 3,
  demand: number,
  capacity: number,
): {
  shortfall: number;
  text: string;
  status: "shortfall" | "surplus" | "ok";
} {
  const shortfall = roundQuarter(demand - capacity);
  if (shortfall >= 0.25) {
    return {
      shortfall,
      text: `Hire ${shortfall.toFixed(2)} FTE in Tier ${tier} to close the gap.`,
      status: "shortfall",
    };
  }
  if (shortfall <= -0.5) {
    return {
      shortfall,
      text: `Tier ${tier} has ${Math.abs(shortfall).toFixed(2)} FTE of surplus capacity.`,
      status: "surplus",
    };
  }
  return {
    shortfall,
    text: `Tier ${tier} is in balance.`,
    status: "ok",
  };
}
