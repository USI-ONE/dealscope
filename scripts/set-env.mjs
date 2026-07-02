/**
 * Set a single Vercel env var across all scopes via the REST API.
 *
 *   node scripts/set-env.mjs AUTH_URL https://techos-gold.vercel.app
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [, , name, value] = process.argv;
if (!name || value === undefined) {
  console.error("Usage: node scripts/set-env.mjs <NAME> <VALUE>");
  process.exit(1);
}

const authJsonPath =
  process.platform === "win32"
    ? join(process.env.APPDATA ?? join(homedir(), "AppData/Roaming"), "com.vercel.cli/Data/auth.json")
    : join(homedir(), ".local/share/com.vercel.cli/auth.json");
const token = JSON.parse(readFileSync(authJsonPath, "utf8")).token;
const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function api(method, path, body) {
  const r = await fetch(
    `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${project.orgId}`,
    { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined },
  );
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}

// Wipe existing entries with this key.
const list = await api("GET", `/v10/projects/${project.projectId}/env`);
for (const e of (list.body.envs ?? []).filter((e) => e.key === name)) {
  await api("DELETE", `/v10/projects/${project.projectId}/env/${e.id}`);
}

const r = await api("POST", `/v10/projects/${project.projectId}/env`, {
  key: name,
  value,
  target: ["production", "preview", "development"],
  type: "encrypted",
});
console.log(`set ${name} (status ${r.status})`);
