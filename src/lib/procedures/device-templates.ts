/**
 * Default per-client device onboarding / offboarding procedure templates.
 *
 * These get seeded on demand from the client overview when a tech wants a
 * starter checklist for a new endpoint or a leaving endpoint. They're
 * meant as a sane baseline — the user is expected to customize the steps
 * per client after seeding (e.g. add SSO group names, conditional-access
 * policies, etc.).
 *
 * Step ids are stable strings so historical runs stay readable even if
 * the procedure list is later reordered.
 */
import type { ProcedureStep } from "@/db/schema";

export type DeviceProcedureTemplate = {
  title: string;
  kind: "device_onboarding" | "device_offboarding";
  description: string;
  scheduleNotes: string | null;
  steps: ProcedureStep[];
};

export const DEVICE_ONBOARDING_TEMPLATE: DeviceProcedureTemplate = {
  title: "Device onboarding (new endpoint)",
  kind: "device_onboarding",
  description:
    "Standard checklist for provisioning a new workstation, laptop, or kiosk and handing it to an end user. Run once per device. Tailor SSO/MDM steps to this client's identity stack.",
  scheduleNotes: "Run per new endpoint; not on a fixed cadence.",
  steps: [
    {
      id: "dev-on-asset-create",
      text: "Create hardware record in TechOS (serial, model, asset tag, assigned user).",
      hint: "Clients → this client → Hardware → Add. Capture serial from BIOS/sticker.",
    },
    {
      id: "dev-on-bios",
      text: "BIOS / firmware: latest version, set supervisor password, enable TPM + Secure Boot, disable USB boot.",
      hint: "Document supervisor password in 1Password under the client vault.",
    },
    {
      id: "dev-on-os-image",
      text: "Image with the approved Windows / macOS build for this client.",
      hint: "Confirm with the client's standard build (note in client docs).",
    },
    {
      id: "dev-on-domain-join",
      text: "Join to identity / domain (Entra ID, AD, or Jamf MDM).",
      hint: "Verify tenant ID matches client.identity.tenantId.",
    },
    {
      id: "dev-on-rmm",
      text: "Install Syncro RMM agent; confirm agent check-in in the Syncro asset view.",
    },
    {
      id: "dev-on-edr",
      text: "Install EDR agent (SentinelOne / Defender / configured stack); confirm device shows up in the EDR console.",
    },
    {
      id: "dev-on-autoelevate",
      text: "Install AutoElevate agent if this client has PAM. Verify it appears in the AutoElevate dashboard under the right company.",
      hint: "Check client.autoelevateStatus first — only deploy if expected.",
    },
    {
      id: "dev-on-backup",
      text: "Install backup agent if endpoint is in scope (per client backup strategy).",
    },
    {
      id: "dev-on-disk-encryption",
      text: "Enable disk encryption (BitLocker / FileVault). Escrow recovery key to Entra/Jamf.",
    },
    {
      id: "dev-on-os-update",
      text: "Run all pending OS updates; reboot until clean.",
    },
    {
      id: "dev-on-apps",
      text: "Install standard application baseline (browser, M365, Teams, Adobe Reader, 1Password, client-specific line-of-business apps).",
    },
    {
      id: "dev-on-mfa",
      text: "Walk user through MFA enrollment (Authenticator, FIDO2 key) at handoff.",
    },
    {
      id: "dev-on-handoff",
      text: "Hand off to user: capture sign-off, confirm assignedTo on hardware record, log a client event (kind: change).",
    },
  ],
};

export const DEVICE_OFFBOARDING_TEMPLATE: DeviceProcedureTemplate = {
  title: "Device offboarding (returning endpoint)",
  kind: "device_offboarding",
  description:
    "Standard checklist for retiring or repurposing an endpoint. Pair with the user offboarding procedure if the device is being collected because someone left.",
  scheduleNotes: "Run per retired endpoint; not on a fixed cadence.",
  steps: [
    {
      id: "dev-off-collect",
      text: "Collect device + peripherals from user. Verify serial against hardware record.",
    },
    {
      id: "dev-off-backup-user-data",
      text: "If retaining user data: copy Documents / Desktop / known browser profiles to retention share. Confirm OneDrive sync is current.",
    },
    {
      id: "dev-off-disable-rmm",
      text: "Uninstall / decommission Syncro RMM agent; mark the Syncro asset as retired.",
    },
    {
      id: "dev-off-disable-edr",
      text: "Remove from EDR console (SentinelOne / Defender).",
    },
    {
      id: "dev-off-autoelevate",
      text: "Remove the AutoElevate agent and de-register the host from the AutoElevate company.",
      hint: "Skip if client doesn't run AutoElevate.",
    },
    {
      id: "dev-off-backup-agent",
      text: "Remove backup agent. Confirm last successful backup retention per client policy.",
    },
    {
      id: "dev-off-mdm-leave",
      text: "Unenroll from MDM / Entra / AD. Disable + delete the device object in the identity console.",
    },
    {
      id: "dev-off-licenses",
      text: "Reclaim per-device licenses (M365 add-ons, AutoCAD, line-of-business). Update license seats in TechOS.",
    },
    {
      id: "dev-off-wipe",
      text: "Wipe disk (BitLocker key destroy + reformat, or DBAN for non-encrypted drives). Verify wipe completed.",
    },
    {
      id: "dev-off-asset-tag",
      text: "Remove client asset tag; apply USI inventory sticker if pulling into our pool.",
    },
    {
      id: "dev-off-status",
      text: "Update TechOS hardware status to 'retired' (or 'in_pool' if repurposing). Clear assigned user.",
    },
    {
      id: "dev-off-event",
      text: "Log a client event (kind: change) describing the retirement, including final disposition.",
    },
    {
      id: "dev-off-disposal",
      text: "Dispose / repurpose: hand-off to e-waste vendor with chain-of-custody form, OR add back to internal pool, OR ship to next assignee.",
    },
    {
      id: "dev-off-document",
      text: "Confirm hardware record reflects final state. Close out the procedure run with disposal notes.",
    },
  ],
};

export const DEVICE_PROCEDURE_TEMPLATES: DeviceProcedureTemplate[] = [
  DEVICE_ONBOARDING_TEMPLATE,
  DEVICE_OFFBOARDING_TEMPLATE,
];
