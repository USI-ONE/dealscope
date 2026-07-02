/**
 * Microsoft Graph email diagnostic.
 *
 * Run after configuring Mail.Send Application permission to verify:
 *   1. The client-credentials token can be obtained.
 *   2. The token actually carries Mail.Send in its `roles` claim
 *      (this is the most common failure — permission added but admin
 *      consent not granted).
 *   3. The configured INVITE_FROM_EMAIL mailbox accepts a sendMail
 *      from the app — sends a test email to a recipient you specify.
 *
 * Usage:
 *   pnpm tsx scripts/diagnose-graph-email.ts <recipient@example.com>
 *
 * Reads MS_GRAPH_TENANT_ID / CLIENT_ID / CLIENT_SECRET / INVITE_FROM_EMAIL
 * from .env.local.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const tenantId = process.env.MS_GRAPH_TENANT_ID;
const clientId = process.env.MS_GRAPH_CLIENT_ID;
const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
const fromEmail = process.env.INVITE_FROM_EMAIL;

const recipient = process.argv[2];

function fail(msg: string): never {
  console.error(`\n❌  ${msg}\n`);
  process.exit(1);
}

if (!tenantId) fail("MS_GRAPH_TENANT_ID is not set in .env.local.");
if (!clientId) fail("MS_GRAPH_CLIENT_ID is not set in .env.local.");
if (!clientSecret) fail("MS_GRAPH_CLIENT_SECRET is not set in .env.local.");
if (!fromEmail) fail("INVITE_FROM_EMAIL is not set in .env.local.");

console.log(`\nTenant:   ${tenantId}`);
console.log(`Client:   ${clientId}`);
console.log(`From:     ${fromEmail}`);
console.log(`Recipient: ${recipient ?? "(none — skipping send test)"}\n`);

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Not a JWT");
  const json = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(json);
}

async function main() {
  // ---- 1. Token request ------------------------------------------------
  console.log("→ Requesting Graph token...");
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId!,
        client_secret: clientSecret!,
        scope: "https://graph.microsoft.com/.default",
      }),
    },
  );
  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    fail(`Token request failed (${tokenRes.status}): ${txt}`);
  }
  const tokenJson = (await tokenRes.json()) as {
    access_token: string;
    expires_in: number;
  };
  console.log(
    `   ✓ Token obtained (expires in ${Math.round(tokenJson.expires_in / 60)} min)`,
  );

  // ---- 2. Decode + check `roles` --------------------------------------
  console.log("\n→ Decoding token to check granted application permissions...");
  const payload = decodeJwtPayload(tokenJson.access_token);
  const roles = (payload.roles as string[] | undefined) ?? [];
  console.log(`   App ID:    ${payload.appid}`);
  console.log(`   Audience:  ${payload.aud}`);
  console.log(
    `   Roles:     ${roles.length === 0 ? "(empty — NO permissions granted)" : roles.join(", ")}`,
  );

  if (!roles.includes("Mail.Send")) {
    console.log("");
    console.log(
      "❌  Mail.Send is NOT in the token's roles claim. This is why sendMail",
    );
    console.log("    returned 403 ErrorAccessDenied. Common fixes:");
    console.log("");
    console.log("    1. In Entra admin → App registrations → your TechOS app →");
    console.log(
      '       API permissions: confirm there is a row labelled "Mail.Send"',
    );
    console.log(
      '       under "Microsoft Graph" with TYPE = "Application" (NOT "Delegated").',
    );
    console.log(
      '    2. Look at the "Status" column. If it shows a yellow warning or',
    );
    console.log(
      '       "Not granted for [tenant]", click "Grant admin consent for [tenant]"',
    );
    console.log("       at the top of the permissions list.");
    console.log(
      "    3. Wait ~1–2 minutes for the new role to propagate, then re-run",
    );
    console.log("       this script. If `Mail.Send` appears in roles, the fix is in.");
    console.log("");
    process.exit(1);
  }
  console.log("   ✓ Mail.Send is in the token roles");

  // ---- 3. Test send ---------------------------------------------------
  if (!recipient) {
    console.log(
      "\n(Skipping send test — pass a recipient as argv[1] to test.)\n",
    );
    return;
  }
  console.log(`\n→ Sending test email from ${fromEmail} to ${recipient}...`);
  const sendRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail!)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: "TechOS Graph email diagnostic",
          body: {
            contentType: "Text",
            content:
              "This is a diagnostic email from scripts/diagnose-graph-email.ts. If you received it, Microsoft Graph email is working.",
          },
          toRecipients: [
            {
              emailAddress: { address: recipient, name: recipient },
            },
          ],
        },
        saveToSentItems: false,
      }),
    },
  );
  if (!sendRes.ok) {
    const txt = await sendRes.text();
    console.log(`   ✗ Send failed (${sendRes.status}): ${txt}`);
    console.log("");
    if (txt.includes("ErrorAccessDenied")) {
      console.log(
        "    The token has Mail.Send but Exchange refused the call. Possible causes:",
      );
      console.log(
        `    1. INVITE_FROM_EMAIL ("${fromEmail}") is not a real mailbox in this tenant.`,
      );
      console.log(
        "    2. Application Access Policy in Exchange restricts which mailboxes",
      );
      console.log(
        "       this app can send from. Check New-ApplicationAccessPolicy / Get-",
      );
      console.log("       ApplicationAccessPolicy in Exchange PowerShell.");
    }
    process.exit(1);
  }
  console.log(`   ✓ Send succeeded — check ${recipient}'s inbox.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
