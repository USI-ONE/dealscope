import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ChevronLeft, Printer } from "lucide-react";
import { db } from "@/db";
import { diligenceEngagements } from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { FinanceInfographic } from "@/components/diligence/report/finance-infographic";
import { ItInfographic } from "@/components/diligence/report/it-infographic";
import { LegalInfographic } from "@/components/diligence/report/legal-infographic";
import { HrInfographic } from "@/components/diligence/report/hr-infographic";
import { FacilitiesInfographic } from "@/components/diligence/report/facilities-infographic";
import { LeadToCashFlow } from "@/components/diligence/report/lead-to-cash-flow";

const TRACKS = ["it", "finance", "legal", "hr", "facilities", "ltc"] as const;
type Track = (typeof TRACKS)[number];

const TRACK_META: Record<Track, { label: string; description: string }> = {
  it: {
    label: "IT Infrastructure",
    description: "Technology stack, security posture, network architecture, and 100-day remediation plan.",
  },
  finance: {
    label: "Financial Overview",
    description: "Revenue trend, payer mix, EBITDA bridge, balance sheet, and key billing metrics.",
  },
  legal: {
    label: "Legal & Compliance",
    description: "Corporate structure, payer contract CoC matrix, HIPAA posture, IP, and litigation.",
  },
  hr: {
    label: "Human Resources",
    description: "Headcount, compensation, key person dependencies, 1099 classification risk, and culture.",
  },
  facilities: {
    label: "Facilities & Leases",
    description: "Site portfolio, lease runway, CapEx requirements, and environmental summary.",
  },
  ltc: {
    label: "Lead-to-Cash Process",
    description: "End-to-end revenue cycle flow from patient referral through collections — with gap analysis.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; track: string }>;
}) {
  const { track } = await params;
  const meta = TRACK_META[track as Track];
  return { title: meta ? `DealScope · ${meta.label} Report` : "DealScope · Report" };
}

export default async function TrackReportPage({
  params,
}: {
  params: Promise<{ id: string; track: string }>;
}) {
  const { id, track } = await params;

  if (!TRACKS.includes(track as Track)) notFound();

  const ctx = await requireContext();

  const engagement = await db.query.diligenceEngagements.findFirst({
    where: and(
      eq(diligenceEngagements.id, id),
      eq(diligenceEngagements.organizationId, ctx.organization.id),
    ),
  });
  if (!engagement) notFound();

  const meta = TRACK_META[track as Track];
  const allTracks = TRACKS.filter((t) => t !== (track as Track));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <Link
          href={`/diligence/${engagement.id}?tab=${track === "ltc" ? "summary" : track}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to engagement
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={undefined}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted print:hidden"
            /* Print via browser */
          >
            <Printer className="size-3.5" /> Print / PDF
          </button>
        </div>
      </div>

      {/* Cover header */}
      <div
        className="rounded-lg p-6 text-white print:rounded-none"
        style={{ background: "linear-gradient(135deg, #458C5E 0%, #3B697A 100%)" }}
      >
        <div className="text-xs font-semibold uppercase tracking-[0.25em] opacity-70">
          M&amp;A Diligence · {meta.label} Report
        </div>
        <h1 className="mt-1 text-2xl font-bold md:text-3xl">{engagement.targetCompanyName}</h1>
        {engagement.codename && (
          <p className="mt-0.5 text-sm opacity-70">{engagement.codename}</p>
        )}
        <p className="mt-2 text-sm opacity-80 max-w-2xl">{meta.description}</p>
      </div>

      {/* Jump to other tracks */}
      <div className="flex flex-wrap gap-2 print:hidden">
        <span className="text-xs text-muted-foreground py-1.5">Other reports:</span>
        {allTracks.map((t) => (
          <Link
            key={t}
            href={`/diligence/${engagement.id}/report/${t}`}
            className="rounded-full border px-3 py-1 text-xs hover:bg-muted transition-colors"
          >
            {TRACK_META[t].label}
          </Link>
        ))}
      </div>

      {/* Infographic body */}
      <div className="rounded-lg border p-6 md:p-8">
        {track === "it" && <ItInfographic />}
        {track === "finance" && <FinanceInfographic company={engagement.targetCompanyName} />}
        {track === "legal" && <LegalInfographic />}
        {track === "hr" && <HrInfographic />}
        {track === "facilities" && <FacilitiesInfographic />}
        {track === "ltc" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">Revenue Cycle: Patient Referral → Collections</h2>
              <p className="text-sm text-muted-foreground mt-1">
                End-to-end lead-to-cash workflow at Acme Behavioral Health Services, showing key systems, process gaps, and revenue leakage risks at each step.
              </p>
            </div>
            <LeadToCashFlow />
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground print:hidden">
        DealScope M&amp;A Intelligence · {engagement.targetCompanyName}
      </p>
    </div>
  );
}
