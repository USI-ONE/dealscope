import { AlertTriangle } from "lucide-react";
import { DonutChart, DonutLegend } from "./donut-chart";

const BRAND = "#458C5E";
const TEAL = "#3B697A";

const HEADCOUNT_SEGMENTS = [
  { label: "Clinical W-2 Therapists", pct: 42, color: BRAND },
  { label: "1099 Contract Therapists", pct: 42, color: "#94a3b8" },
  { label: "Admin / Front Desk", pct: 10, color: TEAL },
  { label: "Management / Finance", pct: 6, color: "#0ea5e9" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
      {children}
    </h3>
  );
}

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

function KeyPerson({ name, title, risk, note }: {
  name: string; title: string; risk: "critical" | "high" | "medium"; note: string;
}) {
  const ringColor =
    risk === "critical" ? "border-rose-400" : risk === "high" ? "border-orange-400" : "border-amber-400";
  const badgeColor =
    risk === "critical"
      ? "bg-rose-100 text-rose-700"
      : risk === "high"
      ? "bg-orange-100 text-orange-700"
      : "bg-amber-100 text-amber-700";
  return (
    <div className={`rounded-lg border-2 p-3 space-y-1 ${ringColor}`}>
      <div className="text-sm font-bold text-slate-800">{name}</div>
      <div className="text-xs text-slate-500">{title}</div>
      <div className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${badgeColor}`}>
        {risk} risk
      </div>
      <div className="text-xs text-slate-600 mt-1">{note}</div>
    </div>
  );
}

export function HrInfographic() {
  return (
    <div className="space-y-8 text-slate-800">
      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total Workforce" value="90" sub="52 W-2 + 38 1099" accent />
        <Kpi label="Annual Turnover" value="22%" sub="W-2 voluntary" />
        <Kpi label="Total Comp (W-2)" value="$7.95M" sub="incl. benefits ~$1.15M" />
        <Kpi label="Open Requisitions" value="6" sub="3 clinical = capacity constraint" />
      </div>

      {/* ── Headcount + Org ─────────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border p-5">
          <SectionTitle>Headcount Breakdown (90 total)</SectionTitle>
          <div className="flex items-center gap-6">
            <DonutChart segments={HEADCOUNT_SEGMENTS} size={130} strokeWidth={22} centerLabel="90" />
            <div className="flex-1">
              <DonutLegend segments={HEADCOUNT_SEGMENTS} />
              <div className="mt-4 space-y-1 text-xs text-slate-600">
                <div>Phoenix HQ: <span className="font-semibold">26</span></div>
                <div>Scottsdale: <span className="font-semibold">14</span></div>
                <div>Tempe: <span className="font-semibold">12</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-5">
          <SectionTitle>Compensation Overview</SectionTitle>
          <div className="space-y-3">
            {[
              { label: "W-2 Payroll (gross)", value: "$6.8M/yr", note: "" },
              { label: "1099 Contractor Payments", value: "~$3.1M/yr", note: "$65–85/session by license level" },
              { label: "Employer Benefits Cost", value: "$1.15M/yr", note: "UHC PPO, 401k, dental, life, STD" },
              { label: "Total Labor Cost", value: "~$11.0M/yr", note: "" },
              { label: "Founder Excess Comp", value: "$240k/yr", note: "Santos $310k vs $180k mkt; Park $290k vs $220k mkt" },
              { label: "401(k) Match", value: "50% of first 4%", note: "72% participation rate" },
              { label: "CEU Reimbursement", value: "$500/yr/clinician", note: "Key retention tool" },
            ].map((m) => (
              <div key={m.label} className="flex items-start justify-between gap-2 text-sm">
                <span className="text-slate-600 shrink-0">{m.label}</span>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{m.value}</div>
                  {m.note && <div className="text-[10px] text-slate-400">{m.note}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Key Person Risks ────────────────────────────────────────── */}
      <div className="rounded-lg border p-5">
        <SectionTitle>Key Person Dependency Map</SectionTitle>
        <div className="grid gap-3 md:grid-cols-3">
          <KeyPerson
            name="Dr. Maria Santos"
            title="Clinical Director & Co-Founder"
            risk="critical"
            note="Holds BCBS payer contract (personal NPI = $4.9M revenue). Credentialed supervisor for 3 unlicensed therapists. Clinical brand and staff recruiting anchor."
          />
          <KeyPerson
            name="Tanya Okafor"
            title="Billing Manager"
            risk="high"
            note="Sole expert on TherapyNotes ↔ Availity ↔ QuickBooks workflow. Below market ($52k vs. $68–75k). No documented backup."
          />
          <KeyPerson
            name="Rachel Kim"
            title="Director of Operations"
            risk="high"
            note="Operational continuity across 3 sites. Received external offer Q1 2024 (declined). Expressed compensation concerns — flight risk."
          />
          <KeyPerson
            name="David Park"
            title="CEO / Co-Founder"
            risk="high"
            note="Sole author of custom Python billing reconciliation script — no documentation, no backup. Transition agreement not yet executed."
          />
          <KeyPerson
            name="Dr. Priya Mehta"
            title="Lead Psychiatrist NP"
            risk="medium"
            note="Only psychiatrist on staff. Psychiatric revenue line ~$380k ARR. Losing her requires 90+ day search."
          />
          <div className="rounded-lg border-2 border-emerald-300 p-3 space-y-1">
            <div className="text-sm font-bold text-slate-800">Recommended Retention Pool</div>
            <div className="text-xs text-slate-500">Estimated budget to lock key managers</div>
            <div className="mt-2 space-y-1 text-xs">
              {[
                ["Rachel Kim", "$45k"],
                ["Tanya Okafor", "$30k"],
                ["Dr. Mehta", "$40k"],
                ["3 Senior LCSWs", "$20k each"],
              ].map(([name, amt]) => (
                <div key={name} className="flex justify-between">
                  <span className="text-slate-600">{name}</span>
                  <span className="font-semibold text-emerald-700">{amt}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1 font-bold">
                <span>Total</span>
                <span className="text-emerald-700">~$175k</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Classification Risk ─────────────────────────────────────── */}
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
        <SectionTitle>1099 Contractor Classification Risk</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-rose-800 mb-2">Risk Factors Present:</p>
            <ul className="space-y-1 text-xs text-rose-700">
              {[
                "38 therapists use company EHR (TherapyNotes) — company-furnished tool",
                "Work at company clinic locations — not independently established",
                "Cannot independently accept Acme-referred patients during engagement",
                "IRS 20-factor: 13/20 factors suggest employee relationship",
                "AZ ABC test: factor 2 (independently established trade) weakest",
                "Most 1099 therapists do NOT have independent private practices",
              ].map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-rose-400 shrink-0">•</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-rose-800 mb-2">Exposure Estimate:</p>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-rose-700">$180–280k</div>
              <div className="text-xs text-rose-600">Back payroll taxes + IRS penalties if reclassified</div>
              <div className="mt-3 space-y-1 text-xs text-rose-700">
                <div>+ Benefits liability if deemed employees</div>
                <div>+ AZ workers comp exposure</div>
                <div className="font-semibold">Recommended: independent employment counsel opinion pre-LOI</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Benefits + Culture ──────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border p-5">
          <SectionTitle>Benefits Summary</SectionTitle>
          <div className="space-y-2 text-sm">
            {[
              ["Medical", "UHC Choice Plus PPO — employer 80% (employee only)"],
              ["Dental", "Delta Dental — employer 60%"],
              ["Vision", "VSP — 100% employee-paid (voluntary)"],
              ["401(k)", "Fidelity — 50% match on first 4%, 3yr vesting"],
              ["Life / STD", "Guardian 1x salary, STD 60% / 13wk"],
              ["LTD", "Not offered — gap vs. market"],
              ["CEU", "$500/yr per clinician — strong retention tool"],
              ["Accrued PTO", "$148k on balance sheet — paid out on separation (AZ policy)"],
              ["Benefits Renewal", "UHC renews Oct 1 2024 — 9–14% increase expected"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start gap-2">
                <span className="w-20 text-slate-500 shrink-0 text-xs">{k}</span>
                <span className="text-xs text-slate-700">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-5">
          <SectionTitle>Culture &amp; Engagement</SectionTitle>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold" style={{ color: BRAND }}>+31</span>
              <div className="text-xs text-slate-600">
                <div className="font-semibold">eNPS Score</div>
                <div>Industry benchmark: +20 to +40</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold" style={{ color: BRAND }}>4.1</span>
              <div className="text-xs text-slate-600">
                <div className="font-semibold">Glassdoor Rating</div>
                <div>24 reviews — strong mission alignment</div>
              </div>
            </div>
            <div className="mt-2 space-y-1.5">
              <div className="text-xs font-semibold text-slate-600">Top Survey Concerns:</div>
              {[
                { item: "Compensation is fair", score: 2.8, max: 5 },
                { item: "Clear advancement paths", score: 3.1, max: 5 },
              ].map((s) => (
                <div key={s.item}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-slate-600">{s.item}</span>
                    <span className="font-semibold text-amber-600">{s.score}/5.0</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(s.score / s.max) * 100}%`, background: "#f59e0b" }}
                    />
                  </div>
                </div>
              ))}
              <div className="text-xs font-semibold text-slate-600 mt-2">Highest Score:</div>
              <div key="mission">
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-slate-600">I believe in the mission</span>
                  <span className="font-semibold text-emerald-700">4.7/5.0</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: "94%", background: BRAND }} />
                </div>
              </div>
            </div>
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              <AlertTriangle className="inline size-3 mr-1" />
              Below-market comp is likely driving 22% turnover. Recommend compensation benchmarking and market-rate adjustment plan post-close.
            </div>
          </div>
        </div>
      </div>

      {/* ── Risks & Opportunities ────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <SectionTitle>Risk Flags</SectionTitle>
          <RiskFlag level="critical" text="Dr. Santos holds BCBS payer contract in personal NPI — departure or unavailability triggers immediate revenue risk on $4.9M of contracts." />
          <RiskFlag level="high" text="1099 classification risk — $180–280k back-tax exposure if 38 contract therapists are reclassified as W-2." />
          <RiskFlag level="high" text="No retention equity, no change-of-control bonuses for any key managers." />
          <RiskFlag level="medium" text="Compensation below market (8–12% for therapists) — actively driving high turnover." />
          <RiskFlag level="medium" text="Founder transition agreements not yet executed — both Santos and Park terms TBD." />
        </div>
        <div className="space-y-2">
          <SectionTitle>Green Flags</SectionTitle>
          <GreenFlag text="Strong mission alignment (eNPS +31) — clinical staff engaged and purpose-driven." />
          <GreenFlag text="CEU reimbursement + clinical supervision for unlicensed staff = differentiated retention tool for therapist recruitment." />
          <GreenFlag text="Rippling HRIS + ADP payroll already integrated — post-close integration straightforward." />
          <GreenFlag text="No EEOC charges, no union activity, no wage/hour complaints in 5 years." />
          <GreenFlag text="Clear succession emerging for Operations (Rachel Kim as COO candidate)." />
        </div>
      </div>
    </div>
  );
}
