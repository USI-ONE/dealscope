/**
 * Seed the Bestige Holdings ("BH") client runbook into TechOS, sourced from
 * the BH_Technology_Handover_for_USI.docx handover prepared in May 2026.
 *
 * Idempotent. Re-running it leaves existing rows alone (matched by slug).
 *
 * Run with:
 *   pnpm exec tsx scripts/seed-bestige.ts
 */
import { config as loadEnv } from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "../src/db/schema";

loadEnv({ path: ".env.local" });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const ORG_SLUG = process.env.TECHOS_DEFAULT_ORG_SLUG ?? "usi";
const CLIENT_SLUG = "bestige-holdings";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);

/* ----------------------------------------------------------------------------
 * Vendor catalog. Each entry is a vendor + the licenses/services they provide
 * to BH. Pull straight from §6 of the handover doc.
 * -------------------------------------------------------------------------- */
type LicenseSeed = {
  product: string;
  sku?: string;
  seats?: number;
  billing?:
    | "monthly"
    | "annual"
    | "per_seat_monthly"
    | "per_seat_annual"
    | "perpetual"
    | "consumption";
  notes?: string;
  onePasswordItemUrl?: string;
};

type ServiceSeed = {
  name: string;
  description?: string;
  kind?: "managed" | "break_fix" | "project" | "recurring" | "advisory" | "other";
  notes?: string;
};

type VendorSeed = {
  name: string;
  category: string; // free-form tag
  website?: string;
  notes?: string;
  licenses?: LicenseSeed[];
  services?: ServiceSeed[];
};

const VENDORS: VendorSeed[] = [
  {
    name: "Microsoft",
    category: "identity",
    website: "https://microsoft.com",
    notes:
      "Direct-Microsoft tenancy (legacy NETORGFT1292899.onmicrosoft.com prefix from earlier GoDaddy provisioning). Primary domain: bestigeholdings.com.",
    licenses: [
      {
        product: "Microsoft 365",
        seats: 33,
        billing: "per_seat_monthly",
        notes:
          "20 user mailboxes + 10 shared + 3 service mailboxes. Litigation hold enabled on most; exceptions: Blake Boardman, Lisa McDonald (TAG), Pierre Champion, William Wang. Smarsh handles archiving.",
      },
    ],
  },
  {
    name: "1Password",
    category: "identity",
    website: "https://1password.com",
    notes: "Enterprise password manager. SCIM-provisioned from Entra (1Password SCIM Provisioning app).",
    licenses: [{ product: "1Password Business", billing: "per_seat_annual" }],
  },
  {
    name: "Dropbox",
    category: "productivity",
    website: "https://dropbox.com",
    notes: "Heavy use alongside SharePoint/OneDrive. File storage.",
    licenses: [{ product: "Dropbox Business", billing: "per_seat_annual" }],
  },
  {
    name: "Avanan (Check Point)",
    category: "email-security",
    website: "https://www.avanan.com",
    notes: "Inline email security; avanan_inline_incoming/outgoing groups in Entra.",
    licenses: [{ product: "Avanan Email Security", billing: "annual" }],
  },
  {
    name: "Valimail",
    category: "email-security",
    website: "https://www.valimail.com",
    notes: "Email authentication / DMARC management.",
    licenses: [{ product: "Valimail DMARC", billing: "annual" }],
  },
  {
    name: "Smarsh",
    category: "compliance",
    website: "https://www.smarsh.com",
    notes:
      "Email archiving for SEC Investment Advisers Act recordkeeping. Also administers BH's KnowBe4 tenant.",
    licenses: [{ product: "Smarsh Archiving", billing: "annual" }],
  },
  {
    name: "N-able",
    category: "endpoint",
    website: "https://www.n-able.com",
    notes: "RMM (N-sight) + endpoint backup (Cove Data Protection).",
    licenses: [
      { product: "N-able N-sight RMM", seats: 22, billing: "per_seat_monthly" },
      { product: "N-able Cove Data Protection", seats: 22, billing: "per_seat_monthly" },
    ],
    services: [
      {
        name: "RMM monitoring (N-sight)",
        kind: "managed",
        description: "Patch + remote management of all 22 endpoints. Source of inventory.",
      },
      {
        name: "Endpoint backup (Cove)",
        kind: "managed",
        description:
          "Local computer backup. NB: M365 (Exchange/SharePoint/OneDrive/Teams) backup gap — confirm with USI.",
      },
    ],
  },
  {
    name: "SentinelOne",
    category: "endpoint",
    website: "https://www.sentinelone.com",
    notes: "EDR across the fleet.",
    licenses: [
      { product: "SentinelOne Complete", seats: 22, billing: "per_seat_annual" },
    ],
    services: [
      {
        name: "EDR (SentinelOne Complete)",
        kind: "managed",
        description: "Endpoint detection + response on all 22 active endpoints.",
      },
    ],
  },
  {
    name: "ComplySci",
    category: "compliance",
    website: "https://www.complysci.com",
    notes:
      "RIA compliance — code of ethics, personal trading pre-clearance, attestations.",
    licenses: [{ product: "ComplySci RIA", billing: "annual" }],
  },
  {
    name: "KnowBe4",
    category: "compliance",
    website: "https://www.knowbe4.com",
    notes: "Security awareness training. Tenant administered by Smarsh — coordinate via them.",
    licenses: [{ product: "KnowBe4 Awareness Training", billing: "per_seat_annual" }],
  },
  {
    name: "DealCloud",
    category: "deal-stack",
    website: "https://www.dealcloud.com",
    notes: "Primary CRM / deal management. DealCloud Exchange Connection App v2 in Entra.",
    licenses: [{ product: "DealCloud", billing: "per_seat_annual" }],
  },
  { name: "Grata", category: "deal-stack", website: "https://grata.com", notes: "Deal sourcing.", licenses: [{ product: "Grata", billing: "per_seat_annual" }] },
  {
    name: "iLevel",
    category: "deal-stack",
    notes: "Portfolio reporting.",
    licenses: [{ product: "iLevel", billing: "per_seat_annual" }],
  },
  {
    name: "CapLinked",
    category: "deal-stack",
    website: "https://www.caplinked.com",
    notes: "Virtual data room / secure document sharing.",
    licenses: [{ product: "CapLinked VDR", billing: "annual" }],
  },
  {
    name: "4Pines",
    category: "lp-portal",
    notes: "Third-party hosted LP / investor portal.",
    licenses: [{ product: "4Pines LP Portal", billing: "annual" }],
  },
  {
    name: "ArkPES",
    category: "lp-portal",
    notes: "Third-party hosted data room / LP portal.",
    licenses: [{ product: "ArkPES", billing: "annual" }],
  },
  {
    name: "Asana",
    category: "productivity",
    website: "https://asana.com",
    notes: "Primary PM platform. Asana for Outlook add-in registered in Entra.",
    licenses: [{ product: "Asana Business", billing: "per_seat_annual" }],
  },
  {
    name: "Harvest",
    category: "productivity",
    website: "https://www.getharvest.com",
    notes: "Time tracking. Harvest add-in registered in Entra.",
    licenses: [{ product: "Harvest", billing: "per_seat_annual" }],
  },
  {
    name: "Intuit (QuickBooks Online)",
    category: "finance",
    website: "https://quickbooks.intuit.com",
    notes: "Accounting. Linked to bhaccounting@ shared mailbox.",
    licenses: [{ product: "QuickBooks Online", billing: "monthly" }],
  },
  {
    name: "Expensify",
    category: "finance",
    website: "https://www.expensify.com",
    notes: "Expense management. Administered by 3rd party.",
    licenses: [{ product: "Expensify", billing: "per_seat_monthly" }],
  },
  {
    name: "DocuSign",
    category: "documents",
    website: "https://www.docusign.com",
    notes: "E-signature.",
    licenses: [{ product: "DocuSign", billing: "annual" }],
  },
  {
    name: "Adobe",
    category: "documents",
    website: "https://adobe.com",
    notes: "PDF authoring/editing.",
    licenses: [{ product: "Acrobat Pro", billing: "per_seat_annual" }],
  },
  {
    name: "Thomson Reuters",
    category: "research",
    website: "https://www.thomsonreuters.com",
    notes: "Practical Law (AI-assisted legal research).",
    licenses: [{ product: "Practical Law", billing: "annual" }],
  },
  {
    name: "Culture Amp",
    category: "people",
    website: "https://www.cultureamp.com",
    notes: "Employee engagement surveys.",
    licenses: [{ product: "Culture Amp", billing: "annual" }],
  },
  {
    name: "TurboBridge",
    category: "voice",
    website: "https://www.turbobridge.com",
    notes:
      "Audio conference bridge / dial-in. Confirm with USI whether direct-dial voice exists (Teams Phone, RingCentral, etc.).",
    licenses: [{ product: "TurboBridge", billing: "monthly" }],
  },
  {
    name: "Anthropic",
    category: "ai",
    website: "https://www.anthropic.com",
    notes:
      "Claude Teams. Excel + PowerPoint add-ins registered in Entra (Claude by Anthropic for Excel / PowerPoint).",
    licenses: [{ product: "Claude Teams", billing: "per_seat_monthly" }],
  },
  {
    name: "OpenAI",
    category: "ai",
    website: "https://openai.com",
    notes: "ChatGPT Teams.",
    licenses: [{ product: "ChatGPT Teams", billing: "per_seat_monthly" }],
  },
  {
    name: "Otter.ai",
    category: "ai",
    website: "https://otter.ai",
    notes: "Meeting transcription.",
    licenses: [{ product: "Otter.ai Business", billing: "per_seat_monthly" }],
  },
  {
    name: "Grammarly",
    category: "ai",
    website: "https://www.grammarly.com",
    notes: "Writing assistance.",
    licenses: [{ product: "Grammarly Business", billing: "per_seat_annual" }],
  },
  {
    name: "Loom",
    category: "ai",
    website: "https://www.loom.com",
    notes: "Async video / screen recording.",
    licenses: [{ product: "Loom Business", billing: "per_seat_annual" }],
  },
  {
    name: "GoDaddy",
    category: "domain",
    website: "https://www.godaddy.com",
    notes:
      "Registrar + DNS for bestigeholdings.com. (M365 itself is now direct-Microsoft; legacy NETORGFT* tenant prefix.)",
  },
  {
    name: "Zoho",
    category: "other",
    website: "https://www.zoho.com",
    notes: "Entra app registration present (created 04/02/2024). Specific BH usage TBD — flag for USI to confirm.",
  },
];

/* ----------------------------------------------------------------------------
 * Endpoint fleet — §4.2 of the handover doc.
 * -------------------------------------------------------------------------- */
type EndpointSeed = {
  hostname: string;
  manufacturer: string;
  model: string;
  os: string;
  cpu: string;
  ramGb: number;
  diskGb: number;
  lastIp?: string;
  lastSeen: string; // YYYY-MM-DD
  assignedTo?: string;
  isEol?: boolean;
  notes?: string;
};

const ENDPOINTS: EndpointSeed[] = [
  // 1 macOS
  {
    hostname: "Mac (M-series)",
    manufacturer: "Apple",
    model: "Mac16,6",
    os: "macOS 26.2",
    cpu: "Apple M4 Max",
    ramGb: 64,
    diskGb: 2000,
    lastIp: "10.68.1.225",
    lastSeen: "2026-05-01",
  },
  // 21 Windows (Lenovo unless noted)
  { hostname: "ALISSAROEBUCK", manufacturer: "Lenovo", model: "21NS0013US", os: "Windows 11 Business", cpu: "Intel Core Ultra 7 258V", ramGb: 32, diskGb: 1900, lastIp: "192.168.100.46", lastSeen: "2026-05-01", assignedTo: "Alissa Roebuck" },
  { hostname: "BESTIGELR", manufacturer: "Lenovo", model: "21NX005SUS", os: "Windows 11 Business", cpu: "Intel Core Ultra 7 255U", ramGb: 32, diskGb: 953, lastIp: "192.168.1.233", lastSeen: "2026-04-15", notes: "Owner TBD — confirm during onboarding." },
  { hostname: "BHOFFMAN", manufacturer: "Lenovo", model: "21NS0012US", os: "Windows 11 Business", cpu: "Intel Core Ultra 7 258V", ramGb: 32, diskGb: 953, lastIp: "192.168.1.100", lastSeen: "2026-05-01", assignedTo: "Brian Hoffman" },
  { hostname: "CHASES_PC", manufacturer: "Lenovo", model: "21NS0012US", os: "Windows 11 Business", cpu: "Intel Core Ultra 7 258V", ramGb: 32, diskGb: 953, lastIp: "192.168.1.45", lastSeen: "2026-05-01", assignedTo: "Chase Kilty" },
  { hostname: "CODYS", manufacturer: "Lenovo", model: "21HM002GUS", os: "Windows 11 Business", cpu: "Intel Core i7-1365U", ramGb: 32, diskGb: 953, lastIp: "192.168.1.91", lastSeen: "2026-05-01", assignedTo: "Cody Richert" },
  { hostname: "JLANE", manufacturer: "Lenovo", model: "21HM002GUS", os: "Windows 11 Business", cpu: "Intel Core i7-1365U", ramGb: 32, diskGb: 953, lastIp: "192.168.1.251", lastSeen: "2026-05-01", assignedTo: "Josh Lane" },
  { hostname: "JONI", manufacturer: "Lenovo", model: "20XW00FNUS", os: "Windows 11 Business", cpu: "Intel Core i5-1135G7", ramGb: 8, diskGb: 238, lastIp: "10.0.0.55", lastSeen: "2026-05-01", assignedTo: "Joni Burke" },
  { hostname: "JTRAVISA", manufacturer: "Lenovo", model: "21NX005SUS", os: "Windows 11 Business", cpu: "Intel Core Ultra 7 255U", ramGb: 32, diskGb: 953, lastIp: "192.168.1.213", lastSeen: "2026-05-01", assignedTo: "John Travisano" },
  { hostname: "LAPTOP-0TVR11KP", manufacturer: "Lenovo", model: "21NS0013US", os: "Windows 11 Business", cpu: "Intel Core Ultra 7 258V", ramGb: 32, diskGb: 1900, lastIp: "192.168.50.44", lastSeen: "2026-04-15", notes: "Owner TBD." },
  { hostname: "LAPTOP-33KE27KL", manufacturer: "Lenovo", model: "20XW003NUS", os: "Windows 11 Pro", cpu: "Intel Core i5-1145G7", ramGb: 16, diskGb: 477, lastSeen: "2026-01-15", notes: "Owner TBD; last IP not captured." },
  { hostname: "LAPTOP-E2J6JSVV", manufacturer: "Lenovo", model: "21CB000DUS", os: "Windows 11 Pro", cpu: "Intel Core i7-1280P", ramGb: 32, diskGb: 953, lastIp: "172.26.176.1", lastSeen: "2026-05-01", notes: "Owner TBD." },
  { hostname: "LAPTOP-ESU8IVKD", manufacturer: "Lenovo", model: "20QDS3B700", os: "Windows 10 Business (EOL)", cpu: "Intel Core i7-8565U", ramGb: 16, diskGb: 953, lastIp: "10.14.115.250", lastSeen: "2024-11-01", isEol: true, notes: "Past Microsoft end-of-support (Oct 14 2025). Stale in N-sight. Confirm in-use; upgrade or retire." },
  { hostname: "LAPTOP-KFLKSFHS", manufacturer: "Lenovo", model: "21NX005SUS", os: "Windows 11 Pro", cpu: "Intel Core Ultra 7 255U", ramGb: 32, diskGb: 953, lastIp: "10.0.0.154", lastSeen: "2026-05-01", notes: "Owner TBD." },
  { hostname: "LAPTOP-S6JA1OQU", manufacturer: "Lenovo", model: "21HM002GUS", os: "Windows 11 Business", cpu: "Intel Core i7-1365U", ramGb: 32, diskGb: 953, lastIp: "192.168.2.182", lastSeen: "2026-05-01", notes: "Owner TBD." },
  { hostname: "LAPTOP-UDRU6FTI", manufacturer: "Lenovo", model: "20XW003EUS", os: "Windows 10 Business (EOL)", cpu: "Intel Core i5-1135G7", ramGb: 8, diskGb: 238, lastIp: "192.168.4.34", lastSeen: "2025-08-15", isEol: true, notes: "Past Microsoft end-of-support. Stale. Owner TBD; confirm in-use." },
  { hostname: "LOGAN-07-2024", manufacturer: "Lenovo", model: "21KC0046US", os: "Windows 11 Business", cpu: "Intel Core Ultra 7 155U", ramGb: 32, diskGb: 477, lastIp: "192.168.5.102", lastSeen: "2026-05-01", assignedTo: "Logan McLeod" },
  { hostname: "NBARD-X1", manufacturer: "Lenovo", model: "21CBCTO1WW", os: "Windows 11 Pro", cpu: "Intel Core i7-1270P", ramGb: 32, diskGb: 953, lastIp: "192.168.5.66", lastSeen: "2026-05-01", assignedTo: "Nate Bard" },
  { hostname: "NR-X1-10-2024", manufacturer: "Lenovo", model: "21KC004AUS", os: "Windows 11 Pro", cpu: "Intel Core Ultra 7 165U", ramGb: 32, diskGb: 953, lastIp: "172.19.0.115", lastSeen: "2026-05-01", assignedTo: "Nate Richey" },
  { hostname: "ROBS_LENOVO", manufacturer: "Lenovo", model: "21NX005SUS", os: "Windows 11 Pro", cpu: "Intel Core Ultra 7 255U", ramGb: 32, diskGb: 953, lastIp: "192.168.4.72", lastSeen: "2026-05-01", assignedTo: "Rob Adamek" },
  { hostname: "ROB_WORK_PC", manufacturer: "Dell", model: "XPS 15 9530", os: "Windows 11 Pro", cpu: "Intel Core i7-13700H", ramGb: 16, diskGb: 477, lastIp: "192.168.4.30", lastSeen: "2026-05-01", assignedTo: "Rob Adamek" },
  { hostname: "SLVBESTIGE", manufacturer: "Lenovo", model: "21KC000MUS", os: "Windows 11 Business", cpu: "Intel Core Ultra 7 165U", ramGb: 32, diskGb: 953, lastIp: "192.168.7.32", lastSeen: "2026-05-01", notes: "Owner TBD." },
];

/* ----------------------------------------------------------------------------
 * Top-level summary used as the BH client.notes (so it shows on the runbook
 * detail page).
 * -------------------------------------------------------------------------- */
const BH_SUMMARY = `Bestige Holdings ("BH") is a private-equity / investment management firm operating across multiple portfolio brands. Cloud-first technology environment: identity, email, file storage, and the entire LOB application portfolio run as SaaS — no on-prem servers, no domain controllers, no Entra Connect. Endpoints are Windows + macOS laptops in WORKGROUP mode, managed remotely via N-able N-sight with SentinelOne Complete EDR and N-able Cove backup.

KEY OPEN ITEMS (per §8 of the May 2026 handover):
- Confirm M365 backup coverage (Exchange / SharePoint / OneDrive / Teams).
- Review Entra MFA / Conditional Access posture.
- Confirm BitLocker / FileVault enforcement + recovery-key escrow.
- Resolve Austin office network exposure (BH gear sits flat on a host's 192.168.1.0/24 LAN with no BH-owned firewall).
- Retire the two Windows 10 EOL laptops (LAPTOP-ESU8IVKD, LAPTOP-UDRU6FTI).
- Delete NordLayer Entra app registration (product not in use).
- Deactivate MigrationWiz Entra app registration if M365 cutover is complete.
- Investigate "P2P Server" Entra app registration (created 2017, generic name).
- Investigate "Queen Elsa"-style unattributed Global Admin accounts.
- Identify owners for endpoints currently labeled "Owner TBD".
- Confirm Zoho product in use (Entra app registration suggests something active).
- Confirm if direct-dial voice exists (Teams Phone, RingCentral, etc.) or whether BH is meeting-only via TurboBridge.

COMPLIANCE: SEC-regulated investment management posture. Smarsh archives email traffic (Investment Advisers Act recordkeeping). ComplySci handles code-of-ethics + personal trading attestations. Litigation hold enabled on most mailboxes (4 exceptions: Blake Boardman, Lisa McDonald [TAG], Pierre Champion, William Wang).

AI FOOTPRINT: 5 distinct AI products in parallel (Claude Teams, ChatGPT Teams, Otter.ai, Grammarly, Loom), plus AI features in Practical Law. Each carries a separate admin console, billing relationship, and data-handling posture.`;

/* ============================================================================
 * Run.
 * ========================================================================== */
async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();
  const db = drizzle(c, { schema });

  // 1. Find org.
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.slug, ORG_SLUG),
  });
  if (!org) throw new Error(`No org with slug "${ORG_SLUG}" — sign in once first to bootstrap.`);
  console.log(`Org: ${org.name} (${org.id})`);

  // 2. Resolve account-manager membership (current sole user, if exactly one).
  const allMembers = await db.query.memberships.findMany({
    where: eq(schema.memberships.organizationId, org.id),
  });
  const accountManagerMembershipId =
    allMembers.length === 1 ? allMembers[0].id : null;
  console.log(`Account manager: ${accountManagerMembershipId ?? "(unassigned)"}`);

  // 3. Upsert Bestige Holdings client.
  let bh = await db.query.clients.findFirst({
    where: and(
      eq(schema.clients.organizationId, org.id),
      eq(schema.clients.slug, CLIENT_SLUG),
    ),
  });
  if (!bh) {
    const [created] = await db
      .insert(schema.clients)
      .values({
        organizationId: org.id,
        name: "Bestige Holdings",
        slug: CLIENT_SLUG,
        status: "active",
        primaryDomain: "bestigeholdings.com",
        industry: "Private Equity / Investment Management",
        accountManagerMembershipId,
        notes: BH_SUMMARY,
      })
      .returning();
    bh = created;
    console.log("Created client: Bestige Holdings");
  } else {
    console.log("Client exists — leaving as-is.");
  }

  // 4. Locations.
  const existingLocations = await db
    .select()
    .from(schema.clientLocations)
    .where(eq(schema.clientLocations.clientId, bh.id));
  const locByLabel = new Map(existingLocations.map((l) => [l.label, l]));

  async function ensureLocation(input: typeof schema.clientLocations.$inferInsert) {
    if (locByLabel.has(input.label)) {
      console.log(`Location exists: ${input.label}`);
      return locByLabel.get(input.label)!;
    }
    const [row] = await db
      .insert(schema.clientLocations)
      .values({ ...input, organizationId: org.id, clientId: bh.id })
      .returning();
    console.log(`Created location: ${input.label}`);
    locByLabel.set(input.label, row);
    return row;
  }

  const nashville = await ensureLocation({
    organizationId: org.id,
    clientId: bh.id,
    label: "Nashville HQ",
    city: "Nashville",
    region: "TN",
    country: "US",
    isPrimary: true,
    isClientOwnedNetwork: true,
    networkNotes: "USI-deployed network + ISP relationship. USI retains primary network records for this site.",
    notes: "Primary office.",
  });

  const austin = await ensureLocation({
    organizationId: org.id,
    clientId: bh.id,
    label: "Austin (temporary)",
    city: "Austin",
    region: "TX",
    country: "US",
    isPrimary: false,
    subnet: "192.168.1.0/24",
    isp: "Host facility (not BH-procured)",
    isClientOwnedNetwork: false,
    securityPosture:
      "EXPOSED — BH gear sits flat on host's LAN. No BH-owned firewall. No segmentation. No BH-owned ISP relationship.",
    networkNotes:
      "UniFi CloudKey 'ATX Office' (local controller) + USW Ultra 210W (192.168.1.68, 8-port PoE switch) + U6 Mesh AP (192.168.1.96, uplinks switch port 4). CloudKey on switch port 2. Switch + AP get DHCP from host's gateway. Recommend (a) BH-owned UniFi gateway with dedicated upstream + VLAN, OR (b) SASE/ZTNA on every endpoint, OR (c) at minimum tune SentinelOne network-control for untrusted-network conditions and require MFA for SaaS.",
    notes:
      "Temporary office — was NOT communicated to USI during the Nashville engagement. Document break-glass for CloudKey login.",
  });

  // 5. Vendors + their licenses + their services.
  for (const v of VENDORS) {
    const slug = slugify(v.name);
    let vendor = await db.query.vendors.findFirst({
      where: and(
        eq(schema.vendors.organizationId, org.id),
        eq(schema.vendors.slug, slug),
      ),
    });
    if (!vendor) {
      const [row] = await db
        .insert(schema.vendors)
        .values({
          organizationId: org.id,
          name: v.name,
          slug,
          status: "active",
          website: v.website ?? null,
          tags: [v.category],
          notes: v.notes ?? null,
        })
        .returning();
      vendor = row;
      console.log(`  vendor + ${v.name}`);
    } else {
      console.log(`  vendor = ${v.name}`);
    }

    // Licenses.
    for (const l of v.licenses ?? []) {
      const exists = await db.query.licenses.findFirst({
        where: and(
          eq(schema.licenses.organizationId, org.id),
          eq(schema.licenses.vendorId, vendor.id),
          eq(schema.licenses.clientId, bh.id),
          eq(schema.licenses.productName, l.product),
        ),
      });
      if (exists) {
        console.log(`     license = ${l.product}`);
        continue;
      }
      await db.insert(schema.licenses).values({
        organizationId: org.id,
        vendorId: vendor.id,
        clientId: bh.id,
        productName: l.product,
        sku: l.sku ?? null,
        seatsTotal: l.seats ?? null,
        billingPeriod: l.billing ?? "annual",
        status: "active",
        notes: l.notes ?? null,
      });
      console.log(`     license + ${l.product}${l.seats ? ` (${l.seats} seats)` : ""}`);
    }

    // Services.
    for (const s of v.services ?? []) {
      const exists = await db.query.services.findFirst({
        where: and(
          eq(schema.services.organizationId, org.id),
          eq(schema.services.vendorId, vendor.id),
          eq(schema.services.clientId, bh.id),
          eq(schema.services.name, s.name),
        ),
      });
      if (exists) {
        console.log(`     service = ${s.name}`);
        continue;
      }
      await db.insert(schema.services).values({
        organizationId: org.id,
        vendorId: vendor.id,
        clientId: bh.id,
        name: s.name,
        description: s.description ?? null,
        kind: s.kind ?? "managed",
        status: "active",
        notes: s.notes ?? null,
      });
      console.log(`     service + ${s.name}`);
    }
  }

  // 6. Hardware (22 endpoints).
  const allVendors = await db
    .select()
    .from(schema.vendors)
    .where(eq(schema.vendors.organizationId, org.id));
  const vendorByName = new Map(allVendors.map((v) => [v.name, v]));

  // Create Lenovo + Dell + Apple as hardware vendors (separate from SaaS).
  for (const hwVendorName of ["Lenovo", "Dell", "Apple"]) {
    if (vendorByName.has(hwVendorName)) continue;
    const [row] = await db
      .insert(schema.vendors)
      .values({
        organizationId: org.id,
        name: hwVendorName,
        slug: slugify(hwVendorName),
        status: "active",
        tags: ["hardware"],
      })
      .returning();
    vendorByName.set(hwVendorName, row);
    console.log(`  hardware vendor + ${hwVendorName}`);
  }

  // Service-stack tags applied to each endpoint (RMM/EDR/Backup all in place).
  const HW_AGENTS = {
    rmmAgent: "N-able N-sight",
    edrAgent: "SentinelOne Complete",
    backupAgent: "N-able Cove",
  };

  for (const ep of ENDPOINTS) {
    const exists = await db.query.hardware.findFirst({
      where: and(
        eq(schema.hardware.organizationId, org.id),
        eq(schema.hardware.clientId, bh.id),
        eq(schema.hardware.label, ep.hostname),
      ),
    });
    if (exists) {
      console.log(`  hardware = ${ep.hostname}`);
      continue;
    }
    const vendor = vendorByName.get(ep.manufacturer);
    await db.insert(schema.hardware).values({
      organizationId: org.id,
      clientId: bh.id,
      locationId: null, // unknown which Nashville/Austin per device
      vendorId: vendor?.id ?? null,
      kind: "laptop",
      label: ep.hostname,
      manufacturer: ep.manufacturer,
      model: ep.model,
      status: ep.isEol ? "active" : "active",
      osName: ep.os,
      cpuLabel: ep.cpu,
      ramGb: ep.ramGb,
      diskGb: ep.diskGb,
      lastIp: ep.lastIp ?? null,
      lastSeenAt: new Date(`${ep.lastSeen}T00:00:00Z`),
      isEol: !!ep.isEol,
      ...HW_AGENTS,
      assignedToLabel: ep.assignedTo ?? null,
      notes: ep.notes ?? null,
    });
    console.log(`  hardware + ${ep.hostname}${ep.assignedTo ? ` (${ep.assignedTo})` : ""}`);
  }

  console.log("\nDone seeding Bestige Holdings runbook.");
  console.log(`  https://techos-gold.vercel.app/clients/${bh.id}`);
  await c.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
