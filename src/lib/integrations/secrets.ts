/** Config keys that hold credentials — never sent to the browser. */
export function isSecretKey(key: string): boolean {
  return /key|secret|password|token|credential/i.test(key);
}

/** Config for the browser: secrets blanked, plus which ones are saved. */
export function maskConfig(config: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const savedSecrets: string[] = [];
  for (const [k, v] of Object.entries(config)) {
    if (isSecretKey(k)) {
      out[k] = "";
      if (typeof v === "string" && v) savedSecrets.push(k);
    } else out[k] = v;
  }
  return { config: out, savedSecrets };
}

/** On save, a blank secret means "keep the stored one". */
export function mergeSecrets(incoming: Record<string, unknown>, existing: Record<string, unknown>) {
  const out = { ...incoming };
  for (const [k, v] of Object.entries(incoming)) {
    if (isSecretKey(k) && (v === "" || v == null) && typeof existing[k] === "string" && existing[k]) out[k] = existing[k];
  }
  return out;
}

/**
 * URL-ish config fields (base URLs, hosts, endpoints) the server will call:
 * https only, a real public hostname — no IP literals, localhost or
 * internal names — so a connector can't be aimed at internal services.
 * Returns an error message, or null when every URL field is acceptable.
 */
export function unsafeUrlField(config: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(config)) {
    if (!/url|host|endpoint/i.test(k) || typeof v !== "string" || !v.trim()) continue;
    let u: URL;
    try {
      u = new URL(/^[a-z]+:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`);
    } catch {
      return `${k} isn't a valid URL`;
    }
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:") return `${k} must use https`;
    if (
      /^[\d.]+$/.test(host) ||
      host.includes(":") ||
      host === "localhost" ||
      !host.includes(".") ||
      /\.(local|internal|localhost|lan|home|corp)$/.test(host)
    ) {
      return `${k} must be a public hostname`;
    }
  }
  return null;
}
