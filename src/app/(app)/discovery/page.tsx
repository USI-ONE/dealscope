import Link from "next/link";
import { inArray } from "drizzle-orm";
import { Camera, ClipboardList, MapPin, Plus } from "lucide-react";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { canCtx, requireRole } from "@/lib/auth-helpers";
import { listProjectsWithProgress } from "@/lib/discovery/load";
import { DiscoveryStatusPill, ProgressRing } from "@/components/discovery/status-pill";

export const dynamic = "force-dynamic";
export const metadata = { title: "Site discovery" };

export default async function DiscoveryListPage() {
  const ctx = await requireRole("member");
  const canEdit = canCtx("update", "project", ctx);
  const rows = await listProjectsWithProgress(ctx.organization.id);

  const clientIds = [...new Set(rows.map((r) => r.project.clientId).filter((x): x is string => !!x))];
  const clientNames = new Map(
    clientIds.length
      ? (await db.select({ id: clients.id, name: clients.name }).from(clients).where(inArray(clients.id, clientIds))).map(
          (c) => [c.id, c.name],
        )
      : [],
  );

  const active = rows.filter((r) => ["planning", "in_progress", "review"].includes(r.project.status));
  const closed = rows.filter((r) => !["planning", "in_progress", "review"].includes(r.project.status));

  const Card = ({ r }: { r: (typeof rows)[number] }) => (
    <Link
      href={`/discovery/${r.project.id}`}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition active:scale-[0.99] hover:border-foreground/20"
    >
      <ProgressRing pct={r.progress.pct} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-semibold">{r.project.name}</p>
        </div>
        <p className="truncate text-[13px] text-muted-foreground">
          {[r.project.clientId ? clientNames.get(r.project.clientId) : null, r.project.siteAddress].filter(Boolean).join(" · ") ||
            "No client linked"}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <DiscoveryStatusPill status={r.project.status} />
          <span className="flex items-center gap-1">
            <Camera className="size-3.5" /> {r.photos}
          </span>
          <span>
            {r.progress.requiredPhotosDone}/{r.progress.requiredPhotos} required shots
          </span>
          {r.project.scheduledDate && <span>{r.project.scheduledDate}</span>}
        </div>
      </div>
    </Link>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Site discovery</h1>
          <p className="text-sm text-muted-foreground">Pre-install walkthroughs — built for your phone, works offline.</p>
        </div>
        {canEdit && (
          <Link
            href="/discovery/new"
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground active:scale-95"
          >
            <Plus className="size-5" /> New walk
          </Link>
        )}
      </div>

      {rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
          <ClipboardList className="size-8 text-muted-foreground" />
          <p className="text-[15px] font-medium">No site walks yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Start a walk before any rip-and-replace. Capture every closet, drop, device and door — with photos — so the install
            team can scope without a second visit.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <MapPin className="size-3.5" /> Active
          </h2>
          {active.map((r) => (
            <Card key={r.project.id} r={r} />
          ))}
        </section>
      )}
      {closed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Completed</h2>
          {closed.map((r) => (
            <Card key={r.project.id} r={r} />
          ))}
        </section>
      )}
    </div>
  );
}
