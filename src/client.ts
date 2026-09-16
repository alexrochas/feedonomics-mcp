// Shared HTTP client for the Feedonomics internal web-app API (see auth.ts).
// Read-only by construction: `sessionGet()` only issues GET requests, and
// the one POST endpoint wrapped (`downloadExportData`) hardcodes
// `push: false` so it can never trigger a channel push or mutate config.
const BASE_URL = process.env.FEEDONOMICS_BASE_URL ?? "https://meta.feedonomics.com/api.php";

// Wraps the documented `run_parallel_export` endpoint with fixed,
// non-mutating parameters. `push` is always false, so this only returns
// data — it never sends anything to a downstream channel. Uses session auth
// (see sessionGet below) since real Bearer/x-api-key access isn't set up yet.
export async function downloadExportData(
  dbId: number,
  exportId: number,
  opts: { delimiter?: "tab" | "comma" | "pipe" | "semicolon"; rawData?: boolean } = {}
): Promise<unknown> {
  const { getSessionAuth, silentRelogin } = await import("./auth.js");
  const body = JSON.stringify({
    delimiter: opts.delimiter ?? "comma",
    do_notify: false,
    fe_download: true,
    ignore_export_selector: false,
    no_transformers: opts.rawData ?? false,
    push: "false",
  });
  const path = `/dbs/${dbId}/exports/${exportId}/run_parallel_export`;
  const post = (cookie: string, xsrf: string) =>
    fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { Cookie: cookie, "X-XSRF-TOKEN": xsrf, "Content-Type": "application/json", Accept: "application/json" },
      body,
    });

  const { cookie, xsrf } = await getSessionAuth();
  const res = await post(cookie, xsrf);
  if (res.status === 401) {
    await silentRelogin();
    const fresh = await getSessionAuth();
    return redactSecrets(await handle(await post(fresh.cookie, fresh.xsrf)));
  }
  return redactSecrets(await handle(res));
}

// ponytail: stopgap auth for the internal meta.feedonomics.com web-app API
// (session cookie + XSRF token), used until real Platform API access
// (Bearer + x-api-key via the 2FA /login flow) is granted. Undocumented,
// fragile — breaks whenever the browser session expires. GET-only, same as
// the documented client above. Session is obtained/refreshed via auth.ts
// (see feedonomics_login_start / feedonomics_login_verify tools).
export async function sessionGet(path: string): Promise<unknown> {
  const { getSessionAuth, silentRelogin } = await import("./auth.js");
  const { cookie, xsrf } = await getSessionAuth();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: { Cookie: cookie, "X-XSRF-TOKEN": xsrf, Accept: "application/json" },
  });
  if (res.status === 401) {
    await silentRelogin();
    const { cookie: freshCookie, xsrf: freshXsrf } = await getSessionAuth();
    const retry = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers: { Cookie: freshCookie, "X-XSRF-TOKEN": freshXsrf, Accept: "application/json" },
    });
    return redactSecrets(await handle(retry));
  }
  return redactSecrets(await handle(res));
}

// Any object key matching this list gets its value replaced before the data
// ever reaches the tool response — Feedonomics' export/import list endpoints
// return live SFTP credentials (username/password, sometimes private keys)
// inline, which must never land in a chat transcript.
const SECRET_KEYS = /^(password|private_key|private_key_pass|secret|client_secret|api_key|access_token|refresh_token|token)$/i;

function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactSecrets) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        SECRET_KEYS.test(k) && v ? [k, "[REDACTED]"] : [k, redactSecrets(v)]
      )
    ) as T;
  }
  return value;
}

async function handle(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) {
    const rateLimit = res.headers.get("X-Rate-Limit-Group");
    const reset = res.headers.get("X-Rate-Limit-Reset");
    const suffix = rateLimit ? ` (rate-limit group: ${rateLimit}, resets: ${reset})` : "";
    throw new Error(`Feedonomics API ${res.status}: ${text}${suffix}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
