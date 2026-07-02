/**
 * Syncro MSP REST API client (one-way pull).
 *
 * Auth: API key issued from Syncro → Admin → API → New API Token. Required
 * scopes: Customer - List/Read, Asset - List/Read.
 *
 * Env:
 *   SYNCRO_SUBDOMAIN — the prefix in https://<sub>.syncromsp.com
 *   SYNCRO_API_KEY   — the bearer token (sometimes called "API key")
 *
 * Pagination: Syncro returns up to 100 per page. We paginate until exhausted
 * for list operations. Be mindful of rate limits — pagination is sequential
 * to keep things simple; ~50ms between requests would be safer for very
 * large customer lists, but we're not adding that until it actually bites.
 */

export type SyncroCustomer = {
  id: number;
  business_name: string | null;
  business_and_full_name: string | null;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  business_then_name: string | null;
  no_email: boolean;
  no_billing: boolean;
  /** Syncro's built-in primary location concept (when the org uses it). */
  location_name?: string | null;
  location_id?: number | null;
  /** Custom field values exposed as a typed array (newer Syncro tenants). */
  customer_custom_field_values?: { name: string; value: unknown }[];
  /** Free-form properties object — custom fields land here on most
   *  Syncro tenants, keyed by field name as the user typed it in. */
  properties?: Record<string, unknown>;
};

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Generic: pull a Syncro custom-field value by name. Defensive — tries
 * every shape Syncro uses, and matches field names case- + whitespace-
 * insensitively (so "AutoElevate Running" / "autoelevate_running" /
 * "autoelevate running" all match).
 *
 *  1. customer.properties[<matching key>]
 *  2. customer.customer_custom_field_values[name=<matching key>].value
 *
 * Returns the first non-empty stringified match.
 */
export function extractCustomerField(
  c: SyncroCustomer,
  fieldName: string,
): string | null {
  const target = normalizeKey(fieldName);
  const trimmed = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = typeof v === "string" ? v : String(v);
    const out = s.trim();
    return out.length > 0 ? out : null;
  };
  // 1. properties — keys may use any casing or separator
  if (c.properties) {
    for (const [k, v] of Object.entries(c.properties)) {
      if (normalizeKey(k) === target) {
        const found = trimmed(v);
        if (found) return found;
      }
    }
  }
  // 2. customer_custom_field_values
  if (Array.isArray(c.customer_custom_field_values)) {
    const hit = c.customer_custom_field_values.find(
      (f) => typeof f.name === "string" && normalizeKey(f.name) === target,
    );
    if (hit) {
      const found = trimmed(hit.value);
      if (found) return found;
    }
  }
  return null;
}

/**
 * "Location" custom field — falls back to Syncro's built-in location_name
 * when no custom field is set.
 */
export function extractCustomerLocation(c: SyncroCustomer): string | null {
  const fromCustomField = extractCustomerField(c, "location");
  if (fromCustomField) return fromCustomField;
  // Fallback: Syncro's built-in primary location
  const builtIn = c.location_name?.trim();
  return builtIn && builtIn.length > 0 ? builtIn : null;
}

/**
 * "AutoElevate Running" custom field — flags whether the AutoElevate
 * PAM agent is reporting at this client. Free text — typically "Yes" /
 * "No" / "Partial" / "Unknown" / a date.
 */
export function extractCustomerAutoelevate(c: SyncroCustomer): string | null {
  return extractCustomerField(c, "autoelevate running");
}

/**
 * Customer CSAT pair — "Latest CSAT" (numeric score 1-5) and
 * "Latest CSAT Comment" (free text). Either may be null if the
 * customer hasn't responded to a survey.
 */
export function extractCustomerCsat(
  c: SyncroCustomer,
): { score: number | null; comment: string | null } {
  const raw = extractCustomerField(c, "latest csat");
  const score = raw ? parseInt(raw, 10) : null;
  return {
    score: score !== null && !Number.isNaN(score) ? score : null,
    comment: extractCustomerField(c, "latest csat comment"),
  };
}

/**
 * Generic asset-level custom-field extractor (mirrors extractCustomerField).
 * Same defensive matching: case + whitespace + separator insensitive.
 * Looks at `properties` (where most Syncro tenants land custom fields)
 * and `asset_custom_field_values` (newer shape).
 */
export function extractAssetField(
  a: SyncroAsset,
  fieldName: string,
): string | null {
  const target = normalizeKey(fieldName);
  const trimmed = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = typeof v === "string" ? v : String(v);
    const out = s.trim();
    return out.length > 0 ? out : null;
  };
  if (a.properties) {
    for (const [k, v] of Object.entries(a.properties)) {
      if (normalizeKey(k) === target) {
        const found = trimmed(v);
        if (found) return found;
      }
    }
  }
  if (Array.isArray(a.asset_custom_field_values)) {
    const hit = a.asset_custom_field_values.find(
      (f) => typeof f.name === "string" && normalizeKey(f.name) === target,
    );
    if (hit) {
      const found = trimmed(hit.value);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Per-asset "Location" custom field. Some Syncro tenants set this on
 * individual machines (so you can tell which floor / building / site
 * the workstation lives at). We accept any of these synonyms.
 *
 * Treats "Location Undefined" / "Unassigned" / "Unknown" / "N/A" / "-" as null
 * so they don't pollute the location list.
 */
export function extractAssetLocation(a: SyncroAsset): string | null {
  for (const name of ["location", "site", "office", "building"]) {
    const v = extractAssetField(a, name);
    if (!v) continue;
    const lower = v.toLowerCase().trim();
    if (
      lower === "location undefined" ||
      lower === "undefined" ||
      lower === "unassigned" ||
      lower === "unknown" ||
      lower === "n/a" ||
      lower === "na" ||
      lower === "-" ||
      lower === "none"
    ) {
      continue;
    }
    return v;
  }
  return null;
}

export type SyncroAsset = {
  id: number;
  customer_id: number | null;
  asset_type: string | null;
  asset_serial: string | null;
  /** Syncro stores some hostname / nickname info here. */
  name: string | null;
  /** Custom-field array: [{name, value}, ...]. Highly variable per Syncro account. */
  properties?: Record<string, unknown>;
  asset_custom_field_values?: { name: string; value: unknown }[];
  /** RMM-managed agent details (when present). */
  rmm_link?: string | null;
  rmm_store_id?: string | null;
  rmm_machine?: {
    operating_system?: string | null;
    last_user?: string | null;
    last_logged_in?: string | null;
    online?: boolean;
    /** Hostname reported by the agent. */
    machine_name?: string | null;
    /** Free-form fields — varies by RMM platform. */
    [k: string]: unknown;
  } | null;
  created_at: string;
  updated_at: string;
};

type SyncroListResponse<TKey extends string, TVal> = {
  meta?: { total_pages?: number; total_entries?: number };
} & Record<TKey, TVal[]>;

export class SyncroError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "SyncroError";
  }
}

function envOrThrow(): { subdomain: string; apiKey: string } {
  const subdomain = process.env.SYNCRO_SUBDOMAIN;
  const apiKey = process.env.SYNCRO_API_KEY;
  if (!subdomain || !apiKey) {
    throw new SyncroError(
      0,
      "Syncro is not configured — set SYNCRO_SUBDOMAIN and SYNCRO_API_KEY env vars.",
    );
  }
  return { subdomain, apiKey };
}

export function isSyncroConfigured(): boolean {
  return !!process.env.SYNCRO_SUBDOMAIN && !!process.env.SYNCRO_API_KEY;
}

async function syncroFetch<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const { subdomain, apiKey } = envOrThrow();
  const url = new URL(`https://${subdomain}.syncromsp.com/api/v1${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  }
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!r.ok) {
    let body: unknown;
    try {
      body = await r.json();
    } catch {
      body = await r.text().catch(() => undefined);
    }
    throw new SyncroError(
      r.status,
      `Syncro GET ${path} failed (${r.status})`,
      body,
    );
  }
  return (await r.json()) as T;
}

/**
 * List ALL customers, paginating until exhausted. Use sparingly — for an MSP
 * with many customers this is slow.
 */
export async function listAllCustomers(): Promise<SyncroCustomer[]> {
  const all: SyncroCustomer[] = [];
  let page = 1;
  while (true) {
    const r = await syncroFetch<SyncroListResponse<"customers", SyncroCustomer>>(
      "/customers",
      { page, per_page: 100 },
    );
    const batch = (r.customers ?? []) as SyncroCustomer[];
    all.push(...batch);
    const totalPages = r.meta?.total_pages ?? 1;
    if (page >= totalPages || batch.length === 0) break;
    page++;
  }
  return all;
}

/**
 * Fetch a single Syncro customer by ID.
 */
export async function getCustomer(id: number): Promise<SyncroCustomer> {
  const r = await syncroFetch<{ customer: SyncroCustomer }>(`/customers/${id}`);
  return r.customer;
}

/**
 * A Syncro Portal User — an end-user employee at one of USI's clients
 * who has a Syncro Customer Portal account. Portal users are the unit
 * USI bills against for "Syncro Remote Access - per contact" on the
 * monthly PS invoice.
 *
 * Caveat: not every portal user is necessarily a billable Syncro Remote
 * seat — some accounts may be ticket-portal-only while others have
 * Splashtop SOS enabled. The portal_group_id field groups them but
 * Syncro's API doesn't expose portal_groups publicly, so we surface
 * raw counts and let the operator decide which portion to bill via
 * the composer override.
 */
export type SyncroPortalUser = {
  id: number;
  customer_id: number;
  contact_id: number | null;
  account_id: number;
  portal_group_id: number;
  email: string;
  disabled: boolean;
  require_mfa?: boolean;
  created_at: string;
  updated_at: string;
};

/** Pull every portal user across the org. ~30 records total today —
 *  one /portal_users page is enough but paginate defensively. */
export async function listAllPortalUsers(): Promise<SyncroPortalUser[]> {
  const all: SyncroPortalUser[] = [];
  let page = 1;
  while (true) {
    const r = await syncroFetch<SyncroListResponse<"portal_users", SyncroPortalUser>>(
      "/portal_users",
      { page, per_page: 100 },
    );
    const batch = (r.portal_users ?? []) as SyncroPortalUser[];
    all.push(...batch);
    const totalPages = r.meta?.total_pages ?? 1;
    if (page >= totalPages || batch.length === 0) break;
    page++;
  }
  return all;
}

/**
 * List all assets for a Syncro customer.
 * Endpoint: GET /customer_assets?customer_id=N (NOT /customers/:id/assets,
 * which returns 404 on Syncro's API).
 */
export async function listAssetsForCustomer(customerId: number): Promise<SyncroAsset[]> {
  const all: SyncroAsset[] = [];
  let page = 1;
  while (true) {
    const r = await syncroFetch<SyncroListResponse<"assets", SyncroAsset>>(
      `/customer_assets`,
      { customer_id: customerId, page, per_page: 100 },
    );
    const batch = (r.assets ?? []) as SyncroAsset[];
    all.push(...batch);
    const totalPages = r.meta?.total_pages ?? 1;
    if (page >= totalPages || batch.length === 0) break;
    page++;
  }
  return all;
}

/**
 * Pull a single Syncro asset by ID (used for one-off refresh).
 */
export async function getAsset(id: number): Promise<SyncroAsset> {
  const r = await syncroFetch<{ asset: SyncroAsset }>(`/assets/${id}`);
  return r.asset;
}

/**
 * Connection-test helper: hits a tiny endpoint and returns true/false +
 * any error info, for the settings page status indicator.
 */
export async function testConnection(): Promise<
  { ok: true; sample: { customerCount?: number } } | { ok: false; error: string }
> {
  try {
    // /customers?per_page=1 is the cheapest way to verify auth + reach.
    const r = await syncroFetch<SyncroListResponse<"customers", SyncroCustomer>>(
      "/customers",
      { page: 1, per_page: 1 },
    );
    return {
      ok: true,
      sample: {
        customerCount: r.meta?.total_entries,
      },
    };
  } catch (e) {
    if (e instanceof SyncroError) {
      return { ok: false, error: `${e.message}${e.body ? ": " + JSON.stringify(e.body).slice(0, 300) : ""}` };
    }
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Best-effort name/contact extraction from a Syncro customer record. Used
 * when proposing TechOS client + contact rows during a sync.
 */
export function syncroCustomerDisplayName(c: SyncroCustomer): string {
  return (
    c.business_name ||
    c.business_then_name ||
    c.business_and_full_name ||
    [c.firstname, c.lastname].filter(Boolean).join(" ").trim() ||
    c.email ||
    `Syncro #${c.id}`
  );
}

export function syncroCustomerContactName(c: SyncroCustomer): string | null {
  const fullName = [c.firstname, c.lastname].filter(Boolean).join(" ").trim();
  return fullName || null;
}
