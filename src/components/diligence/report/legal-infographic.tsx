import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { DonutChart, DonutLegend } from "./donut-chart";

const BRAND = "#458C5E";
const TEAL = "#3B697A";

const EQUITY_SEGMENTS = [
  { label: "Dr. Maria Santos (via Santos Clinical PLLC)", pct: 60, color: BRAND },
  { label: "David Park", pct: 40, color: TEAL },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
      {children}
    </h3>
  );
}

function Flag({ level, text }: { level: "critical" | "high" | "medium" | "ok"; text: string }) {
  const styles: Record<string, string> = {
    critical: "border-rose-300 bg-rose-50 text-rose-800",
    high: "border-orange-300 bg-orange-50 text-orange-800",
    medium: "border-amber-300 bg-amber-50 text-amber-800",
    ok: "border-emerald-300 bg-emerald-50 text-emerald-800",
  };
  const icons: Record<string, React.ReactNode> = {
    critical: <AlertTriangle className="size-3.5 shrink-0" />,
    high: <AlertTriangle className="size-3.5 shrink-0" />,
    medium: <AlertTriangle className="size-3.5 shrink-0" />,
    ok: <CheckCircle className="size-3.5 shrink-0" />,
  };
  return (
    <div className={`rounded border px-3 py-2 text-xs flex items-start gap-2 ${styles[level]}`}>
      {icons[level]}
      {text}
    </div>
  );
}

function ContractRow({
  name,
  pct,
  term,
  cocRisk,
  note,
}: {
  name: string;
  pct?: number;
  term: string;
  cocRisk: "high" | "medium" | "low";
  note?: string;
}) {
  const riskColor =
    cocRisk === "high"
      ? "text-rose-600 bg-rose-50 border-rose-200"
      : cocRisk === "medium"
      ? "text-amber-600 bg-amber-50 border-amber-200"
      : "text-emerald-600 bg-emerald-50 border-emerald-200";
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3 text-sm font-medium">{name}</td>
      {pct !== undefined && (
        <td className="py-2 pr-3 text-sm tabular-nums font-semibold text-slate-700">{pct}%</td>
      )}
      <td className="py-2 pr-3 text-xs text-slate-600">{term}</td>
      <td className="py-2">
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${riskColor}`}>
          {cocRisk}
        </span>
      </td>
      {note && <td className="py-2 pl-3 text-xs text-slate-500">{note}</td>}
    </tr>
  );
}

export function LegalInfographic() {
  return (
    <div className="space-y-8 text-slate-800">
      {/* ── Entity + Ownership ───────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border p-5">
          <SectionTitle>Ownership Structure</SectionTitle>
          <div className="flex items-center gap-6">
            <DonutChart segments={EQUITY_SEGMENTS} size={130} strokeWidth={22} />
            <DonutLegend segments={EQUITY_SEGMENTS} />
          </div>
          <div className="mt-4 space-y-2 text-xs text-slate-600">
            <div>
              <span className="font-semibold">Entity:</span> Acme Behavioral Health Services, LLC (AZ)
            </div>
            <div>
              <span className="font-semibold">Structure:</span> Member-managed LLC · No board · Unanimous consent required for CoC
            </div>
            <div>
              <span className="font-semibold">Organized:</span> 2015 · Good standing
            </div>
            <div>
              <span className="font-semibold">Prior M&amp;A:</span> None
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-5">
          <SectionTitle>Key Deal Structural Flags</SectionTitle>
          <div className="space-y-2">
            <Flag level="critical" text="BCBS of AZ payer contract in Santos' personal NPI — not transferable without 60–90 day re-credentialing process. $4.9M revenue at risk during gap." />
            <Flag level="high" text="AHCCCS Medicaid provider agreement must be re-enrolled with ADHS within 30–45 days of close — $1.9M revenue exposure." />
            <Flag level="high" text="AZ Behavioral Health Entity License must be amended with ADHS post-close (45–60 days). Tempe IOP license also requires amendment." />
            <Flag level="high" text="3 leases require landlord CoC consent — Scottsdale and Tempe landlords are private individuals (rent increase / guarantee risk)." />
            <Flag level="medium" text="Operating agreement requires unanimous member consent for transfer — both Santos AND Park must cooperate to close." />
            <Flag level="ok" text="Aetna and UHC payer contracts are in the LLC name — transferable with standard notification." />
          </div>
        </div>
      </div>

      {/* ── Payer Contract Matrix ────────────────────────────────────── */}
      <div className="rounded-lg border p-5">
        <SectionTitle>Payer Contract Change-of-Control Matrix</SectionTitle>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[10px] uppercase tracking-wider text-slate-400">
              <th className="pb-2 pr-3">Payer</th>
              <th className="pb-2 pr-3">Rev %</th>
              <th className="pb-2 pr-3">Term / Renewal</th>
              <th className="pb-2">CoC Risk</th>
              <th className="pb-2 pl-3">Action Required</th>
            </tr>
          </thead>
          <tbody>
            <ContractRow name="BCBS of AZ" pct={38} term="Annual auto-renew (Santos NPI)" cocRisk="high" note="Begin re-credentialing to group NPI pre-close" />
            <ContractRow name="Aetna" pct={22} term="3yr · through Feb 2025" cocRisk="medium" note="Assignment with 30-day notice — low friction" />
            <ContractRow name="UnitedHealthcare" pct={18} term="2yr · through Nov 2024" cocRisk="medium" note="Renewal imminent — negotiate pre-close" />
            <ContractRow name="AHCCCS (Medicaid)" pct={15} term="State provider agreement" cocRisk="high" note="Re-enrollment required post-close — 30–45 days" />
            <ContractRow name="Optum EAP" pct={undefined} term="Renews July 2024" cocRisk="medium" note="Assignable 30-day notice — action within 60 days" />
          </tbody>
        </table>
      </div>

      {/* ── IP & Litigation ─────────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border p-5 space-y-4">
          <div>
            <SectionTitle>Intellectual Property</SectionTitle>
            <div className="space-y-2 text-xs">
              {[
                { label: "USPTO Trademark", status: "Pending", note: "ACME BEHAVIORAL HEALTH — Class 44 (filed 2023)", warn: false },
                { label: "AZ State Trademark", status: "Registered", note: "Logo not separately registered", warn: false },
                { label: "Domains", status: "3 registered", note: "acmebehavioral.com (primary) + 2 redirects (GoDaddy)", warn: false },
                { label: "Custom Python Script", status: "In-house", note: "No IP assignment agreement. No documentation. Key-person risk.", warn: true },
                { label: "Patents", status: "None", note: "", warn: false },
                { label: "IP Assignments", status: "Not executed", note: "Employees signed offer letters only — specific IP assignment gap", warn: true },
              ].map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-3 max-sm:flex-wrap">
                  <span className="text-slate-500 shrink-0 w-36">{item.label}</span>
                  <div className="text-right">
                    <span className={`font-semibold ${item.warn ? "text-amber-700" : "text-slate-700"}`}>
                      {item.status}
                    </span>
                    {item.note && <div className="text-[10px] text-slate-400">{item.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-5 space-y-4">
          <div>
            <SectionTitle>Litigation &amp; Regulatory</SectionTitle>
            <div className="space-y-2">
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="font-bold">AZ BHLE Board Complaint (Open)</div>
                <div className="mt-1">Filed May 2024 against a 1099 therapist — scope of practice concern. Board investigation ongoing. License not suspended. Monitor closely — could trigger BCBS credentialing review.</div>
              </div>
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="font-bold">HIPAA Privacy Demand Letter</div>
                <div className="mt-1">March 2024 — former patient alleges improper disclosure to employer. Counsel engaged; assessment: low exposure (release had valid authorization). No amount stated.</div>
              </div>
              <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800">
                <div className="font-bold">No OCR Investigations</div>
                <div className="mt-1">2022 phishing incident: OCR analysis confirmed no PHI accessed — no breach notification required. Documented.</div>
              </div>
              <div className="text-xs text-slate-500">
                Total litigation exposure estimate: <span className="font-semibold text-slate-700">$25–75k</span> (board complaint indemnification + privacy settlement). Not material.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── HIPAA & Privacy ─────────────────────────────────────────── */}
      <div className="rounded-lg border p-5">
        <SectionTitle>HIPAA &amp; Privacy Posture</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600 mb-1">BAA Coverage</div>
            {[
              { vendor: "TherapyNotes (EHR)", ok: true },
              { vendor: "Microsoft 365", ok: true },
              { vendor: "Zoom for Healthcare", ok: true },
              { vendor: "Availity (clearinghouse)", ok: true },
              { vendor: "Chubb (breach coach)", ok: true },
              { vendor: "Spruce Health", ok: false, note: "BAA exists but not countersigned" },
              { vendor: "PaySimple", ok: false, note: "BAA status unclear" },
              { vendor: "RingCentral", ok: false, note: "Used for clinical comms — BAA needed" },
            ].map((b) => (
              <div key={b.vendor} className="flex items-center gap-2 text-xs">
                {b.ok
                  ? <CheckCircle className="size-3.5 text-emerald-600 shrink-0" />
                  : <XCircle className="size-3.5 text-rose-500 shrink-0" />}
                <span className={b.ok ? "text-slate-700" : "text-rose-700 font-medium"}>
                  {b.vendor}
                </span>
                {b.note && <span className="text-slate-400">— {b.note}</span>}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600 mb-1">Open HIPAA Compliance Gaps</div>
            {[
              "1099 contractor MFA not enforced in corporate policy",
              "PHI found in SharePoint (TherapyNotes-only policy violated)",
              "Shared front-desk accounts prevent individual access audit trail",
              "No penetration test ever conducted",
              "No DR runbook (HIPAA contingency plan requirement)",
              "AI/ChatGPT use without policy — potential PHI in public AI",
              "HIPAA SRA last conducted internally (2023) — not independent",
              "Notice of Privacy Practices outdated — doesn't address telehealth or AI",
            ].map((gap, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-rose-700">
                <span className="text-rose-400 shrink-0 mt-0.5">✗</span>
                {gap}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
