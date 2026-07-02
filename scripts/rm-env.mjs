/**
 * Remove a Vercel env var across all scopes via the REST API.
 *
 *   node scripts/rm-env.mjs AUTH_DEBUG
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/rm-env.mjs <ENV_VAR_NAME>");
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

async function api(method, path) {
  const r = await fetch(
    `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${project.orgId}`,
    { method, headers },
  );
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}

const list = await api("GET", `/v10/projects/${project.projectId}/env`);
const matches = (list.body.envs ?? []).filter((e) => e.key === target);
if (matches.length === 0) {
  console.log(`No env vars named ${target} found.`);
  process.exit(0);
}
for (const e of matches) {
  await api("DELETE", `/v10/projects/${project.projectId}/env/${e.id}`);
  console.log(`Deleted ${e.key} (${e.target?.join(",")})`);
}
