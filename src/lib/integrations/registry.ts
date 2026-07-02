/**
 * Connector registry. Maps a vendor_connection_kind enum value to the
 * factory function that builds an instance.
 *
 * Adding a new connector? Implement it in
 * src/lib/integrations/<kind>/index.ts (default export a
 * VendorConnectorFactory), then add a row here.
 */
import type { VendorConnectionKind } from "@/db/schema";
import type { VendorConnectorFactory } from "./connector";
import { liongardConnectorFactory } from "./liongard";
import { bitdefenderConnectorFactory } from "./bitdefender";
import { acronisConnectorFactory } from "./acronis";
import { titanhqConnectorFactory } from "./titanhq";
import { syncroConnectorFactory } from "./syncro";
import { ingramMicroConnectorFactory } from "./ingram-micro";
import { unifiNetworkConnectorFactory } from "./unifi-network";

export const CONNECTOR_REGISTRY: Partial<
  Record<VendorConnectionKind, VendorConnectorFactory>
> = {
  syncro: syncroConnectorFactory,
  liongard: liongardConnectorFactory,
  bitdefender_gravityzone: bitdefenderConnectorFactory,
  acronis_cyber_cloud: acronisConnectorFactory,
  titanhq: titanhqConnectorFactory,
  ingram_micro: ingramMicroConnectorFactory,
  unifi_network: unifiNetworkConnectorFactory,
  // huntress, threatlocker, datto_rmm, microsoft_csp: not yet
  // implemented. The integrations dashboard surfaces these as
  // "coming soon".
};

/**
 * Convenience: get a factory for a kind, throwing a clear error if no
 * implementation exists yet.
 */
export function getConnectorFactory(
  kind: VendorConnectionKind,
): VendorConnectorFactory {
  const f = CONNECTOR_REGISTRY[kind];
  if (!f) {
    throw new Error(
      `No connector implementation registered for kind "${kind}".`,
    );
  }
  return f;
}

/**
 * Which kinds have factories registered. Used by the UI to decide
 * whether to show a "Configure" button or "Coming soon".
 */
export const IMPLEMENTED_KINDS: VendorConnectionKind[] = (
  Object.keys(CONNECTOR_REGISTRY) as VendorConnectionKind[]
).filter((k): k is VendorConnectionKind => CONNECTOR_REGISTRY[k] !== undefined);
