"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Save } from "lucide-react";
import { toast } from "sonner";
import {
  seedStaffingProfiles,
  upsertStaffingProfile,
} from "@/server/actions/staffing";
import {
  calcFte,
  fmtFte,
  type AutomationMaturity,
  type StrategicIntensity,
  type SupportIntensity,
} from "@/lib/staffing/calc";
import type { StaffingState, StaffingClientRow } from "@/lib/staffing/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function StaffingClientsPanel({
  state,
  initialFocusId,
}: {
  state: StaffingState;
  initialFocusId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(
    initialFocusId ?? state.clients[0]?.clientId ?? null,
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.clients;
    return state.clients.filter((c) =>
      c.clientName.toLowerCase().includes(q),
    );
  }, [state.clients, search]);

  const selected = state.clients.find((c) => c.clientId === selectedId) ?? null;
  const hasAnyProfiles = state.clients.some((c) => c.profileId);

  const onSeed = () => {
    start(async () => {
      const r = await seedStaffingProfiles({});
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      const data = r?.data;
      toast.success(
        data && data.created > 0
          ? `Seeded ${data.created} profile${data.created === 1 ? "" : "s"}.`
          : "All clients already have profiles.",
      );
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
        <CardHeader className="space-y-2 pb-2">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
            Clients
          </CardTitle>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 text-xs"
          />
          {!hasAnyProfiles && (
            <Button
              size="sm"
              onClick={onSeed}
              disabled={pending}
              className="w-full"
            >
              <Sparkles className="mr-1 size-3.5" />
              {pending ? "Seeding…" : "Seed profiles"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-0.5 p-1.5">
          {filtered.map((c) => (
            <button
              key={c.clientId}
              type="button"
              onClick={() => setSelectedId(c.clientId)}
              className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${
                selectedId === c.clientId ? "bg-muted" : ""
              }`}
            >
              <span className="truncate">
                {c.clientName}
                {!c.profileId && (
                  <Badge variant="outline" className="ml-1 text-[9px]">
                    new
                  </Badge>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {c.profileId ? fmtFte(c.totalFte) : "—"}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No matches.
            </p>
          )}
        </CardContent>
      </Card>

      {selected ? (
        <ProfileEditor key={selected.clientId} client={selected} />
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Select a client on the left to edit their staffing profile.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProfileEditor({ client }: { client: StaffingClientRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [userCount, setUserCount] = useState(String(client.userCount));
  const [sites, setSites] = useState(String(client.sites));
  const [servers, setServers] = useState(String(client.servers));
  const [apps, setApps] = useState(String(client.apps));
  const [automationMaturity, setAutomationMaturity] =
    useState<AutomationMaturity>(client.automationMaturity);
  const [strategicIntensity, setStrategicIntensity] =
    useState<StrategicIntensity>(client.strategicIntensity);
  const [supportIntensity, setSupportIntensity] = useState<SupportIntensity>(
    client.supportIntensity,
  );
  const [notes, setNotes] = useState(client.notes ?? "");

  const live = useMemo(
    () =>
      calcFte({
        userCount: Number(userCount) || 0,
        sites: Math.max(1, Number(sites) || 1),
        servers: Number(servers) || 0,
        apps: Number(apps) || 0,
        automationMaturity,
        strategicIntensity,
        supportIntensity,
      }),
    [
      userCount,
      sites,
      servers,
      apps,
      automationMaturity,
      strategicIntensity,
      supportIntensity,
    ],
  );

  const save = () => {
    start(async () => {
      const r = await upsertStaffingProfile({
        clientId: client.clientId,
        userCount: Math.max(0, parseInt(userCount || "0", 10)),
        sites: Math.max(1, parseInt(sites || "1", 10)),
        servers: Math.max(0, parseInt(servers || "0", 10)),
        apps: Math.max(0, parseInt(apps || "0", 10)),
        automationMaturity,
        strategicIntensity,
        supportIntensity,
        notes: notes.trim() || null,
      });
      if (r?.serverError) {
        toast.error(r.serverError);
        return;
      }
      toast.success("Profile saved");
      router.refresh();
    });
  };

  const applySuggestions = () => {
    setSites(String(client.suggestedSites));
    setServers(String(client.suggestedServers));
    setApps(String(client.suggestedApps));
    toast.success("Pulled site / server / app counts from TechOS data");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{client.clientName}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {client.profileId
                ? `Profile last updated ${client.profileUpdatedAt ? new Date(client.profileUpdatedAt).toLocaleString() : "—"}`
                : "No profile yet — fill in below and save to create one."}
            </p>
          </div>
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Real-time FTE
            </div>
            <div className="text-lg font-bold tabular-nums">
              {fmtFte(live.tier1Fte + live.tier2Fte + client.tier3Fte)} total
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              T1 {fmtFte(live.tier1Fte)} · T2 {fmtFte(live.tier2Fte)} · T3{" "}
              {fmtFte(client.tier3Fte)}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {/* Tier 1 inputs */}
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                Tier 1 inputs — desktop support
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">End users</Label>
                <Input
                  type="number"
                  min="0"
                  value={userCount}
                  onChange={(e) => setUserCount(e.target.value)}
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Total people we provide desktop support to. Baseline: 150 users per Tier 1 FTE.
                </p>
              </div>
              <div>
                <Label className="text-xs">Support intensity</Label>
                <select
                  value={supportIntensity}
                  onChange={(e) =>
                    setSupportIntensity(e.target.value as SupportIntensity)
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="low">Low (×0.7) — self-sufficient users</option>
                  <option value="standard">Standard (×1.0)</option>
                  <option value="high">High (×1.3) — high-touch / training-heavy</option>
                </select>
              </div>
              <Explanation>
                Tier 1 = users / 150 × {live.breakdown.tier1.supportMultiplier} = {" "}
                <strong>{fmtFte(live.tier1Fte)} FTE</strong>
              </Explanation>
            </CardContent>
          </Card>

          {/* Tier 2 inputs */}
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                Tier 2 inputs — systems admin
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Sites</Label>
                  <Input
                    type="number"
                    min="1"
                    value={sites}
                    onChange={(e) => setSites(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Servers</Label>
                  <Input
                    type="number"
                    min="0"
                    value={servers}
                    onChange={(e) => setServers(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Apps</Label>
                  <Input
                    type="number"
                    min="0"
                    value={apps}
                    onChange={(e) => setApps(e.target.value)}
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={applySuggestions}
                className="h-7 text-[11px]"
                title={`Pull from TechOS: ${client.suggestedSites} sites · ${client.suggestedServers} servers · ${client.suggestedApps} apps`}
              >
                Use TechOS counts ({client.suggestedSites} / {client.suggestedServers} / {client.suggestedApps})
              </Button>
              <div>
                <Label className="text-xs">Automation maturity</Label>
                <select
                  value={automationMaturity}
                  onChange={(e) =>
                    setAutomationMaturity(e.target.value as AutomationMaturity)
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="manual">Manual (+1.0 overhead)</option>
                  <option value="partial">Partial (+0.5)</option>
                  <option value="high">High (+0)</option>
                </select>
              </div>
              <Explanation>
                Env score = sites×0.2 + servers×0.3 + apps×0.25 + automation
                overhead = {" "}
                <strong>{live.breakdown.tier2.envScore.toFixed(2)}</strong>;
                Tier 2 = env/8 + 35% reactive buffer ={" "}
                <strong>{fmtFte(live.tier2Fte)} FTE</strong>
              </Explanation>
            </CardContent>
          </Card>

          {/* Tier 3 inputs */}
          <Card className="border-dashed md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                Tier 3 — systems engineering / strategic
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Strategic initiative intensity</Label>
                <select
                  value={strategicIntensity}
                  onChange={(e) =>
                    setStrategicIntensity(
                      e.target.value as StrategicIntensity,
                    )
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="none">None (0)</option>
                  <option value="low">Low (0.5)</option>
                  <option value="medium">Medium (1.0)</option>
                  <option value="high">High (1.5)</option>
                </select>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  CIO-review hint. The authoritative Tier 3 FTE comes from
                  the sum of strategic initiatives allocated to this client
                  on the Forecast tab.
                </p>
              </div>
              <Explanation>
                Strategic-intensity weight: <strong>{live.tier3StrategicWeight.toFixed(2)}</strong> ·
                Authoritative Tier 3 from initiatives:{" "}
                <strong>{fmtFte(client.tier3Fte)} FTE</strong>
              </Explanation>
            </CardContent>
          </Card>
        </div>

        <div>
          <Label className="text-xs">Notes</Label>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything that affects staffing demand at this client — e.g. compliance overhead, 24/7 expectation, recent acquisition."
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button onClick={save} disabled={pending}>
            <Save className="mr-1 size-3.5" />
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Explanation({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded bg-muted/30 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
      {children}
    </div>
  );
}
