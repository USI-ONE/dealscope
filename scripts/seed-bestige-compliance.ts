/**
 * One-off: seed Bestige's compliance state from the diligence engagement.
 *
 * - Applies USI Baseline + PE Baseline as Required to the Bestige client
 * - Pre-fills assessments for controls where the 56 diligence responses
 *   give clear evidence one way or the other. Anything genuinely
 *   uncertain is left out (so it shows as "Not assessed" in the
 *   consolidated gap view — better an honest gap than a fabricated
 *   compliant tick).
 *
 * Re-runnable: ON CONFLICT updates on the unique (client_id, *) index.
 */
import "dotenv/config";
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import pg from "pg";

const BESTIGE_CLIENT_ID = "e5f2e43c-fad6-44d5-a193-fa73f47975d1";
const USI_BASELINE_ID = "ddb0eadf-7bcc-49e1-ab5b-5139cf85a7cf";
const PE_BASELINE_ID = "4050aadb-54b5-4470-bacb-b03254fffb79";

type Assessment = {
  controlId: string;
  status: "compliant" | "partial" | "non_compliant" | "not_applicable" | "unknown";
  evidence: string;
};

/** USI Baseline assessments — derived from Bestige diligence responses. */
const USI_ASSESSMENTS: Assessment[] = [
  {
    // 1.1 Centralized identity provider
    controlId: "6b01e746-b5f2-4182-b64d-69cedb635312",
    status: "compliant",
    evidence:
      "Entra ID (Azure AD) only — single tenant, no on-prem AD or domain controllers. 1Password is SCIM-provisioned from Entra. Per diligence: identity.directory.primary = 'Entra ID (Azure AD) only', tenant_count = 1.",
  },
  {
    // 2.1 EDR on every endpoint
    controlId: "9e8f3762-0daa-4d1d-9d2d-08cdc1289528",
    status: "partial",
    evidence:
      "SentinelOne Complete deployed across the fleet of 22 active endpoints per diligence (security.edr.product). Coverage percentage not given — flagging partial until exact coverage is confirmed.",
  },
  {
    // 2.4 End-of-life OS retirement
    controlId: "7d792136-cd6d-4e42-bc01-5d8b18a4f83d",
    status: "non_compliant",
    evidence:
      "2 endpoints on Windows 10 Business (EOL) per euc.workstations.os_distribution. Plan a refresh / upgrade to Windows 11 within 90 days.",
  },
  {
    // 2.5 Standard endpoint build
    controlId: "50e00caa-f02e-41ca-98d6-1ad1e4964043",
    status: "non_compliant",
    evidence:
      "No formal imaging. Endpoints provisioned as local Windows/macOS profiles in WORKGROUP mode. Per euc.workstations.imaging — needs Autopilot/Intune pipeline.",
  },
  {
    // 3.1 Documented network topology
    controlId: "7ea60703-ca53-4e56-9846-bf3f850963d3",
    status: "partial",
    evidence:
      "Nashville (USI-deployed) is partially documented. Austin is captured (UniFi USW Ultra 210W + U6 Mesh AP) but Nashville switching/wireless not detailed in source data. Update full diagram on USI cutover.",
  },
  {
    // 3.3 Wireless segmented
    controlId: "34558f20-6631-4a5b-8a97-16526f5cde44",
    status: "non_compliant",
    evidence:
      "Austin office sits on the host facility's flat 192.168.1.0/24 LAN with no BH firewall or segmentation per network.segmentation.vlans. This is the #1 headline risk on the engagement — deploy BH firewall/UCG with VLANs or SASE/ZTNA on every endpoint.",
  },
  {
    // 4.1 Backups configured for everything that matters
    controlId: "b4cc4c82-04a7-4f59-8957-38579301798e",
    status: "partial",
    evidence:
      "N-able Cove covers endpoint/local computer backup. M365 backup status is uncertain (Exchange Online, OneDrive, SharePoint, Teams) — need to confirm with USI on cutover and either enable M365 backup or document a deliberate exception.",
  },
  {
    // 5.2 Security awareness training
    controlId: "33dac937-ad5d-49af-8b78-a5bf573778a8",
    status: "compliant",
    evidence:
      "KnowBe4 in place (security.awareness.training). Tenant administered by Smarsh rather than directly by BH — once on USI, consider taking tenant ownership for visibility into completion rates.",
  },
  {
    // 5.3 Password manager
    controlId: "324fd0a2-f3fb-448b-8f38-f21c9154a6d3",
    status: "compliant",
    evidence:
      "1Password (enterprise tier), SCIM-provisioned from Entra (security.password_mgr.platform). Adoption strong via SSO integration.",
  },
  {
    // 6.2 Vendor / SaaS inventory
    controlId: "b78a82f3-c916-4606-84a0-0f27d329b64f",
    status: "compliant",
    evidence:
      "Detailed inventory captured in diligence: DealCloud, Grata, iLevel, CapLinked, Smarsh, KnowBe4, 1Password, Avanan, Valimail, N-able Cove + N-sight, Claude Teams, ChatGPT Teams, plus integrations. Treat the diligence apps.lob.primary + apps.integrations.map as the canonical list and migrate to TechOS' SaaS catalog on cutover.",
  },
];

/** PE Baseline assessments. */
const PE_ASSESSMENTS: Assessment[] = [
  {
    // 1.4 Email content & metadata auditing
    controlId: "3a378621-d218-49c2-8a3a-f3cc1ec1a328",
    status: "partial",
    evidence:
      "Smarsh deployed for email archiving (industry.financial_advisory.compliance.archiving, email.archiving.solution = 'Smarsh'). This satisfies content capture; need to verify retention policies + content-keyword auditing rules are tuned for PE-grade obligations.",
  },
  {
    // 5.3 Annual SOC 2 / risk review of data-handling vendors
    controlId: "ef8b7fde-033d-48fc-890d-c17149762f3b",
    status: "unknown",
    evidence:
      "Vendor inventory is rich (10+ data-handling SaaS) but no documented annual SOC 2 / risk review cadence in diligence. Add this as a standing quarterly process post-cutover.",
  },
  {
    // 3.2 DLP — email, file shares, endpoint
    controlId: "adf7f1c1-411a-4311-866b-f97264e674e0",
    status: "partial",
    evidence:
      "Avanan (Check Point) inline email security in place (email.security.gateway). Endpoint and file-share DLP coverage not confirmed. M365 sensitivity labels / Purview DLP not documented. Recommend deploying Purview DLP across email + endpoint + Dropbox (since Dropbox is heavily used in parallel with M365).",
  },
  {
    // 1.2 Admin & IT staff action auditing
    controlId: "5e802215-4dfa-424b-96cf-79a0a0734279",
    status: "unknown",
    evidence:
      "Entra audit logs are available by default. RMM = N-able N-sight (security.rmm.product) — verify session recording / action audit logs are retained ≥1 year. Outside review cadence not established.",
  },
  {
    // 1.6 Monthly access-log review
    controlId: "f0c4091e-ad4d-4d92-968c-e2bbfdc761c9",
    status: "non_compliant",
    evidence:
      "No documented monthly access-log review process. Stand up a recurring quarterly review with the CCO (or a delegate outside IT) as a minimum.",
  },
];

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED missing");
  const c = new pg.Client({ connectionString: url });
  await c.connect();

  // Look up the org id we'll use for the inserts.
  const orgRes = await c.query(
    "SELECT organization_id FROM clients WHERE id = $1",
    [BESTIGE_CLIENT_ID],
  );
  if (orgRes.rows.length === 0) throw new Error("Bestige client not found");
  const orgId = orgRes.rows[0].organization_id;
  console.log("Org:", orgId);

  /* ----- Apply both standards as Required ----- */
  for (const stdId of [USI_BASELINE_ID, PE_BASELINE_ID]) {
    const rationale =
      stdId === USI_BASELINE_ID
        ? "USI internal SMB baseline — applies to every client we manage."
        : "Bestige is a PE / investment management firm handling deal docs, LP information, and material non-public data — requires higher-bar audit logging, PAM, DLP, insider threat monitoring, and regulator-grade IR.";
    await c.query(
      `INSERT INTO client_applicable_standards (organization_id, client_id, standard_id, is_required, rationale)
       VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (client_id, standard_id) DO UPDATE
       SET is_required = EXCLUDED.is_required, rationale = EXCLUDED.rationale, updated_at = now()`,
      [orgId, BESTIGE_CLIENT_ID, stdId, rationale],
    );
    console.log("  ✓ applied standard:", stdId);
  }

  /* ----- Pre-seed assessments ----- */
  const all = [...USI_ASSESSMENTS, ...PE_ASSESSMENTS];
  for (const a of all) {
    await c.query(
      `INSERT INTO client_control_assessments
        (organization_id, client_id, control_id, status, evidence, assessed_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (client_id, control_id) DO UPDATE
       SET status = EXCLUDED.status, evidence = EXCLUDED.evidence, assessed_at = now(), updated_at = now()`,
      [orgId, BESTIGE_CLIENT_ID, a.controlId, a.status, a.evidence],
    );
  }
  console.log(`  ✓ pre-seeded ${all.length} assessments`);

  /* ----- Quick summary ----- */
  const summary = await c.query(
    `SELECT
       count(*) FILTER (WHERE status = 'compliant')::int AS compliant,
       count(*) FILTER (WHERE status = 'partial')::int AS partial,
       count(*) FILTER (WHERE status = 'non_compliant')::int AS non_compliant,
       count(*) FILTER (WHERE status = 'unknown')::int AS unknown,
       count(*)::int AS total
     FROM client_control_assessments
     WHERE client_id = $1`,
    [BESTIGE_CLIENT_ID],
  );
  console.log("\nBestige assessment state:", summary.rows[0]);

  await c.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
