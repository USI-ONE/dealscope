"use client";

import {
  Activity,
  FileText,
  MessageSquare,
  Users,
  ClipboardList,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LogEntry = {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
};

const RESOURCE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  vault_file: FileText,
  data_request: ClipboardList,
  workstream_task: CheckCircle2,
  milestone: CheckCircle2,
  party: Users,
  invitation: Users,
  dialogue_thread: MessageSquare,
  dialogue_message: MessageSquare,
};

const ACTION_COLOR: Record<string, string> = {
  created: "bg-emerald-500",
  updated: "bg-blue-500",
  deleted: "bg-rose-500",
  completed: "bg-emerald-500",
  uploaded: "bg-purple-500",
  invited: "bg-amber-500",
  revoked: "bg-rose-500",
  accepted: "bg-emerald-500",
  replied: "bg-blue-500",
  status_changed: "bg-blue-500",
};

function getColor(action: string): string {
  const key = action.split(".").pop() ?? action;
  return ACTION_COLOR[key] ?? "bg-muted-foreground";
}

function getIcon(resourceType: string | null) {
  if (!resourceType) return Activity;
  return RESOURCE_ICON[resourceType] ?? Activity;
}

export function EngagementLogCard({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            Engagement Log
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Audit trail of all activity across this engagement.
          </p>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No activity recorded yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const grouped = groupByDate(entries);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          Engagement Log
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Audit trail of all activity across this engagement.
        </p>
      </CardHeader>

      <CardContent>
        <div className="space-y-6">
          {grouped.map(({ label, items }) => (
            <div key={label}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <div className="relative space-y-0 pl-5">
                <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border" />
                {items.map((entry) => {
                  const Icon = getIcon(entry.resourceType);
                  return (
                    <div key={entry.id} className="relative flex items-start gap-3 py-2">
                      <span className={`absolute -left-[3px] top-3 size-2 rounded-full ${getColor(entry.action)}`} />
                      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{entry.detail ?? entry.action}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {entry.actorName ?? "System"}
                          {" · "}
                          {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function groupByDate(entries: LogEntry[]): { label: string; items: LogEntry[] }[] {
  const map = new Map<string, LogEntry[]>();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  for (const entry of entries) {
    const d = new Date(entry.createdAt);
    let label: string;
    if (isSameDay(d, today)) label = "Today";
    else if (isSameDay(d, yesterday)) label = "Yesterday";
    else label = d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

    const list = map.get(label) ?? [];
    list.push(entry);
    map.set(label, list);
  }

  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
