-- Add 'unifi_network' to the vendor_connection_kind enum so we can
-- store credentials for the UniFi Site Manager API.
--
-- Auth: X-API-KEY header against https://api.ui.com (currently the EA
-- endpoints at /ea/sites, /ea/hosts, /ea/devices). One key has access
-- to every UniFi console + site under the owning Ubiquiti account, so
-- one connection row per organization is the right shape — site →
-- TechOS client mapping happens via vendor_client_mappings, same as
-- the other vendor connectors.

ALTER TYPE "public"."vendor_connection_kind"
  ADD VALUE IF NOT EXISTS 'unifi_network';
