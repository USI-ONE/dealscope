/**
 * Push env vars to Vercel using --value flag (no stdin race conditions).
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const VARS = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "AUTH_SECRET",
  "AUTH_URL",
  "AUTH_DEBUG",
  "AUTH_MICROSOFT_ENTRA_ID_ID",
  "AUTH_MICROSOFT_ENTRA_ID_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
  "TECHOS_OWNER_EMAILS",
  "TECHOS_DEFAULT_ORG_NAME",
  "TECHOS_DEFAULT_ORG_SLUG",
];

const SCOPES = ["production", "development"]; // skip preview (needs branch)

const envText = readFileSync(".env.local", "utf8");
const map = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) map[m[1]] = m[2];
}

function run(cmd, args) {
  return new Promise((resolve) => {
    // shell:true required on Windows for .CMD/.cmd files. Means we can't pass
    // the secret value as an array arg; serialize it carefully here. Spaces
    // and most chars are safe inside double quotes; escape `"` and `\`.
    const safe = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const cmdline = `${cmd} ${args.map(safe).join(" ")}`;
    const p = spawn(cmdline, { stdio: ["ignore", "pipe", "pipe"], shell: true });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out, err }));
    p.on("error", (e) => resolve({ code: -1, out: "", err: e.message }));
  });
}

// Resolve vercel.cmd path on Windows; on POSIX `vercel` is enough.
function vercelBin() {
  if (process.platform === "win32") {
    return "C:\\Users\\CWall\\AppData\\Local\\pnpm\\vercel.CMD";
  }
  return "vercel";
}

async function main() {
  for (const name of VARS) {
    const value = map[name];
    if (!value || value.trim() === "" || /YOUR_TENANT_ID/.test(value)) {
      console.log(`skip ${name} (empty / placeholder)`);
      continue;
    }
    for (const scope of SCOPES) {
      await run(vercelBin(), ["env", "rm", name, scope, "--yes"]);
      const r = await run(vercelBin(), ["env", "add", name, scope, "--value", value, "--yes"]);
      const ok = r.code === 0;
      const msg = ok ? "set" : `FAIL: ${r.err.split("\n").filter((l) => l.trim()).slice(-2).join(" / ") || r.out}`;
      console.log(`${name} (${scope}): ${msg}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
