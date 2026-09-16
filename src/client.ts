// Shared HTTP client for the Feedonomics Platform/Content REST APIs.
// Read-only by construction: `get()` only issues GET requests, and the one
// POST endpoint we wrap (`downloadExportData`) hardcodes `push: false` so it
// can never trigger a channel push or mutate account config.
const BASE_URL = process.env.FEEDONOMICS_BASE_URL ?? "https://meta.feedonomics.com/api.php";

function authHeaders(): Record<string, string> {
  const token = process.env.FEEDONOMICS_TOKEN;
  const apiKey = process.env.FEEDONOMICS_API_KEY;
  if (!token || !apiKey) {
    throw new Error(
      "Missing FEEDONOMICS_TOKEN and/or FEEDONOMICS_API_KEY environment variables."
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    "x-api-key": apiKey,
  };
}

export async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: authHeaders(),
  });
  return handle(res);
}

// Wraps the documented `run_parallel_export` endpoint with fixed,
// non-mutating parameters. `push` is always false, so this only returns
// data — it never sends anything to a downstream channel.
export async function downloadExportData(
  dbId: number,
  exportId: number,
  opts: { delimiter?: "tab" | "comma" | "pipe" | "semicolon"; rawData?: boolean } = {}
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/dbs/${dbId}/exports/${exportId}/run_parallel_export`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      delimiter: opts.delimiter ?? "comma",
      do_notify: false,
      fe_download: true,
      ignore_export_selector: false,
      no_transformers: opts.rawData ?? false,
      push: "false",
    }),
  });
  return handle(res);
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
    return handle(retry);
  }
  return handle(res);
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
