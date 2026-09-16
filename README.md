# feedonomics-mcp

A local, **read-only** [MCP](https://modelcontextprotocol.io) server for Feedonomics. Lets an
agent look up databases, imports, exports, transformers, and schedules — and see how they're
connected (which transformers apply to which exports, which credentials feed which import) —
without ever creating, updating, deleting, or pushing anything.

Authenticates like the meta.feedonomics.com web app (session cookies from a real login),
since real Platform API access (Bearer + x-api-key) hasn't been granted yet — see
[Session auth](#session-auth) below.

## Read-only guarantee

- `sessionGet()` in `client.ts` only ever issues HTTP `GET` requests.
- The one `POST` endpoint wrapped (`run_parallel_export`, via `download_export_data`) hardcodes
  `push: "false"` in the client — the tool has no parameter that can turn pushing on.
- No tool exists for create/update/delete on databases, imports, exports, transformers, or
  vault/channel credentials.
- **Secrets are redacted.** Feedonomics' export/import list endpoints return live SFTP
  credentials (`username`/`password`, sometimes private keys) inline. `redactSecrets()` in
  `client.ts` strips any `password`/`private_key`/`secret`/`token`/etc. field before the data
  reaches a tool response, so a live credential never lands in a chat transcript.

## Tools

| Tool | Wraps | Description |
|---|---|---|
| `list_databases` | `GET /accounts/:id/databases` | List all databases (feeds) on an account |
| `get_database` | `GET /dbs/:id` | Get a single database's details |
| `list_imports` | `GET /dbs/:id/imports` | List import configs (data sources) for a database |
| `list_exports` | `GET /dbs/:id/exports` | List export configs (channel destinations) for a database |
| `list_transformers` | `GET /dbs/:id/transformers` | List transformers, incl. which exports each applies to |
| `list_schedules` | `GET /dbs/:id/schedules` | List import/export run schedules for a database |
| `download_export_data` | `POST /dbs/:id/exports/:id/run_parallel_export` | Run + return export data (push always disabled) |
| `login_start` | — | Log into Feedonomics (creds from `~/.feedonomics.env`); returns `2fa_required` or `ok` |
| `login_verify` | — | Complete `login_start` with the emailed 2FA code |

## Session auth

Until real Platform API access is granted, every data tool authenticates like the
meta.feedonomics.com web app: log in, solve 2FA once, and reuse the resulting session
cookies. This is undocumented and fragile compared to the real API, but its endpoint shapes
turned out to match the documented Platform API paths exactly (`/dbs/:id/exports`, etc.), so
switching to real Bearer/x-api-key auth later is a one-line change in `client.ts`.

**One-time setup:**

```bash
cat > ~/.feedonomics.env <<'EOF'
FEEDONOMICS_USERNAME=you@example.com
FEEDONOMICS_PASSWORD=...
EOF
chmod 600 ~/.feedonomics.env
```

ponytail: plaintext credential file, not a vault — chosen after 1Password's org-managed
session/lock policy made `op read` unreliable for this personal tool. Upgrade path: swap
`readCredentials()` in `src/auth.ts` for a 1Password Service Account token if that friction
gets resolved.

**Logging in via the MCP tools:** call `login_start`. If your device isn't already
remembered, it returns `2fa_required` — check your email for the code and call
`login_verify` with it. The session (cookies) is saved to `~/.feedonomics-mcp/storage-state.json`
and reused by `sessionGet()`/`downloadExportData()` in `client.ts`, which also auto-retry once
via a silent re-login on a 401 (this succeeds without 2FA as long as the device is still
remembered, ~30 days).

**Logging in via the standalone script** (useful when bootstrapping before the MCP server
is registered, or after `storage-state.json` goes stale): run `npx tsx login-watch.ts` in
the background — it starts the login, waits for a code, and reads it from
`/tmp/feedonomics-2fa-code.txt`. Check your email, then:
```bash
echo -n "YOURCODE" > /tmp/feedonomics-2fa-code.txt
```

## Requirements

- Node.js 20+
- A Feedonomics account with browser-based login (username/password + email 2FA)

## Setup

```bash
npm install
npx playwright install chromium
```

Smoke-test it boots (stdio servers are silent until they receive JSON-RPC input):

```bash
npx tsx src/index.ts < /dev/null
```

## Register with OpenCode

Already added to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "mcp": {
    "feedonomics": {
      "type": "local",
      "command": ["npx", "tsx", "/Users/alex.rocha/Development/feedonomics-mcp/src/index.ts"],
      "enabled": true
    }
  }
}
```

Restart OpenCode. Tools appear as `feedonomics_list_databases`, `feedonomics_get_database`, etc.

## Project layout

```
src/
  index.ts          # server bootstrap, registers all tool modules
  client.ts         # session-authenticated fetch wrapper (GET-only + one hardcoded-safe POST) + secret redaction
  auth.ts           # Playwright login/2FA flow, session persistence, silent re-login
  tools/
    platform.ts     # database/import/export/transformer/schedule lookups
    content.ts      # export data download (read-only)
    auth.ts         # login_start / login_verify tools
login-watch.ts       # standalone script for bootstrapping/refreshing a session outside the MCP process
```

## Adding a new read-only tool

1. Add a `sessionGet()` call (or a new hardcoded-safe wrapper in `client.ts`) for the endpoint.
2. Register the tool in the relevant file under `src/tools/`.
3. Restart OpenCode.

Never add a tool that issues `POST`/`PUT`/`PATCH`/`DELETE` without hardcoding away any
parameter that could mutate state or push to a channel — that would break the read-only
guarantee of this server. If the endpoint might return credentials or secrets, check
`SECRET_KEYS` in `client.ts` covers the field names before wiring it up.
