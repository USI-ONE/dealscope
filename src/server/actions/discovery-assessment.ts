"use server";

/**
 * Write (or refresh) the AI narrative for a client site assessment or a
 * multi-site portfolio. Scores are computed on every page load; only the
 * narrative is generated here and cached in discovery_reports.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { ASSESSMENT_MODEL, writePortfolioNarrative, writeSiteNarrative } from "@/lib/discovery/assessment-ai";
import { loadPortfolio, loadSiteAssessment, portfolioFacts, saveReport } from "@/lib/discovery/assessment-store";
import { getProject } from "@/lib/discovery/load";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

export const generateSiteAssessment = authedAction
  .schema(z.object({ projectId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    if (!isAiConfigured()) throw new PublicError("AI isn't configured (ANTHROPIC_API_KEY).");
    const project = await getProject(parsedInput.projectId, ctx.organization.id);
    if (!project) throw new PublicError("Site walk not found");

    const { assessment } = await loadSiteAssessment(project);
    const narrative = await writeSiteNarrative(assessment.facts);
    await saveReport({
      organizationId: ctx.organization.id,
      kind: "site",
      key: project.id,
      sourceHash: assessment.sourceHash,
      content: narrative,
      model: ASSESSMENT_MODEL,
      membershipId: ctx.membership.id,
    });
    revalidatePath(`/discovery/${project.id}/assessment`);
    return { ok: true };
  });

export const generatePortfolioAssessment = authedAction
  .schema(z.object({ projectIds: z.array(z.string().uuid()).min(2).max(60) }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    if (!isAiConfigured()) throw new PublicError("AI isn't configured (ANTHROPIC_API_KEY).");

    const { assessments, key, hash, customer } = await loadPortfolio(ctx.organization.id, parsedInput.projectIds);
    if (assessments.length < 2) throw new PublicError("Pick at least two site walks");
    const narrative = await writePortfolioNarrative(customer, portfolioFacts(assessments));
    await saveReport({
      organizationId: ctx.organization.id,
      kind: "portfolio",
      key,
      sourceHash: hash,
      content: narrative,
      model: ASSESSMENT_MODEL,
      membershipId: ctx.membership.id,
    });
    revalidatePath("/discovery/portfolio");
    return { ok: true };
  });
