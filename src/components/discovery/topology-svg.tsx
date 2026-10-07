/**
 * Pure SVG rendering of a topology graph — no hooks, so it renders on the
 * server (report) and inside the interactive editor alike. Explicit hex
 * colors so a downloaded/printed SVG looks right outside the app theme.
 */
import type { TopologyGraph } from "@/db/schema/discovery";
import { layoutTopology, NODE_H, NODE_W } from "@/lib/discovery/topology-layout";

const TYPE_COLOR: Record<string, string> = {
  internet: "#64748b",
  cloud: "#64748b",
  modem: "#64748b",
  firewall: "#dc2626",
  router: "#ea580c",
  switch: "#2563eb",
  ap: "#7c3aed",
  server: "#0d9488",
  nas: "#0d9488",
  nvr: "#0d9488",
  workstation: "#475569",
  printer: "#475569",
  camera: "#be185d",
  phone: "#475569",
  iot: "#475569",
  other: "#475569",
};

const TYPE_LABEL: Record<string, string> = {
  internet: "INTERNET",
  cloud: "CLOUD",
  modem: "MODEM / ONT",
  firewall: "FIREWALL",
  router: "ROUTER",
  switch: "SWITCH",
  ap: "ACCESS POINT",
  server: "SERVER",
  nas: "NAS",
  nvr: "NVR",
  workstation: "WORKSTATION",
  printer: "PRINTER",
  camera: "CAMERA",
  phone: "PHONE",
  iot: "IOT",
  other: "DEVICE",
};

const MEDIA_STYLE: Record<string, { stroke: string; dash?: string; width: number }> = {
  fiber: { stroke: "#f59e0b", width: 3 },
  copper: { stroke: "#64748b", width: 2 },
  wireless: { stroke: "#7c3aed", dash: "6 5", width: 2 },
  vpn: { stroke: "#0891b2", dash: "2 4", width: 2 },
  unknown: { stroke: "#94a3b8", dash: "1 4", width: 2 },
};

function clip(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function TopologySvg({
  graph,
  selectedId,
  scale = 1,
  svgId,
  onSelect,
}: {
  graph: TopologyGraph;
  selectedId?: string | null;
  scale?: number;
  svgId?: string;
  onSelect?: (nodeId: string) => void;
}) {
  const { positions, width, height } = layoutTopology(graph);

  return (
    <svg
      id={svgId}
      xmlns="http://www.w3.org/2000/svg"
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      role="img"
      aria-label="Network topology diagram"
    >
      <rect width={width} height={height} fill="#ffffff" />
      {graph.links.map((l) => {
        const a = positions.get(l.from);
        const b = positions.get(l.to);
        if (!a || !b) return null;
        const style = MEDIA_STYLE[l.medium ?? "unknown"] ?? MEDIA_STYLE.unknown;
        const [top, bottom] = a.y <= b.y ? [a, b] : [b, a];
        const x1 = top.x + NODE_W / 2;
        const y1 = top.y + NODE_H;
        const x2 = bottom.x + NODE_W / 2;
        const y2 = bottom.y;
        const sameRow = a.y === b.y;
        const path = sameRow
          ? `M ${a.x + NODE_W / 2} ${a.y + NODE_H} C ${a.x + NODE_W / 2} ${a.y + NODE_H + 40}, ${b.x + NODE_W / 2} ${b.y + NODE_H + 40}, ${b.x + NODE_W / 2} ${b.y + NODE_H}`
          : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
        const tag = [l.speed, l.fromPort && l.toPort ? `${l.fromPort}↔${l.toPort}` : l.fromPort || l.toPort, l.label]
          .filter(Boolean)
          .join(" · ");
        return (
          <g key={l.id}>
            <path
              d={path}
              fill="none"
              stroke={style.stroke}
              strokeWidth={style.width}
              strokeDasharray={style.dash}
              opacity={l.confidence === "low" ? 0.55 : 1}
            />
            {tag && (
              <text
                x={(x1 + x2) / 2}
                y={sameRow ? a.y + NODE_H + 34 : (y1 + y2) / 2}
                textAnchor="middle"
                fontSize="10"
                fill="#334155"
                stroke="#ffffff"
                strokeWidth="3"
                paintOrder="stroke"
              >
                {clip(tag, 34)}
              </text>
            )}
          </g>
        );
      })}
      {graph.nodes.map((n) => {
        const p = positions.get(n.id);
        if (!p) return null;
        const color = TYPE_COLOR[n.type] ?? TYPE_COLOR.other;
        const selected = n.id === selectedId;
        const sub = [n.ip, [n.make, n.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
        return (
          <g
            key={n.id}
            transform={`translate(${p.x} ${p.y})`}
            onClick={onSelect ? () => onSelect(n.id) : undefined}
            style={onSelect ? { cursor: "pointer" } : undefined}
          >
            <rect
              width={NODE_W}
              height={NODE_H}
              rx="10"
              fill="#ffffff"
              stroke={selected ? "#0f172a" : n.confidence === "low" ? "#ef4444" : color}
              strokeWidth={selected ? 3 : 2}
              strokeDasharray={n.confidence === "low" && !selected ? "5 3" : undefined}
            />
            <rect width="6" height={NODE_H} rx="3" fill={color} />
            <text x="14" y="16" fontSize="9" fontWeight="700" fill={color} letterSpacing="0.5">
              {TYPE_LABEL[n.type] ?? "DEVICE"}
              {n.recordId ? " ✓" : ""}
            </text>
            <text x="14" y="33" fontSize="13" fontWeight="600" fill="#0f172a">
              {clip(n.label, 20)}
            </text>
            <text x="14" y="48" fontSize="10" fill="#475569">
              {clip(sub || n.location, 26)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
