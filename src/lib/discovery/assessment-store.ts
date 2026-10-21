/**
 * Load assessments (scorecard + cached AI narrative) for one site or a
 * set of sites. The narrative is "stale" when the walk data it was written
 * from has changed since.
 */
import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { discoveryProjects, discoveryReports, type DiscoveryProject } from "@/db/schema";
import { assessSite, baseCustomer, type SiteAssessment } from "./assessment";
import type { PortfolioNarrative, SiteNarrative } from "./assessment-ai";
import { loadProjectData } from "./load";

export type Cached<T> = { content: T; stale: boolean; updatedAt: Date } | null;

export async function loadSiteAssessment(project: DiscoveryProject) {
  const data = await loadProjectData(project);
  const assessment = assessSite(project, data);
  const row = await db.query.discoveryReports.findFirst({
    where: and(
      eq(discoveryReports.organizationId, project.organizationId),
      eq(discoveryReports.kind, "site"),
      eq(discoveryReports.reportKey, project.id),
    ),
  });
  const narrative: Cached<SiteNarrative> = row
    ? { content: row.content as SiteNarrative, stale: row.sourceHash !== assessment.sourceHash, updatedAt: row.updatedAt }
    : null;
  return { data, assessment, narrative };
}

export function portfolioKey(projectIds: string[]) {
  return createHash("sha256").update([...projectIds].sort().join(",")).digest("hex").slice(0, 24);
}

export function portfolioFacts(sites: SiteAssessment[]) {
  return sites.map((s) => `### ${s.site}\n${s.facts}`).join("\n\n");
}

export function portfolioHash(sites: SiteAssessment[]) {
  return createHash("sha256").update(sites.map((s) => s.sourceHash).sort().join(",")).digest("hex").slice(0, 16);
}

/** Most common customer name across the sites, minus branch suffixes. */
export function portfolioCustomer(sites: SiteAssessment[]) {
  const counts = new Map<string, number>();
  for (const s of sites) {
    const c = baseCustomer(s.customer);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export async function loadPortfolio(organizationId: string, projectIds: string[]) {
  const projects = projectIds.length
    ? await db
        .select()
        .from(discoveryProjects)
        .where(
          and(
            eq(discoveryProjects.organizationId, organizationId),
            inArray(discoveryProjects.id, projectIds),
            isNull(discoveryProjects.archivedAt),
          ),
        )
    : [];
  const sites = await Promise.all(projects.map(loadSiteAssessment));
  sites.sort((a, b) => a.assessment.score - b.assessment.score);
  const assessments = sites.map((s) => s.assessment);
  const key = portfolioKey(projects.map((p) => p.id));
  const row = projects.length
    ? await db.query.discoveryReports.findFirst({
        where: and(
          eq(discoveryReports.organizationId, organizationId),
          eq(discoveryReports.kind, "portfolio"),
          eq(discoveryReports.reportKey, key),
        ),
      })
    : null;
  const hash = portfolioHash(assessments);
  const narrative: Cached<PortfolioNarrative> = row
    ? { content: row.content as PortfolioNarrative, stale: row.sourceHash !== hash, updatedAt: row.updatedAt }
    : null;
  return { sites, assessments, key, hash, narrative, customer: portfolioCustomer(assessments) };
}

export async function saveReport(opts: {
  organizationId: string;
  kind: "site" | "portfolio";
  key: string;
  sourceHash: string;
  content: object;
  model: string;
  membershipId: string;
}) {
  await db
    .insert(discoveryReports)
    .values({
      organizationId: opts.organizationId,
      kind: opts.kind,
      reportKey: opts.key,
      sourceHash: opts.sourceHash,
      content: opts.content as Record<string, unknown>,
      model: opts.model,
      createdByMembershipId: opts.membershipId,
    })
    .onConflictDoUpdate({
      target: [discoveryReports.organizationId, discoveryReports.kind, discoveryReports.reportKey],
      set: {
        sourceHash: opts.sourceHash,
        content: opts.content as Record<string, unknown>,
        model: opts.model,
        createdByMembershipId: opts.membershipId,
        updatedAt: new Date(),
      },
    });
}
