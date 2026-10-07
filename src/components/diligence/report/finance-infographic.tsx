import { DonutChart, DonutLegend } from "./donut-chart";

const BRAND = "#458C5E";
const TEAL = "#3B697A";

const PAYER_SEGMENTS = [
  { label: "BCBS of AZ", pct: 38, color: BRAND },
  { label: "Aetna", pct: 22, color: TEAL },
  { label: "UnitedHealthcare", pct: 18, color: "#0EA5E9" },
  { label: "AHCCCS (Medicaid)", pct: 15, color: "#8B5CF6" },
  { label: "Self-Pay", pct: 7, color: "#94A3B8" },
];

const REVENUE_BARS = [
  { label: "FY2021", value: 9.8 },
  { label: "FY2022", value: 11.2 },
  { label: "FY2023", value: 12.1 },
  { label: "TTM", value: 12.8 },
];

function BarChart() {
  const max = 13;
  const svgH = 130;
  const barW = 42;
  const gap = 18;
  const svgW = REVENUE_BARS.length * (barW + gap) + gap;

  return (
    <svg width={svgW} height={svgH + 36} viewBox={`0 0 ${svgW} ${svgH + 36}`}>
      {REVENUE_BARS.map((d, i) => {
        const h = (d.value / max) * svgH;
        const x = gap + i * (barW + gap);
        const y = svgH - h;
        const isCurrent = d.label === "TTM";
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              fill={isCurrent ? BRAND : "#d1fae5"}
              rx={4}
            />
            <text
              x={x + barW / 2}
              y={svgH + 14}
              textAnchor="middle"
              fontSize={11}
              fill="#64748b"
            >
              {d.label}
            </text>
            <text
              x={x + barW / 2}
              y={y - 5}
              textAnchor="middle"
              fontSize={10.5}
              fontWeight="600"
              fill={isCurrent ? BRAND : "#334155"}
            >
              ${d.value}M
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-0.5"
      style={{ background: accent ? `linear-gradient(135deg, ${BRAND}, ${TEAL})` : undefined }}
    >
      <span
        className="text-2xl font-bold tabular-nums"
        style={{ color: accent ? "#fff" : BRAND }}
      >
        {value}
      </span>
      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: accent ? "rgba(255,255,255,0.75)" : "#64748b" }}
      >
        {label}
      </span>
      {sub && (
        <span
          className="text-xs"
          style={{ color: accent ? "rgba(255,255,255,0.65)" : "#94a3b8" }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function RiskFlag({
  text,
  level,
}: {
  text: string;
  level: "critical" | "high" | "medium";
}) {
  const colors: Record<string, string> = {
    critical: "bg-rose-50 border-rose-300 text-rose-800",
    high: "bg-orange-50 border-orange-300 text-orange-800",
    medium: "bg-amber-50 border-amber-300 text-amber-800",
  };
  return (
    <div className={`rounded border px-3 py-2 text-xs ${colors[level]}`}>
      {text}
    </div>
  );
}

function GreenFlag({ text }: { text: string }) {
  return (
    <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
      {text}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
      {children}
    </h3>
  );
}

export function FinanceInfographic({ company }: { company: string }) {
  return (
    <div className="space-y-8 text-slate-800">
      {/* ── Top KPIs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="TTM Revenue" value="$12.8M" accent />
        <Kpi label="Adj. EBITDA" value="$2.38M" sub="18.6% margin" />
        <Kpi label="Free Cash Flow" value="$1.82M" sub="TTM" />
        <Kpi label="Net Debt" value="$700k" sub="$2.1M debt, $1.4M cash" />
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* ── Revenue Trend ───────────────────────────────────────────── */}
        <div className="rounded-lg border p-5">
          <SectionTitle>Revenue Trend (CAGR 9.2%)</SectionTitle>
          <BarChart />
          <p className="mt-2 text-xs text-slate-500">
            Consistent fee-for-service growth driven by therapist headcount
            expansion and IOP program launch (Tempe, 2022).
          </p>
        </div>

        {/* ── Payer Mix ───────────────────────────────────────────────── */}
        <div className="rounded-lg border p-5">
          <SectionTitle>Payer Mix — TTM Revenue</SectionTitle>
          <div className="flex items-center gap-6">
            <DonutChart segments={PAYER_SEGMENTS} size={140} centerLabel="93%" />
            <DonutLegend segments={PAYER_SEGMENTS} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            BCBS of AZ at 38% is the largest single payer — and the contract sits
            in Dr. Santos' personal NPI, creating a change-of-control risk.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* ── AR & Billing Metrics ────────────────────────────────────── */}
        <div className="rounded-lg border p-5 space-y-3">
          <SectionTitle>Billing Metrics</SectionTitle>
          <div className="space-y-2">
            {[
              { label: "Days Sales Outstanding (DSO)", value: "52 days", warn: true },
              { label: "AR >90 Days", value: "8.4%", warn: true },
              { label: "Bad Debt Rate", value: "2.1%", warn: false },
              { label: "AP Days", value: "18 days", warn: false },
              { label: "Gross Margin", value: "52.3%", warn: false },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{m.label}</span>
                <span
                  className={`font-semibold tabular-nums ${m.warn ? "text-amber-600" : "text-emerald-700"}`}
                >
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Balance Sheet ───────────────────────────────────────────── */}
        <div className="rounded-lg border p-5 space-y-3">
          <SectionTitle>Balance Sheet Highlights</SectionTitle>
          <div className="space-y-2">
            {[
              { label: "Cash on Hand", value: "$1.4M" },
              { label: "Total Debt", value: "$2.1M" },
              { label: "Net Debt", value: "$700k" },
              { label: "Accrued PTO Liability", value: "$148k" },
              { label: "ROU Asset (3 leases)", value: "$2.1M" },
              { label: "NWC Target Peg", value: "~$1.85M" },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{m.label}</span>
                <span className="font-semibold tabular-nums">{m.value}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            SBA 7(a) at Prime+2.5% (≈11%), personally guaranteed by both founders.
          </p>
        </div>

        {/* ── Tax & Structure ─────────────────────────────────────────── */}
        <div className="rounded-lg border p-5 space-y-3">
          <SectionTitle>Tax &amp; Structure</SectionTitle>
          <div className="space-y-2 text-sm">
            {[
              ["Entity", "AZ LLC / Partnership"],
              ["Tax Status", "Pass-through"],
              ["NOLs", "None"],
              ["Last Review", "FY2023 (Heinfeld Meech)"],
              ["CapEx TTM", "$62k"],
              ["Auditor", "Review engagement (not audit)"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-2 max-sm:flex-wrap">
                <span className="text-slate-500 shrink-0">{k}</span>
                <span className="font-medium text-right">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Risks & Opportunities ──────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <SectionTitle>Risk Flags</SectionTitle>
          <RiskFlag
            level="critical"
            text="BCBS contract in Santos' personal NPI — not transferable on standard basis without re-credentialing (60–90 days)"
          />
          <RiskFlag
            level="high"
            text="DSO 52 days (vs. 45-day industry avg) — BCBS denial bucket driving 8.4% of AR over 90 days"
          />
          <RiskFlag
            level="high"
            text="No SoD: Billing Manager posts receipts and reconciles AR independently"
          />
          <RiskFlag
            level="medium"
            text="Audit type is a review engagement only — not a full audit; limited depth for reps & warranties"
          />
          <RiskFlag
            level="medium"
            text="Optum EAP contract auto-renews July 2024 — action needed within 60 days"
          />
        </div>
        <div className="space-y-2">
          <SectionTitle>Green Flags</SectionTitle>
          <GreenFlag text="9.2% CAGR over 3 years — consistent, defensible growth trajectory" />
          <GreenFlag text="FCF conversion 86.7% — very efficient capital model (no capex intensive operations)" />
          <GreenFlag text="$420k contracted session backlog + 85-patient waitlist — demonstrable demand" />
          <GreenFlag text="EBITDA margin improvements to 18.6% adjusted — before owner comp normalization" />
          <GreenFlag text="No NOLs, no open tax audits, clean compliance history" />
        </div>
      </div>

      {/* ── Owner Comp Adjustment ──────────────────────────────────────── */}
      <div className="rounded-lg border bg-slate-50 p-5">
        <SectionTitle>EBITDA Bridge — Reported to Adjusted</SectionTitle>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {[
            { label: "Reported EBITDA", value: "$2,100k", arrow: false },
            { label: "Owner Excess Comp (+)", value: "+$240k", arrow: true, green: true },
            { label: "M&A Fees (+)", value: "+$45k", arrow: true, green: true },
            { label: "Vehicle Allowances (+)", value: "+$28k", arrow: true, green: true },
            { label: "COVID Credits (−)", value: "−$35k", arrow: true, green: false },
            { label: "Adjusted EBITDA", value: "$2,378k", arrow: false, bold: true },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-1">
              {item.arrow && (
                <span className="text-slate-400">→</span>
              )}
              <div className="text-center">
                <div
                  className={`font-mono font-bold text-sm ${
                    item.bold
                      ? "text-emerald-700"
                      : item.green === true
                      ? "text-emerald-600"
                      : item.green === false
                      ? "text-rose-600"
                      : "text-slate-700"
                  }`}
                >
                  {item.value}
                </div>
                <div className="text-[10px] text-slate-500">{item.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
