/**
 * Compute the standards that apply to a given client.
 *
 * Applicable = union of:
 *   - Explicit rows in client_applicable_standards
 *   - Any standard whose ownership_group_id matches the client's
 *     ownership_group_id (auto-applied via portfolio membership)
 *
 * Each applicable entry carries a "source" tag so the UI can label it
 * as either "explicit" (added per-client) or "inherited" (from the
 * ownership group).
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  clientApplicableStandards,
  clients,
  standards,
  type Standard,
} from "@/db/schema";

export type ApplicableSource = "explicit" | "inherited";

export type ApplicableStandard = {
  standard: Standard;
  source: ApplicableSource;
  isRequired: boolean;
  rationale: string | null;
};

export async function loadApplicableStandards(
  clientId: string,
  organizationId: string,
): Promise<ApplicableStandard[]> {
  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, clientId),
      eq(clients.organizationId, organizationId),
    ),
  });
  if (!client) return [];

  // Explicit rows
  const explicitRows = await db
    .select({
      standard: standards,
      isRequired: clientApplicableStandards.isRequired,
      rationale: clientApplicableStandards.rationale,
    })
    .from(clientApplicableStandards)
    .innerJoin(standards, eq(clientApplicableStandards.standardId, standards.id))
    .where(
      and(
        eq(clientApplicableStandards.clientId, clientId),
        eq(clientApplicableStandards.organizationId, organizationId),
      ),
    );

  // Inherited rows — standards owned by the client's ownership group
  let inheritedRows: Array<{
    standard: Standard;
    isRequired: number;
    rationale: string | null;
  }> = [];
  if (client.ownershipGroupId) {
    inheritedRows = (
      await db
        .select()
        .from(standards)
        .where(
          and(
            eq(standards.organizationId, organizationId),
            eq(standards.ownershipGroupId, client.ownershipGroupId),
          ),
        )
    ).map((s) => ({ standard: s, isRequired: 1, rationale: null }));
  }

  // Merge: explicit beats inherited if both reference the same standard
  // (the explicit row carries the rationale + isRequired choice).
  const byId = new Map<string, ApplicableStandard>();
  for (const r of inheritedRows) {
    byId.set(r.standard.id, {
      standard: r.standard,
      source: "inherited",
      isRequired: true,
      rationale: null,
    });
  }
  for (const r of explicitRows) {
    byId.set(r.standard.id, {
      standard: r.standard,
      source: "explicit",
      isRequired: !!r.isRequired,
      rationale: r.rationale,
    });
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.standard.name.localeCompare(b.standard.name),
  );
}

/**
 * Convenience: per-applicable-standard rollup of how the client is
 * tracking. Returns a flat list with overall counts. Used by the AI
 * briefing context and a future "compliance posture" summary card.
 */
export async function loadApplicableStandardsWithRollup(
  clientId: string,
  organizationId: string,
): Promise<
  Array<{
    standard: Standard;
    source: ApplicableSource;
    isRequired: boolean;
    rationale: string | null;
    rollup: {
      total: number;
      compliant: number;
      partial: number;
      nonCompliant: number;
      notApplicable: number;
      unknown: number;
    };
  }>
> {
  const applicable = await loadApplicableStandards(clientId, organizationId);
  if (applicable.length === 0) return [];

  // Bulk-load controls + assessments for all applicable standards.
  const { standardControls, clientControlAssessments } = await import(
    "@/db/schema"
  );

  const standardIds = applicable.map((a) => a.standard.id);

  const allControls = await db
    .select()
    .from(standardControls)
    .where(inArray(standardControls.standardId, standardIds));

  const allAssessments = await db
    .select()
    .from(clientControlAssessments)
    .where(
      and(
        eq(clientControlAssessments.clientId, clientId),
        eq(clientControlAssessments.organizationId, organizationId),
      ),
    );
  const assessByControl = new Map(
    allAssessments.map((a) => [a.controlId, a]),
  );

  return applicable.map((a) => {
    const leaves = allControls.filter(
      (c) => c.standardId === a.standard.id && c.parentId !== null,
    );
    let compliant = 0,
      partial = 0,
      nonCompliant = 0,
      notApplicable = 0,
      unknown = 0;
    for (const l of leaves) {
      const s = assessByControl.get(l.id)?.status ?? "unknown";
      if (s === "compliant") compliant++;
      else if (s === "partial") partial++;
      else if (s === "non_compliant") nonCompliant++;
      else if (s === "not_applicable") notApplicable++;
      else unknown++;
    }
    return {
      ...a,
      rollup: {
        total: leaves.length,
        compliant,
        partial,
        nonCompliant,
        notApplicable,
        unknown,
      },
    };
  });
}
