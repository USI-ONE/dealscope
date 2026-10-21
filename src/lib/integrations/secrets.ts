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
