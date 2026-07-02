/**
 * Per-device risk classifier — "can this device be kept patched + secure?"
 *
 * Combines several Syncro + TechOS signals into a list of human-readable
 * risk flags with severities. Rendered on the client page so an MSP can
 * see at a glance which endpoints are dragging the fleet down.
 *
 * Severities:
 *   critical — actively un-patchable today (EOL OS, can't reach Win 11)
 *   warning  — operationally elevated risk (no MDM, no Entra, out of
 *              warranty, marked EOL in TechOS)
 *   info     — situational signal worth knowing (stale heartbeat)
 */

export type RiskSeverity = "critical" | "warning" | "info";

export type RiskFlag = {
  severity: RiskSeverity;
  /** Short stable code so callers can filter / group. */
  code: string;
  /** Short label shown as a badge. */
  label: string;
  /** Longer explanation shown on hover or in details. */
  detail?: string;
};

/** The slice of a hardware row we read. Kept minimal so callers can
 *  pass any object with these properties (live hardware row from drizzle,
 *  or a smaller projection). */
export type HardwareForRisk = {
  status: string;
  osName: string | null;
  osVersion: string | null;
  isEol: boolean;
  eolDate: string | null;
  warrantyEndsAt: string | null;
  lastSeenAt: Date | string | null;
  windows11Readiness?: string | null;
  intuneEnrolled?: string | null;
  entraJoined?: string | null;
  notOnContract?: string | null;
};

/** How many days without a heartbeat before we surface "stale" as a flag. */
const STALE_DAYS = 60;

const isYes = (v: string | null | undefined) =>
  !!v && /^(yes|true|1|running)$/i.test(v.trim());
const isNo = (v: string | null | undefined) =>
  !!v && /^(no|false|0|not running)$/i.test(v.trim());

/**
 * Classify a hardware row. Returns an empty array when the device is
 * healthy. Order is severity desc → critical first.
 */
export function classifyDeviceRisk(h: HardwareForRisk): RiskFlag[] {
  // Skip retired / spare / lost devices — they don't bill, don't operate,
  // and don't need patch tracking.
  if (h.status !== "active") return [];
  // "Not on Contract" devices stay visible in TechOS but we don't bill or
  // patch-manage them — skip from the risk view too.
  if (h.notOnContract === "1") return [];

  const flags: RiskFlag[] = [];
  const osName = (h.osName ?? "").toLowerCase();
  const osVer = (h.osVersion ?? "").toLowerCase();
  const osDisplay = `${h.osName ?? ""} ${h.osVersion ?? ""}`.trim() || null;

  /* ---------- OS / patchability ---------- */
  // Windows 10 — mainstream support ended 2025-10-14. Without ESU these
  // devices stop receiving security updates.
  if (
    osName.includes("windows 10") ||
    (osName.startsWith("windows") && osVer.startsWith("10"))
  ) {
    flags.push({
      severity: "critical",
      code: "win10_eol",
      label: "Windows 10 (EOL)",
      detail:
        "Mainstream support ended 2025-10-14. No security updates without ESU.",
    });
  }
  // Older Windows desktop builds — no updates at all.
  if (osName.includes("windows 8") || osName.includes("windows 7")) {
    flags.push({
      severity: "critical",
      code: "old_windows",
      label: `${osDisplay ?? "Old Windows"} (EOL)`,
      detail: "No security updates from Microsoft.",
    });
  }
  // Aging Windows Server builds.
  if (
    osName.includes("server 2008") ||
    osName.includes("server 2012") ||
    osName.includes("server 2003")
  ) {
    flags.push({
      severity: "critical",
      code: "old_server",
      label: `${osDisplay ?? "Old Windows Server"} (EOL)`,
      detail: "No security updates from Microsoft.",
    });
  }
  // macOS — anything pre-Ventura is out of support. We rely on the OS
  // name string Syncro gives us; loose match.
  if (osName.includes("macos") || osName.includes("mac os")) {
    const macMatch = osName.match(/(?:macos|mac os x?)\s*(\d+)/);
    const major = macMatch ? Number(macMatch[1]) : null;
    if (major !== null && major < 13) {
      flags.push({
        severity: "critical",
        code: "old_macos",
        label: `${osDisplay ?? "Old macOS"} (EOL)`,
        detail: "Apple only patches the latest three macOS major versions.",
      });
    }
  }

  /* ---------- Windows 11 readiness ---------- */
  const w11 = (h.windows11Readiness ?? "").trim();
  if (/^failed/i.test(w11)) {
    flags.push({
      severity: "critical",
      code: "win11_not_ready",
      label: "Win 11 not ready",
      detail: w11,
    });
  }

  /* ---------- Explicit lifecycle flags ---------- */
  if (h.isEol) {
    flags.push({
      severity: "warning",
      code: "marked_eol",
      label: "Marked end-of-life",
      detail: h.eolDate ? `EOL date: ${h.eolDate}` : undefined,
    });
  }
  if (h.warrantyEndsAt) {
    const w = new Date(h.warrantyEndsAt);
    if (!Number.isNaN(w.getTime()) && w.getTime() < Date.now()) {
      flags.push({
        severity: "warning",
        code: "out_of_warranty",
        label: "Out of warranty",
        detail: `Warranty ended ${h.warrantyEndsAt}`,
      });
    }
  }

  /* ---------- Management posture ---------- */
  // Only flag explicit "No" — if Syncro hasn't reported a value we don't
  // know, and adding a warning when the data is missing would create noise.
  if (isNo(h.intuneEnrolled)) {
    flags.push({
      severity: "warning",
      code: "not_intune",
      label: "Not in Intune",
      detail: "No centralized patch policy. Updates rely on user behaviour.",
    });
  }
  if (isNo(h.entraJoined)) {
    flags.push({
      severity: "warning",
      code: "not_entra",
      label: "Not Entra-joined",
      detail:
        "Can't enforce conditional access, compliance, or device-based MFA.",
    });
  }

  /* ---------- Stale heartbeat ---------- */
  if (h.lastSeenAt) {
    const ts = new Date(h.lastSeenAt).getTime();
    if (!Number.isNaN(ts)) {
      const days = Math.floor((Date.now() - ts) / 86_400_000);
      if (days >= STALE_DAYS) {
        flags.push({
          severity: "info",
          code: "stale_heartbeat",
          label: `Not seen in ${days}d`,
          detail: "Powered off, off-network, or retired but still active.",
        });
      }
    }
  }

  // Sort: critical first, then warning, then info — alphabetical inside.
  const order: Record<RiskSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  flags.sort(
    (a, b) =>
      order[a.severity] - order[b.severity] || a.label.localeCompare(b.label),
  );

  // Suppress isYes-false-positive: when w11 says Failed, the OS being
  // Windows 10 is implied. We keep both because they signal different
  // remediation paths (refresh hardware vs. apply ESU).
  void isYes;

  return flags;
}

/** Aggregate counts for a list of devices. */
export function summariseRisk(flagsByDevice: RiskFlag[][]): {
  critical: number;
  warning: number;
  info: number;
  atRiskDeviceCount: number;
  totalActiveDevices: number;
} {
  let critical = 0;
  let warning = 0;
  let info = 0;
  let atRisk = 0;
  for (const flags of flagsByDevice) {
    if (flags.length > 0) atRisk++;
    // Per-device, count only the HIGHEST severity (so a device with 1
    // critical + 2 warnings shows as 1 critical, not 1 critical + 2 warning).
    if (flags.some((f) => f.severity === "critical")) {
      critical++;
    } else if (flags.some((f) => f.severity === "warning")) {
      warning++;
    } else if (flags.some((f) => f.severity === "info")) {
      info++;
    }
  }
  return {
    critical,
    warning,
    info,
    atRiskDeviceCount: atRisk,
    totalActiveDevices: flagsByDevice.length,
  };
}
