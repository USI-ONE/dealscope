/**
 * Install scope — the proposed infrastructure install for this site as a
 * bill of materials + labor (see lib/discovery/scope.ts). Edit quantities
 * and prices, then export for QuickBooks to raise the sales order and hand
 * the crew-day estimate to scheduling.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { loadSiteAssessment } from "@/lib/discovery/assessment-store";
import { getProject } from "@/lib/discovery/load";
import { loadScope, money, plannedScope } from "@/lib/discovery/scope";
import { PrintButton } from "@/components/discovery/print-button";
import { BuildScopeButton, ScopeBoard } from "@/components/discovery/scope-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Install scope" };

export default async function ScopePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();
  const [{ assessment, data }, { catalog, lines, totals }] = await Promise.all([
    loadSiteAssessment(project),
    loadScope(ctx.organization.id, project.id),
  ]);
  const { counts: c } = plannedScope(assessment, data);

  const facts = [
    c.sqft ? `${c.sqft.toLocaleString()} sq ft` : null,
    `${c.seats} seats`,
    `${c.phones} phones`,
    `${c.printers} printers`,
    `${c.aps} APs`,
    `${c.cameras} cameras`,
    `${c.doors} entry door${c.doors === 1 ? "" : "s"}`,
    `${c.ports} switch ports`,
  ].filter(Boolean);

  return (
    <div className="space-y-5 pb-12">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Proposed install scope</h2>
            <p className="text-sm text-muted-foreground">
              UniFi network &amp; Wi-Fi, Verkada security, sized from the walk: {facts.join(" · ")}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <BuildScopeButton projectId={project.id} label={lines.length ? "Refresh from walk" : "Build scope"} />
            {lines.length > 0 && (
              <a
                href={`/discovery/${project.id}/scope.csv`}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium"
              >
                <Download className="size-4" /> QuickBooks CSV
              </a>
            )}
            <PrintButton />
          </div>
        </div>

        {lines.length > 0 ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="One-time" value={money(totals.oneTimeCents)} />
            <Stat label="Yearly licenses" value={money(totals.annualCents)} />
            <Stat label="Labor" value={`${totals.laborHours} h`} />
            <Stat label="Crew days" value={`~${totals.crewDays}`} hint={`2 techs, incl. ${totals.cablingDrops} drops`} />
          </dl>
        ) : (
          <p className="rounded-xl bg-primary/5 p-4 text-sm">Build the scope to turn this walk’s findings and counts into a bill of materials.</p>
        )}

        {totals.unpriced > 0 && (
          <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300 print:hidden">
            {totals.unpriced} line{totals.unpriced === 1 ? " has" : "s have"} no price yet (shown as “price?”). Set them here or on the{" "}
            <Link href="/discovery/catalog" className="font-semibold underline">
              price list
            </Link>{" "}
            before exporting — totals leave them out.
          </p>
        )}
      </section>

      {lines.length > 0 && (
        <ScopeBoard
          projectId={project.id}
          lines={lines}
          catalog={catalog.filter((x) => x.active).map((x) => ({ sku: x.sku, name: x.name, category: x.category, unit: x.unit }))}
        />
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
