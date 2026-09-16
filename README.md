# feedonomics-mcp

A local, **read-only** [MCP](https://modelcontextprotocol.io) server for the Feedonomics
Platform/Content REST APIs. Lets an agent look up databases, imports, exports, and
transformers, and pull export data — it cannot create, update, delete, or push anything.

## Read-only guarantee

- `client.ts`'s `get()` only ever issues HTTP `GET` requests.
- The one `POST` endpoint wrapped (`run_parallel_export`, via `download_export_data`) hardcodes
  `push: "false"` in the client — the tool has no parameter that can turn pushing on.
- No tool exists for create/update/delete on databases, imports, exports, transformers, or
  vault/channel credentials.

## Tools

| Tool | Wraps | Description |
|---|---|---|
| `list_databases` | `GET /dbs` | List all databases (feeds) on the account |
| `get_database` | `GET /dbs/:id` | Get a single database's details |
| `list_imports` | `GET /dbs/:id/imports` | List import configs for a database |
| `list_exports` | `GET /dbs/:id/exports` | List export configs for a database |
| `list_transformers` | `GET /dbs/:id/transformers` | List transformers for a database |
| `download_export_data` | `POST /dbs/:id/exports/:id/run_parallel_export` | Run + return export data (push always disabled) |
| `list_databases_session` | `GET /accounts/:id/databases` (internal, session auth) | List databases via the logged-in web-app API |
| `login_start` | — | Log into Feedonomics (creds from `~/.feedonomics.env`); returns `2fa_required` or `ok` |
| `login_verify` | — | Complete `login_start` with the emailed 2FA code |

## Session auth (`list_databases_session`)

Until real Platform API access (Bearer + x-api-key) is granted, `list_databases_session`
authenticates like the meta.feedonomics.com web app does: log in, solve 2FA once, and reuse
the resulting session cookies. This is undocumented and fragile — prefer the
`list_databases`/`get_database`/etc. tools once real API access is set up.

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
and reused by `sessionGet()` in `client.ts`, which also auto-retries once via a silent
re-login on a 401 (this succeeds without 2FA as long as the device is still remembered,
~30 days).

**Logging in via the standalone script** (useful when bootstrapping before the MCP server
is registered, or after `storage-state.json` goes stale): run `npx tsx login-watch.ts` in
the background — it starts the login, waits for a code, and reads it from
`/tmp/feedonomics-2fa-code.txt`. Check your email, then:
```bash
echo -n "YOURCODE" > /tmp/feedonomics-2fa-code.txt
```

## Requirements

- Node.js 20+
- Feedonomics API access — request it via a "Request Feedonomics API Access" ticket on the
  FeedSupport Portal, then get your bearer token + `x-api-key`.

## Setup

```bash
npm install
```

Set credentials (e.g. in your shell profile or a `.env` you source before launching):

```bash
export FEEDONOMICS_TOKEN="..."     # Bearer token
export FEEDONOMICS_API_KEY="..."   # x-api-key
# export FEEDONOMICS_BASE_URL="https://meta.feedonomics.com/api.php"  # override if needed
```

Smoke-test it boots (stdio servers are silent until they receive JSON-RPC input):

```bash
npx tsx src/index.ts < /dev/null
```

## Register with OpenCode

Add to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "mcp": {
    "feedonomics": {
      "type": "local",
      "command": ["npx", "tsx", "/absolute/path/to/feedonomics-mcp/src/index.ts"],
      "enabled": true,
      "environment": {
        "FEEDONOMICS_TOKEN": "{env:FEEDONOMICS_TOKEN}",
        "FEEDONOMICS_API_KEY": "{env:FEEDONOMICS_API_KEY}"
      }
    }
  }
}
```

Restart OpenCode. Tools appear as `feedonomics_list_databases`, `feedonomics_get_database`, etc.

## Project layout

```
src/
  index.ts          # server bootstrap, registers all tool modules
  client.ts          # shared fetch wrapper (GET-only + one hardcoded-safe POST)
  tools/
    platform.ts      # database/import/export/transformer lookups
    content.ts       # export data download (read-only)
```

## Adding a new read-only tool

1. Add a `get()` call (or a new hardcoded-safe wrapper in `client.ts`) for the endpoint.
2. Register the tool in the relevant file under `src/tools/`.
3. Restart OpenCode.

Never add a tool that issues `POST`/`PUT`/`PATCH`/`DELETE` without hardcoding away any
parameter that could mutate state or push to a channel — that would break the read-only
guarantee of this server.
