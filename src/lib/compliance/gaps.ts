/**
 * Consolidated gap analysis across every standard applicable to a client.
 *
 * For each control whose assessment is `non_compliant`, `partial`, or
 * `unknown` (or has no assessment row at all), produce a GapItem with
 * the standard + domain + control metadata plus the current evidence.
 *
 * Output is grouped first by standard, then by domain inside each
 * standard, so the consolidated page + DOCX both can iterate cleanly.
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  clientControlAssessments,
  standardControls,
  type Standard,
  type StandardControl,
} from "@/db/schema";
import { loadApplicableStandards } from "./applicable-standards";

export type GapStatus =
  | "non_compliant"
  | "partial"
  | "unknown"
  | "not_assessed";

export type GapItem = {
  standardId: string;
  standardName: string;
  standardVersion: string | null;
  standardSource: string;
  isRequired: boolean;
  source: "explicit" | "inherited";
  rationale: string | null;

  domainId: string | null;
  domainCode: string | null;
  domainTitle: string;

  controlId: string;
  controlCode: string | null;
  controlTitle: string;
  controlDescription: string | null;
  controlGuidance: string | null;

  status: GapStatus;
  score: number | null;
  evidence: string | null;
  assessedAt: Date | null;
};

export type GapStandardGroup = {
  standard: Standard;
  isRequired: boolean;
  source: "explicit" | "inherited";
  rationale: string | null;
  rollup: {
    total: number;
    compliant: number;
    partial: number;
    nonCompliant: number;
    notApplicable: number;
    unknown: number;
    notAssessed: number;
  };
  domains: Array<{
    domain: StandardControl | null;
    gaps: GapItem[];
  }>;
};

export async function loadConsolidatedGaps(
  clientId: string,
  organizationId: string,
): Promise<GapStandardGroup[]> {
  const applicable = await loadApplicableStandards(clientId, organizationId);
  if (applicable.length === 0) return [];

  const standardIds = applicable.map((a) => a.standard.id);

  const [allControls, assessments] = await Promise.all([
    db
      .select()
      .from(standardControls)
      .where(inArray(standardControls.standardId, standardIds)),
    db
      .select()
      .from(clientControlAssessments)
      .where(
        and(
          eq(clientControlAssessments.clientId, clientId),
          eq(clientControlAssessments.organizationId, organizationId),
        ),
      ),
  ]);

  const assessByControl = new Map(
    assessments.map((a) => [a.controlId, a]),
  );

  const groups: GapStandardGroup[] = [];

  for (const a of applicable) {
    const controlsForStd = allControls.filter(
      (c) => c.standardId === a.standard.id,
    );
    const domains = controlsForStd.filter((c) => c.parentId === null);
    const leavesByParent = new Map<string, StandardControl[]>();
    for (const c of controlsForStd) {
      if (c.parentId) {
        const arr = leavesByParent.get(c.parentId) ?? [];
        arr.push(c);
        leavesByParent.set(c.parentId, arr);
      }
    }

    let compliant = 0;
    let partial = 0;
    let nonCompliant = 0;
    let notApplicable = 0;
    let unknown = 0;
    let notAssessed = 0;

    const domainGroups: GapStandardGroup["domains"] = [];

    // Sort domains by position for deterministic output
    const sortedDomains = [...domains].sort((x, y) => x.position - y.position);

    for (const d of sortedDomains) {
      const leaves = (leavesByParent.get(d.id) ?? []).sort(
        (x, y) => x.position - y.position,
      );
      const domainGaps: GapItem[] = [];
      for (const leaf of leaves) {
        const ass = assessByControl.get(leaf.id);
        const status: GapStatus = !ass
          ? "not_assessed"
          : ass.status === "non_compliant"
            ? "non_compliant"
            : ass.status === "partial"
              ? "partial"
              : ass.status === "unknown"
                ? "unknown"
                : ass.status === "compliant"
                  ? "compliant" as never // bucketed below, never as a gap
                  : "not_applicable" as never;

        // Aggregate stats
        const realStatus = ass?.status ?? "not_assessed";
        if (realStatus === "compliant") compliant++;
        else if (realStatus === "partial") partial++;
        else if (realStatus === "non_compliant") nonCompliant++;
        else if (realStatus === "not_applicable") notApplicable++;
        else if (realStatus === "unknown") unknown++;
        else notAssessed++;

        // Only items NOT compliant + NOT not_applicable are gaps
        if (
          realStatus === "non_compliant" ||
          realStatus === "partial" ||
          realStatus === "unknown" ||
          realStatus === "not_assessed" ||
          !ass
        ) {
          domainGaps.push({
            standardId: a.standard.id,
            standardName: a.standard.name,
            standardVersion: a.standard.version,
            standardSource: a.standard.source,
            isRequired: a.isRequired,
            source: a.source,
            rationale: a.rationale,
            domainId: d.id,
            domainCode: d.code,
            domainTitle: d.title,
            controlId: leaf.id,
            controlCode: leaf.code,
            controlTitle: leaf.title,
            controlDescription: leaf.description,
            controlGuidance: leaf.guidance,
            status: status === ("compliant" as never) || status === ("not_applicable" as never)
              ? "not_assessed"
              : (status as GapStatus),
            score: ass?.score ?? null,
            evidence: ass?.evidence ?? null,
            assessedAt: ass?.assessedAt ?? null,
          });
        }
      }
      if (domainGaps.length > 0) {
        domainGroups.push({ domain: d, gaps: domainGaps });
      }
    }

    // Also include leaf controls with no parent (rare — flat standards)
    const orphanLeaves = controlsForStd
      .filter((c) => c.parentId !== null)
      .filter((c) => !sortedDomains.some((d) => d.id === c.parentId));
    if (orphanLeaves.length > 0) {
      const gaps: GapItem[] = [];
      for (const leaf of orphanLeaves) {
        const ass = assessByControl.get(leaf.id);
        const realStatus = ass?.status ?? "not_assessed";
        if (realStatus === "compliant") compliant++;
        else if (realStatus === "partial") partial++;
        else if (realStatus === "non_compliant") nonCompliant++;
        else if (realStatus === "not_applicable") notApplicable++;
        else if (realStatus === "unknown") unknown++;
        else notAssessed++;
        if (
          realStatus !== "compliant" &&
          realStatus !== "not_applicable"
        ) {
          gaps.push({
            standardId: a.standard.id,
            standardName: a.standard.name,
            standardVersion: a.standard.version,
            standardSource: a.standard.source,
            isRequired: a.isRequired,
            source: a.source,
            rationale: a.rationale,
            domainId: null,
            domainCode: null,
            domainTitle: "Ungrouped",
            controlId: leaf.id,
            controlCode: leaf.code,
            controlTitle: leaf.title,
            controlDescription: leaf.description,
            controlGuidance: leaf.guidance,
            status: (realStatus === "non_compliant" ||
            realStatus === "partial" ||
            realStatus === "unknown"
              ? realStatus
              : "not_assessed") as GapStatus,
            score: ass?.score ?? null,
            evidence: ass?.evidence ?? null,
            assessedAt: ass?.assessedAt ?? null,
          });
        }
      }
      if (gaps.length > 0) {
        domainGroups.push({ domain: null, gaps });
      }
    }

    const leafTotal = controlsForStd.filter((c) => c.parentId !== null).length;

    groups.push({
      standard: a.standard,
      isRequired: a.isRequired,
      source: a.source,
      rationale: a.rationale,
      rollup: {
        total: leafTotal,
        compliant,
        partial,
        nonCompliant,
        notApplicable,
        unknown,
        notAssessed,
      },
      domains: domainGroups,
    });
  }

  // Required standards first, then aspirational.
  return groups.sort((x, y) => {
    if (x.isRequired !== y.isRequired) return x.isRequired ? -1 : 1;
    return x.standard.name.localeCompare(y.standard.name);
  });
}

/** Overall stats across all applicable standards. */
export function tallyGapStats(groups: GapStandardGroup[]) {
  let total = 0;
  let compliant = 0;
  let partial = 0;
  let nonCompliant = 0;
  let notApplicable = 0;
  let unknown = 0;
  let notAssessed = 0;
  let openGaps = 0;
  let requiredOpenGaps = 0;
  for (const g of groups) {
    total += g.rollup.total;
    compliant += g.rollup.compliant;
    partial += g.rollup.partial;
    nonCompliant += g.rollup.nonCompliant;
    notApplicable += g.rollup.notApplicable;
    unknown += g.rollup.unknown;
    notAssessed += g.rollup.notAssessed;
    const groupGaps = g.domains.reduce((s, d) => s + d.gaps.length, 0);
    openGaps += groupGaps;
    if (g.isRequired) requiredOpenGaps += groupGaps;
  }
  return {
    total,
    compliant,
    partial,
    nonCompliant,
    notApplicable,
    unknown,
    notAssessed,
    openGaps,
    requiredOpenGaps,
  };
}
