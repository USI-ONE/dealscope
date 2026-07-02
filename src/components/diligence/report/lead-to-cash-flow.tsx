const BRAND = "#458C5E";
const TEAL = "#3B697A";
const WARN = "#f97316";

type FlowNode = {
  id: string;
  label: string;
  sublabel?: string;
  system?: string;
  color?: string;
  flag?: "warn" | "risk";
};

const NODES: FlowNode[] = [
  {
    id: "referral",
    label: "Patient Referral",
    sublabel: "PCP, psychiatrist, EAP,\nPsychology Today, website",
    color: BRAND,
  },
  {
    id: "inquiry",
    label: "Intake Inquiry",
    sublabel: "Phone / website form",
    system: "RingCentral + manual",
  },
  {
    id: "schedule",
    label: "Insurance Verification",
    sublabel: "Real-time eligibility check",
    system: "Availity",
  },
  {
    id: "consent",
    label: "Consent & Intake",
    sublabel: "Consent forms signed",
    system: "DocuSign",
  },
  {
    id: "session",
    label: "Session Rendered",
    sublabel: "Individual, group, or IOP\n(in-person or telehealth)",
    system: "Zoom for Healthcare",
    color: TEAL,
  },
  {
    id: "note",
    label: "Clinical Note",
    sublabel: "Must be signed ≤24hr\n14% exceed target ⚠",
    system: "TherapyNotes",
    flag: "warn",
  },
  {
    id: "claim",
    label: "Claim Generation",
    sublabel: "837P auto-generated\nday of service",
    system: "TherapyNotes",
    color: BRAND,
  },
  {
    id: "clearinghouse",
    label: "Clearinghouse",
    sublabel: "Claim scrubbing\n& payer routing",
    system: "Availity",
  },
  {
    id: "payer",
    label: "Payer Processing",
    sublabel: "BCBS, Aetna, UHC,\nAHCCCS (15–30 days)",
  },
  {
    id: "era",
    label: "ERA Receipt",
    sublabel: "835 electronic\nremittance advice",
    system: "Availity → TherapyNotes",
  },
  {
    id: "reconcile",
    label: "Reconciliation",
    sublabel: "Python script ⚠\nNo documentation",
    system: "Custom script → QuickBooks",
    flag: "risk",
  },
  {
    id: "payment",
    label: "Payment Posted",
    sublabel: "Insurance EFT direct\nto Wells Fargo",
    color: BRAND,
  },
  {
    id: "patient_ar",
    label: "Patient AR",
    sublabel: "30/60/90 day statements\nPaySimple (card / ACH)",
    system: "PaySimple",
    flag: "warn",
  },
  {
    id: "collections",
    label: "Collections",
    sublabel: "90+ day: Progressive\nManagement Systems",
    color: WARN,
  },
];

const BOX_W = 120;
const BOX_H = 72;
const GAP_X = 36;
const GAP_Y = 28;
const COLS = 4;

function getPos(idx: number) {
  const col = idx % COLS;
  const row = Math.floor(idx / COLS);
  const x = col * (BOX_W + GAP_X);
  const y = row * (BOX_H + GAP_Y);
  return { x, y };
}

const TOTAL_ROWS = Math.ceil(NODES.length / COLS);
const SVG_W = COLS * (BOX_W + GAP_X) - GAP_X;
const SVG_H = TOTAL_ROWS * (BOX_H + GAP_Y) - GAP_Y + 16;

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const midX = (x1 + x2) / 2;
  const path = `M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}`;
  return (
    <g>
      <path d={path} fill="none" stroke="#cbd5e1" strokeWidth={1.5} />
      <polygon
        points={`${x2},${y2} ${x2 - 5},${y2 - 4} ${x2 - 5},${y2 + 4}`}
        fill="#cbd5e1"
      />
    </g>
  );
}

function DownArrow({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y + GAP_Y} stroke="#cbd5e1" strokeWidth={1.5} />
      <polygon
        points={`${x},${y + GAP_Y} ${x - 4},${y + GAP_Y - 6} ${x + 4},${y + GAP_Y - 6}`}
        fill="#cbd5e1"
      />
    </g>
  );
}

export function LeadToCashFlow() {
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width={SVG_W}
        height={SVG_H}
        className="w-full"
        style={{ minWidth: 560 }}
      >
        {/* Arrows */}
        {NODES.map((node, idx) => {
          const pos = getPos(idx);
          const nextIdx = idx + 1;
          if (nextIdx >= NODES.length) return null;

          const nextPos = getPos(nextIdx);
          const currRow = Math.floor(idx / COLS);
          const nextRow = Math.floor(nextIdx / COLS);
          const isLastInRow = (idx + 1) % COLS === 0;

          if (!isLastInRow) {
            // Right arrow within same row
            return (
              <Arrow
                key={`arr-${idx}`}
                x1={pos.x + BOX_W}
                y1={pos.y + BOX_H / 2}
                x2={nextPos.x}
                y2={nextPos.y + BOX_H / 2}
              />
            );
          } else if (currRow !== nextRow) {
            // Down arrow at end of row, then connects to start of next row
            return (
              <g key={`arr-${idx}`}>
                {/* Down from last item in row to next row */}
                <line
                  x1={pos.x + BOX_W / 2}
                  y1={pos.y + BOX_H}
                  x2={nextPos.x + BOX_W / 2}
                  y2={nextPos.y}
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <polygon
                  points={`${nextPos.x + BOX_W / 2},${nextPos.y} ${nextPos.x + BOX_W / 2 - 4},${nextPos.y - 6} ${nextPos.x + BOX_W / 2 + 4},${nextPos.y - 6}`}
                  fill="#cbd5e1"
                />
              </g>
            );
          }
          return null;
        })}

        {/* Boxes */}
        {NODES.map((node, idx) => {
          const { x, y } = getPos(idx);
          const boxColor = node.color ?? "#f8fafc";
          const isColored = !!node.color;
          const isFlagWarn = node.flag === "warn";
          const isFlagRisk = node.flag === "risk";
          const borderColor = isFlagRisk ? "#f43f5e" : isFlagWarn ? "#f59e0b" : isColored ? boxColor : "#e2e8f0";

          return (
            <g key={node.id}>
              <rect
                x={x}
                y={y}
                width={BOX_W}
                height={BOX_H}
                rx={8}
                fill={isColored ? boxColor : "#ffffff"}
                stroke={borderColor}
                strokeWidth={isColored || isFlagRisk || isFlagWarn ? 1.5 : 1}
              />
              {/* Flag indicator strip */}
              {(isFlagRisk || isFlagWarn) && (
                <rect
                  x={x + BOX_W - 6}
                  y={y}
                  width={6}
                  height={BOX_H}
                  rx={8}
                  fill={isFlagRisk ? "#fecaca" : "#fef3c7"}
                />
              )}
              {/* Label */}
              <text
                x={x + BOX_W / 2}
                y={y + 18}
                textAnchor="middle"
                fontSize={10.5}
                fontWeight="700"
                fill={isColored ? "#ffffff" : "#1e293b"}
              >
                {node.label}
              </text>
              {/* Sublabel (multi-line) */}
              {(node.sublabel ?? "").split("\n").map((line, li) => (
                <text
                  key={li}
                  x={x + BOX_W / 2}
                  y={y + 30 + li * 12}
                  textAnchor="middle"
                  fontSize={8.5}
                  fill={isColored ? "rgba(255,255,255,0.8)" : "#64748b"}
                >
                  {line}
                </text>
              ))}
              {/* System badge */}
              {node.system && (
                <text
                  x={x + BOX_W / 2}
                  y={y + BOX_H - 6}
                  textAnchor="middle"
                  fontSize={7.5}
                  fontWeight="600"
                  fill={isColored ? "rgba(255,255,255,0.7)" : TEAL}
                >
                  {node.system}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded" style={{ background: BRAND }} />
          Key milestone
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded bg-white border border-amber-400" />
          Process gap / warning
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded bg-white border border-rose-400" />
          Critical risk
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded" style={{ background: WARN }} />
          Revenue leakage risk
        </div>
      </div>

      {/* Gap callouts */}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {[
          {
            title: "Insurance Verification Gap",
            body: "Verification not always completed before first appointment — creates retroactive denial risk and patient surprise billing exposure.",
            level: "warn",
          },
          {
            title: "Clinical Note Compliance",
            body: "14% of clinical notes are not signed within the 24-hour target — creates billing lag and HIPAA documentation risk.",
            level: "warn",
          },
          {
            title: "Reconciliation Script Risk",
            body: "Custom Python script written by CEO (David Park) with no documentation, no error handling, and no backup person. Single point of failure in billing reconciliation.",
            level: "risk",
          },
        ].map((c) => (
          <div
            key={c.title}
            className={`rounded border p-3 text-xs ${
              c.level === "risk"
                ? "border-rose-300 bg-rose-50 text-rose-800"
                : "border-amber-300 bg-amber-50 text-amber-800"
            }`}
          >
            <div className="font-bold mb-1">{c.title}</div>
            {c.body}
          </div>
        ))}
      </div>
    </div>
  );
}
