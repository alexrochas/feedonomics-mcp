import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const STATE_DIR = path.join(homedir(), ".feedonomics-mcp");
const STATE_FILE = path.join(STATE_DIR, "storage-state.json");
const CREDENTIALS_FILE = path.join(homedir(), ".feedonomics.env");
const LOGIN_URL = "https://auth.feedonomics.com/login";

// ponytail: plain env file instead of 1Password — the org's session/lock
// policy made `op read` unreliable enough (repeated app-authorization
// prompts, hangs) to not be worth it for a personal read-only tool.
// Upgrade path: swap this for a 1Password Service Account token if that
// friction gets resolved.
async function readCredentials(): Promise<{ username: string; password: string }> {
  const text = await readFile(CREDENTIALS_FILE, "utf8");
  const values = Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key, rest.join("=")];
      })
  );
  const { FEEDONOMICS_USERNAME: username, FEEDONOMICS_PASSWORD: password } = values;
  if (!username || !password) {
    throw new Error(`${CREDENTIALS_FILE} must set FEEDONOMICS_USERNAME and FEEDONOMICS_PASSWORD`);
  }
  return { username, password };
}

async function loadStorageState(): Promise<string | undefined> {
  return existsSync(STATE_FILE) ? STATE_FILE : undefined;
}

async function saveStorageState(browser: Browser): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  const context = browser.contexts()[0];
  await writeFile(STATE_FILE, JSON.stringify(await context.storageState(), null, 2));
}

// Cookie header + XSRF token for sessionGet(), read from the persisted
// storage state saved after a successful login/2FA verification.
export async function getSessionAuth(): Promise<{ cookie: string; xsrf: string }> {
  if (!existsSync(STATE_FILE)) {
    throw new Error(
      "No Feedonomics session on file. Call the feedonomics_login_start tool first."
    );
  }
  const state = JSON.parse(await readFile(STATE_FILE, "utf8"));
  const cookies = (state.cookies as Array<{ name: string; value: string; domain: string }>)
    .filter((c) => c.domain.includes("feedonomics.com"));
  const xsrf = cookies.find((c) => c.name === "XSRF-TOKEN")?.value;
  if (!xsrf) {
    throw new Error("Stored session has no XSRF-TOKEN cookie. Re-run feedonomics_login_start.");
  }
  return { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "), xsrf };
}

// Holds the live browser/page between login_start (username+password) and
// login_verify (2FA code) tool calls, since the SPA prompts for the code as
// a separate step. Single in-flight login at a time.
let pending: { browser: Browser; page: Page } | undefined;

export async function loginStart(): Promise<
  { status: "ok" } | { status: "2fa_required"; message: string }
> {
  if (pending) throw new Error("A login is already in progress — call feedonomics_login_verify.");
  const { username, password } = await readCredentials();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: await loadStorageState() });
  const page = await context.newPage();
  await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
  await page.fill("#username", username);
  await page.locator("#username").blur();
  await page.waitForTimeout(1500);
  await page.fill("#password", password);

  const [loginResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api.php/login")),
    page.locator('button[type=submit]', { hasText: "Log In" }).click(),
  ]);
  const body = (await loginResponse.json()) as { status: string; "2fa"?: boolean };

  if (body["2fa"]) {
    await page.waitForSelector("#rememberCheck", { timeout: 10000 });
    await page.locator("#rememberCheck").check().catch(() => undefined);
    pending = { browser, page };
    return { status: "2fa_required", message: "Enter the code from your email, then call feedonomics_login_verify." };
  }

  await saveStorageState(browser);
  await browser.close();
  return { status: "ok" };
}

export async function loginVerify(code: string): Promise<{ status: "ok" }> {
  if (!pending) throw new Error("No login in progress — call feedonomics_login_start first.");
  const { browser, page } = pending;
  try {
    await page.locator("input:not([type=checkbox])").first().fill(code);
    const [verifyResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("login_with_token")),
      page.locator("button", { hasText: "Continue" }).click(),
    ]);
    await verifyResponse.text();
    await page.waitForTimeout(4000);
    const cookies = await page.context().cookies();
    if (!cookies.some((c) => c.name === "user_id")) {
      throw new Error(`2FA verify: url=${page.url()} cookies=${cookies.map((c) => c.name).join(",")}`);
    }
    await saveStorageState(browser);
    return { status: "ok" };
  } finally {
    await browser.close();
    pending = undefined;
  }
}

// Called by client.ts when a session-authenticated request gets a 401.
// Retries username+password only — succeeds silently if the device is still
// remembered (see the "remember this device" checkbox in loginStart), else
// throws telling the caller to run the interactive login again.
export async function silentRelogin(): Promise<void> {
  const result = await loginStart();
  if (result.status === "2fa_required") {
    if (pending) {
      await pending.browser.close();
      pending = undefined;
    }
    throw new Error(
      "Feedonomics session expired and the device is no longer remembered. " +
      "Call feedonomics_login_start, then feedonomics_login_verify with the emailed code."
    );
  }
}
