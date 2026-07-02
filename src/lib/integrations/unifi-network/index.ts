/**
 * UniFi Network — Site Manager API connector.
 *
 * Ubiquiti's cloud-hosted Site Manager API aggregates every UniFi
 * console (UDM Pro / SE / Cloud Gateway / CloudKey) under one Ubiquiti
 * account and exposes each "site" (the UniFi controller's notion of a
 * tenant) plus its devices, clients, networks, etc. The API is in
 * Early Access — base URL `https://api.ui.com/ea/...` — and uses an
 * X-API-KEY header for auth.
 *
 *   developer.ui.com/site-manager-api/
 *   POST  https://account.ui.com  → user gets API key from profile menu
 *   GET   https://api.ui.com/ea/sites
 *   GET   https://api.ui.com/ea/sites/{siteId}/devices
 *   GET   https://api.ui.com/ea/hosts
 *
 * The UniFi → TechOS client mapping happens via vendor_client_mappings
 * keyed on the site's UID. Each UniFi site name typically already
 * encodes the client name ("Collision Leaders — Warrensburg"), so a
 * fuzzy name match seeds it during bootstrap.
 *
 * What we emit per site as snapshot rows (so they show up in the
 * standard integrations dashboard + reconciliation):
 *
 *   productSku  productName
 *   ──────────  ──────────────────────────────────
 *   unifi_site                UniFi Site                              seats = 1
 *   unifi_access_point        UniFi Access Point                      seats = N APs
 *   unifi_switch              UniFi Switch                            seats = N switches
 *   unifi_gateway             UniFi Gateway / Router                  seats = N gateways
 *   unifi_other_device        UniFi Other Device                      seats = N (cameras, doorbells, etc.)
 *   unifi_total_device        UniFi Managed Device                    seats = total
 *
 * Config shape (configJson):
 *
 *   {
 *     apiKey: "<X-API-KEY value from unifi.ui.com profile menu>",
 *     baseUrl?: "https://api.ui.com",      // override only if Ubiquiti moves it
 *   }
 *
 * Device-detail sync (model, MAC, IP, firmware) is intentionally NOT
 * in listSeats. Detailed per-device records belong in the `hardware`
 * table; a separate sync action will pull /sites/{id}/devices and
 * upsert there. This connector's listSeats stays cheap — one call to
 * /sites + one call to /devices, no per-site fan-out.
 */
import { z } from "zod";
import {
  ConnectorAuthError,
  ConnectorConfigError,
  type ConnectionTestResult,
  type VendorConnector,
  type VendorConnectorFactory,
  type VendorSeatSnapshot,
} from "../connector";

const configSchema = z.object({
  apiKey: z.string().min(1, "UniFi API key is required"),
  baseUrl: z.string().url().default("https://api.ui.com"),
});

type UnifiSite = {
  id: string;
  hostId?: string;
  meta?: {
    name?: string;
    desc?: string;
    timezone?: string;
  };
  // Some shapes return `name` at top level; some at meta.name. Tolerate both.
  name?: string;
};

type UnifiDevice = {
  id?: string;
  siteId?: string;
  hostId?: string;
  mac?: string;
  ip?: string;
  name?: string;
  model?: string;
  /** UniFi device family — typical values: 'uap' (access point), 'usw'
   *  (switch), 'ugw' / 'udm' / 'ucg' (gateway/router), 'uph' (phone),
   *  'uck' (CloudKey), 'ufp' (camera), etc. The /ea/devices endpoint
   *  returns a `type` field that we map to product SKUs. */
  type?: string;
  state?: number | string;
  version?: string;
  firmwareVersion?: string;
  uptime?: number;
};

type UnifiHost = {
  id: string;
  hostName?: string;
  userData?: {
    fullName?: string;
    email?: string;
  };
  reportedState?: {
    name?: string;
    hostname?: string;
    ip?: string;
    version?: string;
    consoleGroupMembers?: Array<unknown>;
  };
};

function classifyDevice(type: string | undefined): string {
  const t = (type ?? "").toLowerCase();
  if (t.startsWith("uap")) return "unifi_access_point";
  if (t.startsWith("usw")) return "unifi_switch";
  if (t.startsWith("ugw") || t.startsWith("udm") || t.startsWith("ucg") || t.startsWith("uxg"))
    return "unifi_gateway";
  return "unifi_other_device";
}

const PRODUCT_LABEL: Record<string, string> = {
  unifi_access_point: "UniFi Access Point",
  unifi_switch: "UniFi Switch",
  unifi_gateway: "UniFi Gateway / Router",
  unifi_other_device: "UniFi Other Device",
};

export class UnifiNetworkConnector implements VendorConnector {
  readonly kind = "unifi_network" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(rawConfig: Record<string, unknown>) {
    const parsed = configSchema.safeParse(rawConfig);
    if (!parsed.success) {
      throw new ConnectorConfigError(
        "UniFi connector needs an apiKey. Get one at unifi.ui.com → profile → API Keys → Create.",
      );
    }
    this.apiKey = parsed.data.apiKey;
    this.baseUrl = parsed.data.baseUrl.replace(/\/+$/, "");
  }

  private async req<T>(pathName: string): Promise<T> {
    const r = await fetch(`${this.baseUrl}${pathName}`, {
      headers: {
        "X-API-KEY": this.apiKey,
        Accept: "application/json",
      },
    });
    if (r.status === 401 || r.status === 403) {
      const body = await r.text().catch(() => "");
      throw new ConnectorAuthError(
        `UniFi ${pathName} auth rejected (${r.status}): ${body.slice(0, 200)}`,
      );
    }
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`UniFi ${pathName} → HTTP ${r.status}: ${body.slice(0, 200)}`);
    }
    return (await r.json()) as T;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // /ea/hosts is the smallest call — returns the list of UniFi
      // consoles the API key can see (typically 1-N CloudKeys / UDMs).
      const data = await this.req<{ data?: UnifiHost[] }>("/ea/hosts");
      const hosts = data.data ?? [];
      // Also touch /sites so the user sees that too.
      const sitesResp = await this.req<{ data?: UnifiSite[] }>(
        "/ea/sites?pageSize=100",
      );
      const sites = sitesResp.data ?? [];
      return {
        ok: true,
        message: `Connected — ${hosts.length} UniFi console${hosts.length === 1 ? "" : "s"}, ${sites.length} site${sites.length === 1 ? "" : "s"} visible.`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listSeats(): Promise<VendorSeatSnapshot[]> {
    // Pull all sites + all devices once, then bucket in memory.
    const sitesResp = await this.req<{ data?: UnifiSite[] }>(
      "/ea/sites?pageSize=500",
    );
    const sites = sitesResp.data ?? [];
    const devicesResp = await this.req<{ data?: UnifiDevice[] }>(
      "/ea/devices?pageSize=5000",
    );
    const devices = devicesResp.data ?? [];

    const out: VendorSeatSnapshot[] = [];

    // Pre-bucket devices by site for O(1) lookup.
    const devicesBySite = new Map<string, UnifiDevice[]>();
    for (const d of devices) {
      if (!d.siteId) continue;
      devicesBySite.set(d.siteId, [
        ...(devicesBySite.get(d.siteId) ?? []),
        d,
      ]);
    }

    for (const site of sites) {
      const siteName = site.meta?.name ?? site.name ?? `Site ${site.id}`;
      const ourDevices = devicesBySite.get(site.id) ?? [];

      // 1) One "unifi_site" snapshot per site so the reconciliation
      //    view shows USI's controller footprint at a glance.
      out.push({
        vendorClientIdentifier: site.id,
        vendorClientName: siteName,
        productSku: "unifi_site",
        productName: "UniFi Site",
        seats: 1,
      });

      // 2) Per-family device counts.
      const familyCounts = new Map<string, number>();
      for (const d of ourDevices) {
        const family = classifyDevice(d.type);
        familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
      }
      for (const [family, count] of familyCounts) {
        out.push({
          vendorClientIdentifier: site.id,
          vendorClientName: siteName,
          productSku: family,
          productName: PRODUCT_LABEL[family] ?? family,
          seats: count,
        });
      }

      // 3) Total managed devices for the family-agnostic rollup.
      if (ourDevices.length > 0) {
        out.push({
          vendorClientIdentifier: site.id,
          vendorClientName: siteName,
          productSku: "unifi_total_device",
          productName: "UniFi Managed Device",
          seats: ourDevices.length,
        });
      }
    }

    return out;
  }
}

export const unifiNetworkConnectorFactory: VendorConnectorFactory = ({
  config,
}) => new UnifiNetworkConnector(config);
