/**
 * Compact projects panel rendered on the client's Projects tab on
 * /clients/[id]?tab=projects.
 *
 * Pure server component — receives pre-fetched rows from the page so
 * the client page's existing Promise.all stays the single round-trip
 * to the DB for that screen.
 */
import Link from "next/link";
import { ClipboardList, FolderPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const HEALTH_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
};
const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  in_progress: "In progress",
  on_hold: "On hold",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};
const KIND_LABEL: Record<string, string> = {
  m365_migration: "M365 Migration",
  win11_rollout: "Win11 Rollout",
  server_replacement: "Server Replacement",
  network_refresh: "Network Refresh",
  onboarding: "Onboarding",
  security_baseline: "Security Baseline",
  eol_refresh: "EOL Refresh",
  cybersecurity_audit: "Security Audit",
  custom: "Custom",
};

function formatDate(d: string | Date | null): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d + "T00:00:00Z") : d;
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ClientProjectsCard({
  clientId,
  canEdit,
  projects,
}: {
  clientId: string;
  canEdit: boolean;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    kind: string;
    status: string;
    health: string;
    summary: string | null;
    plannedStartDate: string | null;
    plannedEndDate: string | null;
    archivedAt: Date | string | null;
    percentComplete: number;
    totalTasks: number;
    doneTasks: number;
  }>;
}) {
  const active = projects.filter((p) => !p.archivedAt);
  const archived = projects.filter((p) => p.archivedAt);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="size-4" />
              Projects
            </CardTitle>
            <CardDescription>
              Engagements and deliverables tied to this client. Use the
              detail page to manage milestones, tasks, status updates, and
              deliverables — and to generate per-client status reports
              (PDF / DOCX).
            </CardDescription>
          </div>
          {canEdit && (
            <Button asChild size="sm">
              <Link href={`/projects/new?client=${clientId}`}>
                <FolderPlus className="mr-1 size-3.5" /> New project
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {active.length === 0 ? (
          <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            No active projects for this client yet.
            {canEdit && (
              <>
                {" "}
                <Link
                  href={`/projects/new?client=${clientId}`}
                  className="text-primary hover:underline"
                >
                  Start one →
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <Th className="w-12"></Th>
                  <Th>Project</Th>
                  <Th>Kind</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Progress</Th>
                  <Th>Dates</Th>
                </tr>
              </thead>
              <tbody>
                {active.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b last:border-b-0 hover:bg-muted/30"
                  >
                    <Td>
                      <span
                        className={`block size-3 rounded-full ${HEALTH_DOT[p.health]}`}
                        title={p.health}
                      />
                    </Td>
                    <Td>
                      <Link href={`/projects/${p.id}`} className="block">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.code}
                          {p.summary && ` · ${p.summary}`}
                        </div>
                      </Link>
                    </Td>
                    <Td className="text-xs text-muted-foreground">
                      {KIND_LABEL[p.kind] ?? p.kind}
                    </Td>
                    <Td>
                      <Badge variant="outline" className="text-xs">
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {p.totalTasks > 0
                        ? `${p.percentComplete}% (${p.doneTasks}/${p.totalTasks})`
                        : "—"}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                      {formatDate(p.plannedStartDate)} →{" "}
                      {formatDate(p.plannedEndDate)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {archived.length > 0 && (
          <div className="mt-4 text-xs text-muted-foreground">
            <strong>{archived.length}</strong> archived project
            {archived.length === 1 ? "" : "s"} —{" "}
            <Link
              href={`/projects?client=${clientId}&archived=1`}
              className="text-primary hover:underline"
            >
              view archive
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`border-b px-3 py-2 text-left text-xs font-medium uppercase tracking-wider ${className}`}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 align-middle ${className}`}>{children}</td>;
}
