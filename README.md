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
