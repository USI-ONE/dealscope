/**
 * Install team brief — the remediation work order for a finished walk.
 *
 * The full report (/report) is everything that was captured. This page is
 * what the crew going on site needs: who to call and how to get in, what
 * is dangerous, what to replace, how many drops to pull, what the network
 * looks like today, what still has to be confirmed before the trip, and
 * the photos that show where the work is.
 */
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, diligenceEngagements, DISCOVERY_STATUS_LABEL } from "@/db/schema";
import type { DiscoveryAnswerValue } from "@/db/schema/discovery";
import { requireRole } from "@/lib/auth-helpers";
import { getProject, loadProjectData } from "@/lib/discovery/load";
import { photoUrl } from "@/lib/discovery/paths";
import { photoSrc } from "@/lib/discovery/photo-variants";
import { answerToText, recordTitle, sectionFields, templateIndex } from "@/lib/discovery/templates";
import { PrintButton } from "@/components/discovery/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Install team brief" };

const LEVELS = ["Blocker", "High", "Medium", "Low"];
const ACTION_ORDER = ["Replace", "Decommission", "Needs-eval", "Reuse-reconfig"];
/** Inventory tables whose rows become work items when not marked Keep. */
const WORK_TABLES = ["aps", "access_switches", "cameras", "doors", "printers", "rooms", "servers", "workstations", "idfs"];
/**
 * Open questions the crew can't arrive without: who the circuits and phones
 * belong to (and the account / port paperwork to cut over), the closet's
 * power and grounding, Wi-Fi to recreate, and the alarm account so they can
 * work after hours. Each comes with why it matters on install day.
 */
const CREW_NEEDS: Record<string, string> = {
  "wan.p_carrier": "Who to call for the circuit and cutover",
  "wan.p_account": "Carrier will ask for it on any ticket",
  "wan.p_ips": "Static IPs must be re-applied on the new firewall",
  "wan.loa": "New circuit / LOA lead time",
  "wan.cutover_window": "Book the carrier for cutover",
  "firewall.dhcp": "Know what hands out addresses before replacing the router",
  "mdf.circuits": "Whether a new circuit is needed for the rack / UPS",
  "mdf.breaker_panel": "Where to kill / add power for the closet",
  "mdf.tmgb": "Grounding for the new rack",
  "facility.grounding": "Grounding for the new rack",
  "wireless.ssids": "Recreate network names so devices reconnect",
  "wireless.ssid_auth": "Wi-Fi passwords / auth to carry over",
  "voice.hosted_vendor": "Phone provider to coordinate the move",
  "voice.did": "Numbers that must keep working",
  "voice.porting_loa": "Number porting paperwork",
  "alarms.account": "Alarm account / codes for after-hours work",
  "cameras.storage": "Footage to keep before swapping the recorder",
};
/** Required-photo slots worth printing for the crew, in walking order. */
const KEY_SHOTS = [
  "photos.exterior",
  "photos.entrances",
  "photos.demarc",
  "photos.mdf_door",
  "photos.mdf_front",
  "photos.mdf_back",
  "photos.mdf_power",
  "photos.fw_front",
  "photos.core_stack",
  "photos.mdf_labels",
  "photos.pathway",
  "photos.ceiling_tile",
  "photos.hazard",
  "photos.ext_cameras",
];

export default async function InstallBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();
  const [{ template, answers, recordRows, photoRows, progress }, client, engagement] = await Promise.all([
    loadProjectData(project),
    project.clientId ? db.query.clients.findFirst({ where: eq(clients.id, project.clientId), columns: { name: true } }) : null,
    project.engagementId
      ? db.query.diligenceEngagements.findFirst({
          where: eq(diligenceEngagements.id, project.engagementId),
          columns: { targetCompanyName: true },
        })
      : null,
  ]);
  const idx = templateIndex(template);
  const na = new Set(project.naSections);

  const isOpen = (key: string) => {
    const a = answers.get(key);
    return !!a && !a.notApplicable && !!a.value?.followUp;
  };
  /** Answer text for a question, "" when blank / follow-up / N/A section. */
  const text = (key: string) => {
    const f = idx.fields.get(key);
    if (!f || na.has(f.sectionKey)) return "";
    return answerToText(f, answers.get(key));
  };
  /** Notes, minus the generic "Unknown — follow up" placeholder. */
  const note = (key: string) => {
    const n = answers.get(key)?.notes ?? "";
    return /^unknown\b[\s—-]*(follow up)?$/i.test(n.trim()) ? "" : n;
  };
  const line = (key: string) => {
    const out = [text(key), note(key)].filter(Boolean).join(" — ");
    return out || (isOpen(key) ? "To confirm" : "");
  };
  /** Several answers on one row; "To confirm" once if all are open. */
  const join = (...keys: string[]) => {
    const parts = keys.map(line);
    const known = parts.filter((p) => p && p !== "To confirm");
    return known.length ? known.join(" · ") : parts.some(Boolean) ? "To confirm" : "";
  };
  const contact = (key: string) => {
    const v = answers.get(key)?.value?.v as DiscoveryAnswerValue["v"];
    if (!v || typeof v !== "object" || Array.isArray(v)) return line(key);
    return [[v.name, v.phone, v.email].filter(Boolean).join(" · "), note(key)].filter(Boolean).join(" — ");
  };

  const site = text("cover.site_name") || project.name;
  const address = project.siteAddress || [text("cover.street"), text("cover.city_state_zip")].filter(Boolean).join(", ");
  const customer = text("cover.client_name") || client?.name || engagement?.targetCompanyName || "";

  const risks = recordRows
    .filter((r) => r.tableKey === "risks")
    .sort((a, b) => LEVELS.indexOf(a.data.level ?? "") - LEVELS.indexOf(b.data.level ?? ""));

  // Inventory that needs action, grouped by action.
  const workItems = recordRows
    .filter((r) => WORK_TABLES.includes(r.tableKey) && r.data.keep && r.data.keep !== "Keep")
    .map((r) => {
      const t = idx.tables.get(r.tableKey)!.table;
      const detail = t.subtitleKeys
        ?.map((k) => r.data[k])
        .filter(Boolean)
        .join(" · ");
      return { id: r.id, action: r.data.keep!, kind: t.singular, title: recordTitle(t, r.data), detail, notes: r.data.notes ?? "" };
    })
    .sort((a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action));

  // Cable drops to pull.
  const cabling = template.sections.find((s) => s.key === "cabling");
  const drops = (cabling ? sectionFields(cabling) : [])
    .filter((f) => f.key.startsWith("drop_"))
    .map((f) => ({ label: f.label, n: Number(answers.get(f.questionKey)?.value?.v ?? 0), notes: note(f.questionKey) }))
    .filter((d) => d.n > 0);
  const dropTotal = drops.reduce((s, d) => s + d.n, 0);

  // Open follow-ups: the few the crew needs before the trip, the rest in the appendix.
  const openFields = template.sections
    .filter((s) => !na.has(s.key))
    .flatMap((s) => sectionFields(s).map((f) => ({ f, section: s.title })))
    .filter(({ f }) => isOpen(f.questionKey));
  const crewNeeds = Object.keys(CREW_NEEDS).flatMap((k) => {
    const hit = openFields.find(({ f }) => f.questionKey === k);
    return hit ? [{ ...hit, why: CREW_NEEDS[k] }] : [];
  });
  const appendix = Object.entries(
    openFields
      .filter(({ f }) => !(f.questionKey in CREW_NEEDS))
      .reduce<Record<string, string[]>>((acc, { f, section }) => {
        (acc[section] ??= []).push(f.label);
        return acc;
      }, {}),
  );
  const followUpCount = openFields.length;
  const appendixCount = followUpCount - crewNeeds.length;

  const shots = KEY_SHOTS.map((k) => ({
    key: k,
    label: idx.fields.get(k)?.label ?? k,
    photos: photoRows.filter((p) => p.questionKey === k).slice(0, 3),
  })).filter((s) => s.photos.length);

  const asFound: Array<[string, string]> = (
    [
      ["Internet", [text("wan.p_type"), `carrier: ${text("wan.p_carrier") || "to confirm"}`].filter(Boolean).join(" · ")],
      ["Demarc / handoff", join("wan.p_demarc", "wan.p_handoff")],
      ["Router / firewall", line("firewall.fw_model")],
      ["Core switch", line("firewall.core_model")],
      ["Wi-Fi", line("wireless.dead_zones")],
      ["Network closet", join("mdf.location", "mdf.dedicated", "mdf.dimensions")],
      ["Closet door / lock", line("mdf.door")],
      ["Closet power", join("mdf.circuits", "mdf.breaker_panel")],
      ["UPS", line("mdf.ups")],
      ["Cooling", join("mdf.hvac", "mdf.temp_today")],
      ["Patch panels", line("mdf.patch_panels")],
      ["Labeling", line("cabling.label_scheme") || line("mdf.labeling")],
      ["Existing cable", join("cabling.category", "cabling.condition", "cabling.jacket")],
      ["Ceiling", line("facility.plenum")],
      ["Phones", line("voice.pbx")],
      ["Cameras", line("cameras.recorder_type")],
      ["Alarm", line("alarms.monitoring_co")],
    ] as Array<[string, string]>
  ).filter(([, v]) => v);

  const hazards: Array<[string, string]> = (
    [
      ["Asbestos / lead", line("facility.asbestos")],
      ["Hazmat", line("facility.hazmat")],
      ["Wet / humid areas", line("facility.wet")],
      ["Class 1 areas", text("facility.class1") === "Yes" ? line("facility.class1") : ""],
      ["Water near equipment", line("mdf.overhead_water")],
      ["Emergency lighting", line("environmental.egress_lighting") || line("mdf.lighting")],
    ] as Array<[string, string]>
  ).filter(([, v]) => v && !/^No\b/.test(v));

  const access: Array<[string, string]> = (
    [
      ["Site contact", contact("cover.facility_poc")],
      ["Client sponsor", contact("cover.client_sponsor")],
      ["Hours", text("cover.hours")],
      ["Work windows", line("cover.work_windows")],
      ["After-hours access", line("facility.after_hours")],
      ["Escort required", text("facility.escort")],
      ["Alarm company", contact("cover.alarm_poc")],
      ["Low-volt / phone vendor", contact("cover.lowvolt_vendor")],
      ["Landlord", contact("cover.landlord")],
      ["Walked by", contact("cover.lead_walker")],
    ] as Array<[string, string]>
  ).filter(([, v]) => v && v !== "N/A");

  const H2 = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <h2 className="flex items-baseline gap-2 border-b-2 border-foreground pb-1 text-lg font-bold">
      <span className="text-muted-foreground">{n}.</span> {children}
    </h2>
  );
  const Rows = ({ rows }: { rows: Array<[string, string]> }) => (
    <dl className="divide-y divide-border/70 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="grid break-inside-avoid grid-cols-[9.5rem_minmax(0,1fr)] gap-3 py-1.5">
          <dt className="font-medium text-muted-foreground">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
  let n = 0;

  return (
    <div className="mx-auto max-w-4xl space-y-7 pb-16 print:max-w-none print:space-y-5 print:text-[11px]">
      <div className="flex items-center justify-end print:hidden">
        <PrintButton />
      </div>

      <header className="space-y-1.5 border-b-4 border-foreground pb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Install team brief · Remediation work order</p>
        <h1 className="text-3xl font-bold tracking-tight">{customer || site}</h1>
        {customer && <p className="text-xl font-semibold">{site}</p>}
        {address && <p className="text-[15px]">{address}</p>}
        <p className="text-sm text-muted-foreground">
          {[
            project.scheduledDate && `Walked ${project.scheduledDate}`,
            DISCOVERY_STATUS_LABEL[project.status],
            `${risks.length} risks`,
            `${workItems.length} items to replace / remove`,
            dropTotal ? `${dropTotal} new drops` : null,
            crewNeeds.length ? `${crewNeeds.length} to confirm before install` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {project.summary && <p className="whitespace-pre-wrap pt-1 text-[15px] leading-relaxed">{project.summary}</p>}
      </header>

      {access.length > 0 && (
        <section className="space-y-2">
          <H2 n={++n}>Site access & contacts</H2>
          <Rows rows={access} />
        </section>
      )}

      {hazards.length > 0 && (
        <section className="space-y-2 break-inside-avoid">
          <H2 n={++n}>Safety & site hazards</H2>
          <div className="rounded-lg border-2 border-amber-500/70 bg-amber-500/5 p-3 print:bg-transparent">
            <Rows rows={hazards} />
          </div>
        </section>
      )}

      {risks.length > 0 && (
        <section className="space-y-2">
          <H2 n={++n}>Issues to remediate</H2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="w-8 py-1.5 pr-2">✓</th>
                <th className="w-20 py-1.5 pr-2">Priority</th>
                <th className="py-1.5 pr-2">Issue</th>
                <th className="w-28 py-1.5">Area</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((r) => (
                <tr key={r.id} className="break-inside-avoid border-b border-border/60 align-top">
                  <td className="py-1.5 pr-2">
                    <span className="inline-block size-4 rounded-sm border-2 border-foreground/60" />
                  </td>
                  <td className="py-1.5 pr-2 font-semibold">{r.data.level || "—"}</td>
                  <td className="py-1.5 pr-2">{r.data.risk}</td>
                  <td className="py-1.5 text-muted-foreground">{r.data.area}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(workItems.length > 0 || drops.length > 0) && (
        <section className="space-y-3">
          <H2 n={++n}>Scope of work</H2>
          {drops.length > 0 && (
            <div className="space-y-1 break-inside-avoid">
              <h3 className="text-[15px] font-semibold">New cable drops ({dropTotal})</h3>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {drops.map((d) => (
                    <tr key={d.label} className="border-b border-border/60 align-top">
                      <td className="w-14 py-1.5 pr-2 text-right font-semibold tabular-nums">{d.n}</td>
                      <td className="py-1.5 pr-2">{d.label}</td>
                      <td className="py-1.5 text-muted-foreground">{d.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {workItems.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-[15px] font-semibold">Equipment to replace, remove or evaluate ({workItems.length})</h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="w-8 py-1.5 pr-2">✓</th>
                    <th className="w-28 py-1.5 pr-2">Action</th>
                    <th className="py-1.5 pr-2">Item</th>
                    <th className="py-1.5">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {workItems.map((w) => (
                    <tr key={w.id} className="break-inside-avoid border-b border-border/60 align-top">
                      <td className="py-1.5 pr-2">
                        <span className="inline-block size-4 rounded-sm border-2 border-foreground/60" />
                      </td>
                      <td className="py-1.5 pr-2 font-semibold">{w.action}</td>
                      <td className="py-1.5 pr-2">
                        <span className="text-muted-foreground">{w.kind}: </span>
                        {w.title}
                        {w.detail && <span className="block text-xs text-muted-foreground">{w.detail}</span>}
                      </td>
                      <td className="py-1.5 text-muted-foreground">{w.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {asFound.length > 0 && (
        <section className="space-y-2">
          <H2 n={++n}>Network & infrastructure as found</H2>
          <Rows rows={asFound} />
        </section>
      )}

      {crewNeeds.length > 0 && (
        <section className="space-y-2 break-inside-avoid">
          <H2 n={++n}>Confirm before the install ({crewNeeds.length})</H2>
          <p className="text-sm text-muted-foreground">
            The crew needs these before going on site. Get them from the client, carrier or vendor when scheduling.
          </p>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {crewNeeds.map(({ f, section, why }) => (
                <tr key={f.questionKey} className="break-inside-avoid border-b border-border/60 align-top">
                  <td className="w-8 py-1.5 pr-2">
                    <span className="inline-block size-4 rounded-sm border-2 border-foreground/60" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="font-medium">{f.label}</span>
                    <span className="block text-xs text-muted-foreground">{section}</span>
                  </td>
                  <td className="py-1.5 text-muted-foreground">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {appendixCount > 0 && (
            <p className="text-xs text-muted-foreground">{appendixCount} other open questions are listed in the appendix.</p>
          )}
        </section>
      )}

      {shots.length > 0 && (
        <section className="space-y-2">
          <H2 n={++n}>Key photos</H2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
            {shots.map((s) => (
              <figure key={s.key} className="break-inside-avoid space-y-1">
                <div className="grid grid-cols-1 gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoSrc(photoUrl(project.id, s.photos[0].id), "md")}
                    alt={s.label}
                    className="aspect-[4/3] w-full rounded border border-border object-cover"
                  />
                </div>
                <figcaption className="text-xs font-medium">
                  {s.label}
                  {s.photos.length > 1 && <span className="text-muted-foreground"> · +{s.photos.length - 1} more in app</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3 break-inside-avoid">
        <H2 n={++n}>Install sign-off</H2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 pt-2 text-sm sm:grid-cols-2 print:grid-cols-2">
          {["Lead technician", "Date completed", "Client representative", "Date"].map((l) => (
            <div key={l}>
              <div className="h-8 border-b border-foreground/70" />
              <p className="pt-1 text-xs text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
        <div className="pt-2 text-sm">
          <p className="font-medium">Notes from the install</p>
          <div className="mt-1 h-24 rounded border border-foreground/40" />
        </div>
      </section>

      {appendix.length > 0 && (
        <section className="space-y-2 print:break-before-page">
          <h2 className="border-b border-border pb-1 text-base font-bold">Appendix — other open questions ({appendixCount})</h2>
          <p className="text-xs text-muted-foreground">Not needed for the install trip; still open from the walk.</p>
          <div className="columns-1 gap-6 text-xs sm:columns-2 print:columns-3">
            {appendix.map(([section, labels]) => (
              <div key={section} className="mb-2.5 break-inside-avoid">
                <p className="font-semibold">{section}</p>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {labels.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        Generated {new Date().toLocaleString("en-US", { timeZone: "America/Denver" })} from the DealScope site walk ·{" "}
        {progress.pct}% captured · {photoRows.length} photos on file. Full detail: Report.
      </p>
    </div>
  );
}
