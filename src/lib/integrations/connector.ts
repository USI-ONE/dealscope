/**
 * VendorConnector — the interface every multi-vendor integration
 * implements so the sync runner, reconciliation report, and admin UI
 * can treat each SaaS uniformly.
 *
 * To add a new connector:
 *   1. Add a kind to vendorConnectionKindEnum in
 *      src/db/schema/integrations.ts (+ migration).
 *   2. Create src/lib/integrations/<kind>/index.ts that default-exports
 *      a `VendorConnectorFactory` matching this interface.
 *   3. Register it in src/lib/integrations/registry.ts.
 *
 * Connectors are stateless: they receive their config + a fresh fetch
 * function, then return the data the orchestrator needs. They never
 * write to the database directly — the sync runner does that.
 */
import type { VendorConnectionKind } from "@/db/schema";

/**
 * A single seat / asset / endpoint count reported by a vendor for one
 * of their customers, for one of their products.
 *
 * The orchestrator persists each of these as a row in
 * vendor_seat_snapshots and (when a client mapping exists) attributes
 * them to a TechOS client.
 */
export type VendorSeatSnapshot = {
  /** Vendor's identifier for the customer / tenant. */
  vendorClientIdentifier: string;
  /** Vendor's display name for the customer. */
  vendorClientName: string;
  /** Optional URL deep-linking into the vendor's portal for this
   *  customer. Surfaced in the integrations UI. */
  vendorClientUrl?: string;
  /** Vendor's SKU for the product being measured. Lowercase + stable;
   *  this is what we'll join on. */
  productSku: string;
  /** Friendly product name for display ("Endpoint Detection &
   *  Response", "Email Security"). */
  productName: string;
  /** Number of seats / endpoints / mailboxes the vendor reports. */
  seats: number;
  /** Optional cost-per-seat (cents). Only set when the vendor's API
   *  exposes pricing; many don't. */
  costPerSeatCents?: number | null;
  /** Optional period this snapshot covers. NULL = current state. */
  periodStart?: Date | null;
  periodEnd?: Date | null;
  /** Raw API row for debugging. Truncate sensibly in the connector. */
  raw?: unknown;
};

/**
 * Result of a connection-test attempt.
 */
export type ConnectionTestResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Per-connector instance. Holds the validated config + the methods the
 * orchestrator calls.
 */
export interface VendorConnector {
  /** Identifies which kind this is. Used for logging + UI badges. */
  readonly kind: VendorConnectionKind;
  /** Lightweight credential check that hits the smallest endpoint
   *  available on the vendor's API — typically /me or /tenant. */
  testConnection(): Promise<ConnectionTestResult>;
  /** Pull current seat counts from the vendor. Called by the sync
   *  runner. May be slow — should not run inside a request handler;
   *  use the cron route or a server action with a timeout extension. */
  listSeats(): Promise<VendorSeatSnapshot[]>;
}

/**
 * Factory function — every connector module exports one of these.
 * Receives the connection row (with its config_json validated) and
 * returns a VendorConnector ready to call.
 */
export type VendorConnectorFactory = (input: {
  organizationId: string;
  connectionId: string;
  config: Record<string, unknown>;
}) => VendorConnector;

/**
 * Common error class connectors throw when credentials are missing or
 * malformed. The orchestrator catches this and sets status=not_configured
 * rather than status=failed.
 */
export class ConnectorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorConfigError";
  }
}

/**
 * Standard error connectors throw when the vendor's API rejects the
 * credentials (HTTP 401/403). Surfaced as status=failed with the
 * vendor's error body in last_sync_message.
 */
export class ConnectorAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorAuthError";
  }
}
