/**
 * Push env vars to Vercel via the REST API directly (no CLI).
 *
 * Reads token from %APPDATA%/com.vercel.cli/Data/auth.json,
 * project + team ids from .vercel/project.json,
 * key=value pairs from .env.local.
 *
 * For each key:
 *   1. List existing envs, delete any matching key in any of our target scopes.
 *   2. POST /v10/projects/:id/env with target = ["production","preview","development"]
 *
 * AUTH_URL gets a hardcoded production-safe value override
 * (.env.local has http://localhost:3000 for dev, prod must be the canonical URL).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROD_URL = "https://techos-gold.vercel.app";

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
  "ANTHROPIC_API_KEY",
  "CRON_SECRET",
  "MS_GRAPH_TENANT_ID",
  "MS_GRAPH_CLIENT_ID",
  "MS_GRAPH_CLIENT_SECRET",
  "INVITE_FROM_EMAIL",
];

// Auth.js v5 expects sensitive values as encrypted; non-sensitive can be plain.
// We just use "encrypted" for everything to be safe.
const TARGETS = ["production", "preview", "development"];

const authJsonPath =
  process.platform === "win32"
    ? join(process.env.APPDATA ?? join(homedir(), "AppData/Roaming"), "com.vercel.cli/Data/auth.json")
    : join(homedir(), ".local/share/com.vercel.cli/auth.json");

const token = JSON.parse(readFileSync(authJsonPath, "utf8")).token;
if (!token) throw new Error("No Vercel token found");

const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
const projectId = project.projectId;
const teamId = project.orgId;
if (!projectId || !teamId) throw new Error("Missing projectId/orgId in .vercel/project.json");

const envText = readFileSync(".env.local", "utf8");
const map = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) map[m[1]] = m[2];
}

// Override AUTH_URL for production-safe value.
map["AUTH_URL"] = PROD_URL;

const baseUrl = `https://api.vercel.com`;
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const teamQuery = `?teamId=${encodeURIComponent(teamId)}`;

async function api(method, path, body) {
  const url = `${baseUrl}${path}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(teamId)}`;
  const r = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: r.status, body: json };
}

async function listEnv() {
  const r = await api("GET", `/v10/projects/${projectId}/env`);
  if (r.status !== 200) throw new Error(`listEnv failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.envs ?? [];
}

async function deleteEnv(id) {
  const r = await api("DELETE", `/v10/projects/${projectId}/env/${id}`);
  if (r.status !== 200 && r.status !== 204 && r.status !== 404) {
    throw new Error(`deleteEnv ${id} failed: ${r.status} ${JSON.stringify(r.body)}`);
  }
}

async function createEnv(key, value) {
  const r = await api("POST", `/v10/projects/${projectId}/env`, {
    key,
    value,
    target: TARGETS,
    type: "encrypted",
  });
  if (r.status !== 200 && r.status !== 201) {
    throw new Error(`createEnv ${key} failed: ${r.status} ${JSON.stringify(r.body)}`);
  }
}

async function main() {
  // 1. Wipe all our keys to start clean.
  const existing = await listEnv();
  for (const e of existing) {
    if (VARS.includes(e.key)) {
      await deleteEnv(e.id);
      console.log(`deleted ${e.key} (${e.target?.join(",")})`);
    }
  }
  // 2. Create fresh.
  for (const key of VARS) {
    const value = map[key];
    if (!value || value.trim() === "" || /YOUR_TENANT_ID/.test(value)) {
      console.log(`skip ${key} (empty / placeholder)`);
      continue;
    }
    await createEnv(key, value);
    console.log(`set ${key} (len=${value.length})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
