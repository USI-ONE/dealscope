import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { DonutChart, DonutLegend } from "./donut-chart";

const BRAND = "#458C5E";
const TEAL = "#3B697A";

const OS_SEGMENTS = [
  { label: "Windows 11 Pro", pct: 71, color: BRAND },
  { label: "Windows 10 Pro (EOL Oct 2025)", pct: 29, color: "#f59e0b" },
];

function Kpi({ label, value, sub, accent = false }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-0.5"
      style={{ background: accent ? `linear-gradient(135deg, ${BRAND}, ${TEAL})` : undefined }}
    >
      <span className="text-2xl font-bold tabular-nums" style={{ color: accent ? "#fff" : BRAND }}>
        {value}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: accent ? "rgba(255,255,255,0.75)" : "#64748b" }}>
        {label}
      </span>
      {sub && (
        <span className="text-xs" style={{ color: accent ? "rgba(255,255,255,0.65)" : "#94a3b8" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function Check({ ok, label, note }: { ok: boolean | "warn"; label: string; note?: string }) {
  const icon = ok === true
    ? <CheckCircle className="size-4 text-emerald-600 shrink-0 mt-0.5" />
    : ok === "warn"
    ? <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
    : <XCircle className="size-4 text-rose-500 shrink-0 mt-0.5" />;
  return (
    <div className="flex items-start gap-2">
      {icon}
      <div>
        <div className="text-sm font-medium leading-tight">{label}</div>
        {note && <div className="text-xs text-slate-500">{note}</div>}
      </div>
    </div>
  );
}

function SystemPill({ name, vendor, baa }: { name: string; vendor: string; baa?: boolean }) {
  return (
    <div className="rounded border bg-white p-3 flex flex-col gap-1">
      <div className="text-xs font-bold text-slate-700">{name}</div>
      <div className="text-xs text-slate-500">{vendor}</div>
      {baa !== undefined && (
        <div className={`text-[10px] font-semibold ${baa ? "text-emerald-700" : "text-rose-600"}`}>
          {baa ? "✓ BAA" : "✗ BAA Gap"}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
      {children}
    </h3>
  );
}

function RiskFlag({ text, level }: { text: string; level: "critical" | "high" | "medium" }) {
  const colors: Record<string, string> = {
    critical: "bg-rose-50 border-rose-300 text-rose-800",
    high: "bg-orange-50 border-orange-300 text-orange-800",
    medium: "bg-amber-50 border-amber-300 text-amber-800",
  };
  return <div className={`rounded border px-3 py-2 text-xs ${colors[level]}`}>{text}</div>;
}

function GreenFlag({ text }: { text: string }) {
  return <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{text}</div>;
}

export function ItInfographic() {
  return (
    <div className="space-y-8 text-slate-800">
      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Annual IT Spend" value="$118k" accent />
        <Kpi label="Managed Endpoints" value="62" sub="All laptops, cloud-first" />
        <Kpi label="Sites (Meraki)" value="3" sub="Phoenix, Scottsdale, Tempe" />
        <Kpi label="MSP Retainer" value="$38.4k" sub="/yr — CloudTech Solutions" />
      </div>

      {/* ── Security Posture + Systems ─────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border p-5 space-y-3">
          <SectionTitle>Security Posture</SectionTitle>
          <div className="space-y-2">
            <Check ok={true} label="MFA — All W-2 staff via Entra ID" note="1099 contractors excluded — HIPAA gap" />
            <Check ok={true} label="EDR — Microsoft Defender for Business" note="100% coverage on managed endpoints" />
            <Check ok={true} label="Email Gateway — Defender for Office 365" />
            <Check ok={true} label="DNS Filtering — Cisco Umbrella at all 3 sites" />
            <Check ok={true} label="Cyber Insurance — Chubb CyberEdge $3M / HIPAA" />
            <Check ok={false} label="SIEM / Security Monitoring" note="No 24/7 monitoring. Alerts go to IT coordinator email only." />
            <Check ok={false} label="Penetration Test" note="Never conducted — HIPAA technical evaluation gap" />
            <Check ok={false} label="DR Runbook" note="No documented disaster recovery plan" />
            <Check ok={false} label="Vulnerability Scanning" note="Not in scope for MSP or internal IT" />
            <Check ok="warn" label="Shared Accounts — Front Desk (3 users, 1 login)" note="HIPAA access control violation" />
            <Check ok="warn" label="AI / ChatGPT use by clinicians — no policy, no DLP" note="Likely PHI entry — potential HIPAA breach" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-5">
            <SectionTitle>Key Clinical &amp; Business Systems</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <SystemPill name="EHR" vendor="TherapyNotes (SaaS)" baa={true} />
              <SystemPill name="Telehealth" vendor="Zoom for Healthcare" baa={true} />
              <SystemPill name="Clearinghouse" vendor="Availity (primary)" baa={true} />
              <SystemPill name="Messaging" vendor="Spruce Health (partial)" baa={undefined} />
              <SystemPill name="Email / Collab" vendor="Microsoft 365 Business Std" baa={true} />
              <SystemPill name="HRIS / Payroll" vendor="Rippling + ADP" baa={false} />
              <SystemPill name="Network" vendor="Cisco Meraki (all sites)" />
              <SystemPill name="Identity" vendor="Entra ID — cloud-only" baa={true} />
            </div>
          </div>

          <div className="rounded-lg border p-5">
            <SectionTitle>Endpoint OS Mix (62 devices)</SectionTitle>
            <div className="flex items-center gap-6">
              <DonutChart segments={OS_SEGMENTS} size={110} strokeWidth={20} centerLabel="62" />
              <DonutLegend segments={OS_SEGMENTS} />
            </div>
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              ⚠ 18 Win10 endpoints reach EOL October 2025 — refresh required pre-close or within 90-day plan.
            </p>
          </div>
        </div>
      </div>

      {/* ── Network Topology ─────────────────────────────────────────── */}
      <div className="rounded-lg border p-5">
        <SectionTitle>Network Infrastructure</SectionTitle>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              site: "Phoenix HQ (8,500 sqft)",
              isp: "Cox Fiber 500Mbps",
              failover: "Verizon 4G LTE (Meraki auto)",
              fw: "Meraki MX67",
              sw: "2× MS120-24P",
              ap: "4× MR36",
              ok: true,
            },
            {
              site: "Scottsdale (5,200 sqft)",
              isp: "Cox Business 300Mbps",
              failover: "None ⚠",
              fw: "Meraki MX67",
              sw: "1× MS120-24",
              ap: "2× MR36",
              ok: false,
            },
            {
              site: "Tempe IOP (4,800 sqft)",
              isp: "CenturyLink Fiber 300Mbps",
              failover: "None ⚠",
              fw: "Meraki MX67",
              sw: "1× MS120-8",
              ap: "2× MR36",
              ok: false,
            },
          ].map((s) => (
            <div
              key={s.site}
              className={`rounded border p-3 space-y-1 ${s.ok ? "border-emerald-200 bg-emerald-50/30" : "border-amber-200 bg-amber-50/30"}`}
            >
              <div className="text-xs font-bold text-slate-700">{s.site}</div>
              <div className="text-xs text-slate-600">📶 {s.isp}</div>
              <div className={`text-xs ${s.ok ? "text-emerald-700" : "text-amber-700"}`}>
                ⚡ Failover: {s.failover}
              </div>
              <div className="text-xs text-slate-500">
                FW: {s.fw} · SW: {s.sw} · AP: {s.ap}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          All sites managed via Cisco Meraki cloud dashboard. IDS/IPS, content filter, and application control active at all sites. No site-to-site VPN — all applications are cloud/SaaS.
        </p>
      </div>

      {/* ── IT Spend Breakdown ───────────────────────────────────────── */}
      <div className="rounded-lg border p-5">
        <SectionTitle>Annual IT Spend Breakdown (~$118k/yr)</SectionTitle>
        <div className="space-y-2">
          {[
            { label: "CloudTech MSP retainer", amount: 38400, pct: 32.5 },
            { label: "Microsoft 365 Business Std (52 seats)", amount: 22000, pct: 18.6 },
            { label: "Chubb CyberEdge (cyber insurance)", amount: 18000, pct: 15.3 },
            { label: "TherapyNotes EHR", amount: 18000, pct: 15.3 },
            { label: "Zoom for Healthcare", amount: 8400, pct: 7.1 },
            { label: "RingCentral VoIP (45 lines)", amount: 9600, pct: 8.1 },
            { label: "Relias HIPAA Training", amount: 4200, pct: 3.6 },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <div className="w-40 shrink-0 text-xs text-slate-600">{item.label}</div>
              <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${item.pct}%`, background: BRAND }}
                />
              </div>
              <div className="w-16 text-right text-xs font-mono font-semibold text-slate-700">
                ${item.amount.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Risks & Opportunities ────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <SectionTitle>Risk Flags</SectionTitle>
          <RiskFlag level="critical" text="No SIEM — no 24/7 security monitoring. HIPAA technical safeguard gap." />
          <RiskFlag level="critical" text="ChatGPT/AI use by clinical staff without policy — potential PHI in public AI." />
          <RiskFlag level="critical" text="PHI found in SharePoint (policy violation) — unauthorized disclosure risk." />
          <RiskFlag level="high" text="Shared front-desk accounts violate HIPAA access control requirements." />
          <RiskFlag level="high" text="No penetration test ever conducted — HIPAA periodic technical evaluation required." />
          <RiskFlag level="high" text="18 Windows 10 endpoints at EOL October 2025 — security patching ends." />
          <RiskFlag level="medium" text="Scottsdale and Tempe have no ISP failover — telehealth session risk." />
        </div>
        <div className="space-y-2">
          <SectionTitle>Green Flags</SectionTitle>
          <GreenFlag text="Cloud-first, no on-prem servers — clean architecture, easy integration." />
          <GreenFlag text="Meraki across all 3 sites — unified management, cloud-managed, scalable." />
          <GreenFlag text="Entra ID with Conditional Access + Intune — modern zero-trust foundation." />
          <GreenFlag text="TherapyNotes is modern SaaS EHR with HIPAA BAA and solid API ecosystem." />
          <GreenFlag text="Zoom for Healthcare telehealth already deployed — 30% of sessions are virtual." />
          <GreenFlag text="Veeam for M365 backup — mailbox and SharePoint protected to Azure." />
          <GreenFlag text="Cyber insurance current — $3M Chubb CyberEdge with HIPAA endorsement." />
        </div>
      </div>

      {/* ── 100-Day IT Plan ─────────────────────────────────────────── */}
      <div className="rounded-lg border bg-slate-50 p-5">
        <SectionTitle>IT 100-Day Remediation Plan</SectionTitle>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              phase: "Days 0–30",
              color: "#ef4444",
              items: [
                "Deploy AI acceptable-use policy and clinician communication",
                "Remove PHI from SharePoint; enforce TherapyNotes-only policy",
                "Eliminate shared front-desk accounts; assign individual credentials",
                "Engage healthcare IT consultant for independent HIPAA SRA",
              ],
            },
            {
              phase: "Days 30–60",
              color: "#f97316",
              items: [
                "Commission external penetration test",
                "Deploy SIEM / MDR solution (Microsoft Sentinel or Defender XDR)",
                "Document and schedule DR runbook test",
                "Add ISP failover at Scottsdale and Tempe",
              ],
            },
            {
              phase: "Days 60–90",
              color: BRAND,
              items: [
                "Complete Windows 10 → 11 refresh (18 endpoints)",
                "Extend MFA policy to all 1099 contractors in clinical systems",
                "Deploy vulnerability scanning (Qualys or Defender EASM)",
                "Ensure Spruce Health BAA countersigned; resolve PaySimple BAA",
              ],
            },
          ].map((phase) => (
            <div key={phase.phase} className="space-y-2">
              <div
                className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded text-white"
                style={{ background: phase.color }}
              >
                {phase.phase}
              </div>
              <ul className="space-y-1">
                {phase.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-xs text-slate-700">
                    <span className="text-slate-400 shrink-0">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
