/**
 * Risk-rating derivation per Change Management Policy §1.5.
 *
 * Pure helpers — kept out of the "use server" actions file because
 * Next.js requires server-action modules to export only async functions.
 */
export type Impact = "low" | "medium" | "high" | "critical";
export type Likelihood = "low" | "medium" | "high";
export type Rating = "low" | "medium" | "high" | "critical";

/**
 * Conservative impact × likelihood matrix:
 *   any "critical" impact → critical
 *   high impact: low likelihood → high; otherwise critical
 *   medium impact: high likelihood → high; medium → medium; low → low
 *   low impact: high likelihood → medium; otherwise low
 */
export function deriveRiskRating(
  impact: Impact,
  likelihood: Likelihood,
): Rating {
  if (impact === "critical") return "critical";
  if (impact === "high") return likelihood === "low" ? "high" : "critical";
  if (impact === "medium") {
    if (likelihood === "high") return "high";
    if (likelihood === "medium") return "medium";
    return "low";
  }
  if (likelihood === "high") return "medium";
  return "low";
}

/** High & Critical require CAB review per policy §1.5. */
export function requiresCab(rating: Rating): boolean {
  return rating === "high" || rating === "critical";
}
