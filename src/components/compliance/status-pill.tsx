/**
 * Tone helpers for compliance / assessment statuses.
 */
import { Badge } from "@/components/ui/badge";

export const STATUS_LABEL: Record<string, string> = {
  compliant: "Compliant",
  partial: "Partial",
  non_compliant: "Non-compliant",
  not_applicable: "N/A",
  unknown: "Unknown",
};

const STATUS_TONE: Record<string, string> = {
  compliant: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  partial: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  non_compliant: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  not_applicable: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  unknown: "bg-muted text-muted-foreground",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase tracking-wider ${STATUS_TONE[status] ?? ""}`}
    >
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  internal: "Internal",
  cis_v8: "CIS Controls v8",
  nist_csf_2: "NIST CSF 2.0",
  iso_27001: "ISO 27001",
  soc2: "SOC 2",
  hipaa: "HIPAA",
  pci_dss: "PCI-DSS",
  cyber_insurance: "Cyber insurance",
  industry_specific: "Industry-specific",
  custom: "Custom",
};

export function SourceLabel({ source }: { source: string }) {
  return (
    <span className="text-xs text-muted-foreground">
      {SOURCE_LABEL[source] ?? source}
    </span>
  );
}
