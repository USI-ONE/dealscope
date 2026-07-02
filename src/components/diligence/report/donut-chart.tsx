type Segment = { label: string; pct: number; color: string };

export function DonutChart({
  segments,
  size = 140,
  strokeWidth = 24,
  centerLabel,
}: {
  segments: Segment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  let prevPct = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#f1f5f9"
        strokeWidth={strokeWidth}
      />
      {segments.map((seg, i) => {
        const segArc = (seg.pct / 100) * circumference;
        const prevArc = (prevPct / 100) * circumference;
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            strokeDasharray={`${segArc} ${circumference - segArc}`}
            strokeDashoffset={circumference - prevArc}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        prevPct += seg.pct;
        return el;
      })}
      {centerLabel && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.14}
          fontWeight="700"
          fill="#0f172a"
        >
          {centerLabel}
        </text>
      )}
    </svg>
  );
}

export function DonutLegend({ segments }: { segments: Segment[] }) {
  return (
    <ul className="space-y-1.5">
      {segments.map((s) => (
        <li key={s.label} className="flex items-center gap-2 text-sm">
          <span
            className="inline-block size-3 rounded-sm shrink-0"
            style={{ background: s.color }}
          />
          <span className="text-muted-foreground">{s.label}</span>
          <span className="ml-auto tabular-nums font-medium">{s.pct}%</span>
        </li>
      ))}
    </ul>
  );
}
