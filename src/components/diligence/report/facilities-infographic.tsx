import { AlertTriangle, CheckCircle } from "lucide-react";

const BRAND = "#458C5E";
const TEAL = "#3B697A";

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

function LeaseCard({
  site,
  address,
  sqft,
  rent,
  expires,
  monthsOut,
  renewal,
  landlord,
  coc,
  condition,
  notes,
}: {
  site: string;
  address: string;
  sqft: number;
  rent: number;
  expires: string;
  monthsOut: number;
  renewal: string;
  landlord: string;
  coc: "high" | "medium" | "low";
  condition: "good" | "fair" | "poor";
  notes?: string;
}) {
  const urgency = monthsOut < 18 ? "border-rose-300 bg-rose-50/30" : monthsOut < 36 ? "border-amber-300 bg-amber-50/30" : "border-emerald-300 bg-emerald-50/30";
  const expiryBadge = monthsOut < 18 ? "bg-rose-100 text-rose-700" : monthsOut < 36 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
  const condColor = condition === "good" ? "text-emerald-700" : condition === "fair" ? "text-amber-600" : "text-rose-600";
  const cocColor = coc === "high" ? "text-rose-700 bg-rose-50 border-rose-200" : coc === "medium" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-emerald-700 bg-emerald-50 border-emerald-200";

  return (
    <div className={`rounded-lg border-2 p-4 space-y-3 ${urgency}`}>
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-bold text-slate-800">{site}</div>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${expiryBadge}`}>
            {monthsOut < 24 ? "⚠ " : ""}Expires {expires}
          </span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">{address}</div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <span className="text-slate-500">Size</span>
          <div className="font-semibold">{sqft.toLocaleString()} sq ft</div>
        </div>
        <div>
          <span className="text-slate-500">Annual Rent</span>
          <div className="font-semibold">${(rent / 1000).toFixed(0)}k/yr</div>
        </div>
        <div>
          <span className="text-slate-500">Renewal Option</span>
          <div className="font-semibold">{renewal}</div>
        </div>
        <div>
          <span className="text-slate-500">Landlord Type</span>
          <div className="font-semibold">{landlord}</div>
        </div>
      </div>

      <div className="flex gap-2">
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${cocColor}`}>
          CoC: {coc} risk
        </span>
        <span className={`text-[10px] font-semibold ${condColor}`}>
          Condition: {condition}
        </span>
      </div>

      {notes && (
        <p className="text-xs text-slate-600 border-t pt-2">{notes}</p>
      )}
    </div>
  );
}

function LeaseTimeline() {
  const sites = [
    { label: "Phoenix HQ", months: 28, color: BRAND },
    { label: "Tempe IOP", months: 14, color: TEAL },
    { label: "Scottsdale", months: 7, color: "#ef4444" },
  ];
  const maxMonths = 28;
  const svgW = 480;
  const rowH = 28;
  const labelW = 80;
  const barX = labelW + 16;
  const barMaxW = svgW - barX - 24;
  const now = 0;

  return (
    <svg width={svgW} height={sites.length * rowH + 32} viewBox={`0 0 ${svgW} ${sites.length * rowH + 32}`} className="w-full">
      {/* x-axis labels */}
      {[0, 6, 12, 18, 24, 30].filter(m => m <= maxMonths).map((m) => {
        const x = barX + (m / maxMonths) * barMaxW;
        return (
          <g key={m}>
            <line x1={x} y1={0} x2={x} y2={sites.length * rowH + 8} stroke="#e2e8f0" strokeWidth={1} />
            <text x={x} y={sites.length * rowH + 20} textAnchor="middle" fontSize={9} fill="#94a3b8">
              {m === 0 ? "Now" : `+${m}mo`}
            </text>
          </g>
        );
      })}

      {sites.map((s, i) => {
        const y = i * rowH + 6;
        const barW = (s.months / maxMonths) * barMaxW;
        return (
          <g key={s.label}>
            <text x={0} y={y + 12} fontSize={10} fill="#334155" fontWeight="500">{s.label}</text>
            <rect x={barX} y={y} width={barMaxW} height={16} rx={4} fill="#f1f5f9" />
            <rect x={barX} y={y} width={barW} height={16} rx={4} fill={s.color} opacity={0.85} />
            <text x={barX + barW - 4} y={y + 11} textAnchor="end" fontSize={9} fill="#fff" fontWeight="600">
              {s.months}mo
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function FacilitiesInfographic() {
  return (
    <div className="space-y-8 text-slate-800">
      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total Locations" value="3" sub="Phoenix, Scottsdale, Tempe" accent />
        <Kpi label="Total Sq Ft" value="18,500" sub="All leased" />
        <Kpi label="Annual Rent" value="$342k" sub="/yr across 3 sites" />
        <Kpi label="Landlord Consents" value="3 req'd" sub="CoC triggers all 3 leases" />
      </div>

      {/* ── Lease Cards ─────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Lease Portfolio</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          <LeaseCard
            site="Phoenix HQ"
            address="2240 N 16th St, Phoenix AZ 85006"
            sqft={8500}
            rent={168000}
            expires="2028"
            monthsOut={28}
            renewal="2 × 5yr at 103% of current"
            landlord="Prologis (institutional)"
            coc="low"
            condition="good"
            notes="Admin + billing + 12 therapy rooms + telepsychiatry suite. $85k renovation 2022. Mission-critical site."
          />
          <LeaseCard
            site="Scottsdale Clinic"
            address="8700 E Via de Ventura, Scottsdale AZ 85258"
            sqft={5200}
            rent={108000}
            expires="Jan 2026"
            monthsOut={7}
            renewal="1 × 3yr at market (90-day notice req'd)"
            landlord="Private individual"
            coc="high"
            condition="fair"
            notes="$9,000/mo base. Carpeting worn (est. $18k). HVAC is 12yr old (approaching EOL). Renewal notice window opens IMMEDIATELY."
          />
          <LeaseCard
            site="Tempe IOP"
            address="950 W Elliot Rd, Tempe AZ 85284"
            sqft={4800}
            rent={66000}
            expires="2027"
            monthsOut={14}
            renewal="1 × 3yr at market"
            landlord="Private individual"
            coc="medium"
            condition="good"
            notes="Houses the IOP program (high-margin). HVAC replaced 2023. IOP expansion planned Q1 2025 (+4 slots/day, +$280k ARR)."
          />
        </div>
      </div>

      {/* ── Lease Timeline ───────────────────────────────────────────── */}
      <div className="rounded-lg border p-5">
        <SectionTitle>Lease Runway — Months Remaining</SectionTitle>
        <LeaseTimeline />
        <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          <AlertTriangle className="inline size-3 mr-1" />
          Scottsdale expires in January 2026 (~7 months). The 90-day renewal notice must be sent by <strong>October 2025</strong> — before a typical close timeline. Recommend beginning landlord discussions immediately.
        </div>
      </div>

      {/* ── Site Conditions ─────────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border p-5">
          <SectionTitle>Physical Condition Assessment</SectionTitle>
          <div className="space-y-3">
            {[
              {
                site: "Phoenix HQ",
                items: [
                  { label: "HVAC", status: "good", note: "Replaced 2019" },
                  { label: "Electrical", status: "good", note: "No known issues" },
                  { label: "Security (card access)", status: "good", note: "HID access + Avigilon CCTV" },
                  { label: "ADA", status: "good", note: "Compliant — ground floor" },
                ],
              },
              {
                site: "Scottsdale",
                items: [
                  { label: "HVAC", status: "warn", note: "12yr old — approaching EOL ($25–35k)" },
                  { label: "Carpeting", status: "warn", note: "Worn in 4 therapy rooms ($18k)" },
                  { label: "Security", status: "warn", note: "Key fob only — no card access (HIPAA gap)" },
                  { label: "ADA", status: "good", note: "Compliant" },
                ],
              },
              {
                site: "Tempe IOP",
                items: [
                  { label: "HVAC", status: "good", note: "Replaced 2023" },
                  { label: "IOP expansion", status: "good", note: "$38k furniture/equip budgeted 2025" },
                  { label: "Security", status: "warn", note: "Alarm.com only — no card access (HIPAA gap)" },
                  { label: "ADA", status: "good", note: "Compliant" },
                ],
              },
            ].map((s) => (
              <div key={s.site}>
                <div className="text-xs font-bold text-slate-600 mb-1">{s.site}</div>
                <div className="grid grid-cols-2 gap-1">
                  {s.items.map((item) => (
                    <div key={item.label} className="flex items-start gap-1.5 text-xs">
                      {item.status === "good"
                        ? <CheckCircle className="size-3 text-emerald-600 shrink-0 mt-0.5" />
                        : <AlertTriangle className="size-3 text-amber-500 shrink-0 mt-0.5" />}
                      <div>
                        <span className="font-medium">{item.label}</span>
                        <div className="text-slate-400">{item.note}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-5">
            <SectionTitle>CapEx Requirements</SectionTitle>
            <div className="space-y-2 text-sm">
              {[
                { label: "Win10 endpoint refresh", est: "$32k", timing: "Pre-close / 90-day plan" },
                { label: "Tempe IOP expansion equip", est: "$38k", timing: "Q1 2025" },
                { label: "Scottsdale carpet replacement", est: "$18k", timing: "At lease renewal" },
                { label: "Scottsdale HVAC replacement", est: "$25–35k", timing: "12–18 months" },
                { label: "Scottsdale TI allowance", est: "$50k (negotiate)", timing: "Lease renewal" },
                { label: "Card access (Scottsdale + Tempe)", est: "$15–20k", timing: "90-day plan" },
              ].map((c) => (
                <div key={c.label} className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm">{c.label}</div>
                    <div className="text-[10px] text-slate-400">{c.timing}</div>
                  </div>
                  <div className="text-right shrink-0 font-semibold tabular-nums">{c.est}</div>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 font-bold">
                <span>Total (low estimate)</span>
                <span style={{ color: BRAND }}>~$178k</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-5">
            <SectionTitle>Environmental &amp; Compliance</SectionTitle>
            <div className="space-y-1.5 text-xs text-slate-700">
              <div className="flex gap-2"><CheckCircle className="size-3.5 text-emerald-600 shrink-0 mt-0.5" /> All buildings post-2000 — no asbestos or lead paint</div>
              <div className="flex gap-2"><CheckCircle className="size-3.5 text-emerald-600 shrink-0 mt-0.5" /> No USTs, no known contamination</div>
              <div className="flex gap-2"><CheckCircle className="size-3.5 text-emerald-600 shrink-0 mt-0.5" /> All 3 sites ADA compliant (ground floor)</div>
              <div className="flex gap-2"><CheckCircle className="size-3.5 text-emerald-600 shrink-0 mt-0.5" /> Zoning compliant for behavioral health use</div>
              <div className="flex gap-2"><AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" /> No Phase I ESA obtained (tenant only — recommend requesting landlord records)</div>
              <div className="flex gap-2"><AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" /> No formal facilities DR / alternate site plan</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
