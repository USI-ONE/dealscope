/**
 * Liongard connector.
 *
 * Liongard exposes a REST API per MSP tenant. For USI's purposes the
 * relevant data is:
 *
 *   • Environments — each Liongard environment maps 1:1 to a TechOS
 *     client. The environment count is the unit Liongard bills USI on.
 *   • Inspectors per environment — gives us visibility (which systems
 *     Liongard is watching at each client).
 *
 * For billing reconciliation we report one snapshot per environment:
 *
 *     productSku   = "liongard_environment"
 *     productName  = "Liongard Environment"
 *     seats        = 1
 *
 * For visibility we also report inspector counts:
 *
 *     productSku   = "liongard_inspector_<type>"
 *     productName  = "Liongard Inspector — <type>"
 *     seats        = N (count of that inspector type at that env)
 *
 * The reconciliation report rolls the "liongard_environment" SKU
 * straight against billables; the inspector rows are purely
 * informational.
 *
 * Config shape (configJson):
 *
 *   {
 *     baseUrl: "https://<instance>.app.liongard.com/api/v1",
 *     accessKeyId: "<from Liongard → Account Settings → Access Tokens>",
 *     accessKeySecret: "<shown once on token creation>"
 *   }
 *
 * Auth: Liongard's REST API uses a custom header `X-ROAR-API-KEY` whose
 * value is the base64 encoding of `accessKeyId:accessKeySecret` (per
 * https://docs.liongard.com/reference/authentication). The well-known
 * `Authorization: Bearer ...` flow does NOT work — Liongard's parser
 * rejects it as "Malformed authorization header".
 *
 * URL gotcha: every collection endpoint must end with a trailing slash.
 * Liongard 301-redirects `/environments` → `/environments/` and Node's
 * fetch strips the custom auth header on redirect, so requests without
 * the slash fail with "Session appears to be invalid".
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
  baseUrl: z.string().url().describe("Liongard API base URL"),
  accessKeyId: z.string().min(1),
  accessKeySecret: z.string().min(1),
});

type LiongardEnvironment = {
  ID: number;
  Title?: string;
  Name?: string;
  ServiceProviderID?: number;
  ShortName?: string | null;
  Description?: string | null;
  Status?: number;
  Visible?: boolean;
  IsCustomerView?: boolean;
  ExpiresOn?: string | null;
};

type LiongardInspectorInstance = {
  ID: number;
  EnvironmentID: number;
  SystemID: number;
  Title?: string;
  StatusID?: number;
};

type LiongardSystem = {
  ID: number;
  Title: string;
  Slug?: string;
};

export class LiongardConnector implements VendorConnector {
  readonly kind = "liongard" as const;
  private readonly baseUrl: string;
  private readonly headerValue: string;

  constructor(rawConfig: Record<string, unknown>) {
    const parsed = configSchema.safeParse(rawConfig);
    if (!parsed.success) {
      throw new ConnectorConfigError(
        `Liongard config invalid: ${parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
      );
    }
    // Strip trailing slashes from the base URL; we add a leading `/`
    // and a trailing `/` to every path on the request side.
    this.baseUrl = parsed.data.baseUrl.replace(/\/+$/, "");
    this.headerValue = Buffer.from(
      `${parsed.data.accessKeyId}:${parsed.data.accessKeySecret}`,
    ).toString("base64");
  }

  /**
   * Per https://docs.liongard.com/reference/authentication, Liongard's
   * REST API uses a single custom header `X-ROAR-API-KEY` whose value
   * is base64(accessKeyId + ":" + accessKeySecret).
   *
   * IMPORTANT: paths MUST end with a trailing slash. Without it
   * Liongard returns a 301 to the slashed URL, and `fetch` strips the
   * X-ROAR-API-KEY header on the redirect (Node treats custom-named
   * auth headers as sensitive), which lands the call on the slashed
   * path WITHOUT auth → "Session appears to be invalid" 401.
   */
  private async req<T>(pathName: string): Promise<T> {
    const slashed = pathName.endsWith("/") ? pathName : `${pathName}/`;
    const url = `${this.baseUrl}${slashed}`;
    const r = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-ROAR-API-KEY": this.headerValue,
      },
    });
    if (r.status === 401 || r.status === 403) {
      const text = await r.text().catch(() => "");
      throw new ConnectorAuthError(
        `Liongard auth rejected (${r.status}): ${text.slice(0, 200)}`,
      );
    }
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(
        `Liongard ${slashed} → HTTP ${r.status}: ${text.slice(0, 200)}`,
      );
    }
    return (await r.json()) as T;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const envs = await this.req<LiongardEnvironment[]>("/environments");
      return {
        ok: true,
        message: `Connected — ${envs.length} environment${envs.length === 1 ? "" : "s"} visible`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message };
    }
  }

  async listSeats(): Promise<VendorSeatSnapshot[]> {
    const [envs, instances, systems] = await Promise.all([
      this.req<LiongardEnvironment[]>("/environments"),
      this.req<LiongardInspectorInstance[]>("/inspectorInstances"),
      this.req<LiongardSystem[]>("/systems"),
    ]);

    const systemById = new Map(systems.map((s) => [s.ID, s] as const));

    const envRows: VendorSeatSnapshot[] = envs
      .filter((e) => !e.IsCustomerView)
      .map((e) => ({
        vendorClientIdentifier: String(e.ID),
        vendorClientName: e.Name ?? e.Title ?? `Environment ${e.ID}`,
        vendorClientUrl: `${this.baseUrl.replace(/\/api\/v1\/?$/, "")}/environments/${e.ID}`,
        productSku: "liongard_environment",
        productName: "Liongard Environment",
        seats: 1,
      }));

    // Per-environment per-inspector-type breakdown for visibility.
    const byEnvSystem = new Map<string, number>();
    for (const inst of instances) {
      const key = `${inst.EnvironmentID}::${inst.SystemID}`;
      byEnvSystem.set(key, (byEnvSystem.get(key) ?? 0) + 1);
    }
    const inspectorRows: VendorSeatSnapshot[] = [];
    const envById = new Map(envs.map((e) => [e.ID, e] as const));
    for (const [key, count] of byEnvSystem.entries()) {
      const [envIdStr, sysIdStr] = key.split("::");
      const envId = parseInt(envIdStr, 10);
      const sysId = parseInt(sysIdStr, 10);
      const env = envById.get(envId);
      if (!env || env.IsCustomerView) continue;
      const sys = systemById.get(sysId);
      const slug = (sys?.Slug ?? `system_${sysId}`).toLowerCase();
      inspectorRows.push({
        vendorClientIdentifier: String(envId),
        vendorClientName: env.Name ?? env.Title ?? `Environment ${envId}`,
        productSku: `liongard_inspector_${slug}`,
        productName: `Liongard Inspector — ${sys?.Title ?? slug}`,
        seats: count,
      });
    }

    return [...envRows, ...inspectorRows];
  }
}

export const liongardConnectorFactory: VendorConnectorFactory = ({ config }) =>
  new LiongardConnector(config);
