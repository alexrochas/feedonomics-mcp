import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get, sessionGet } from "../client.js";

// Platform API — read-only lookups over accounts/databases/imports/exports/
// transformers/schedules. No create/update/delete tools are exposed.
export function registerPlatformTools(server: McpServer): void {
  server.registerTool(
    "list_databases",
    {
      title: "List Feedonomics databases",
      description: "List all databases (feeds) accessible to the authenticated account.",
      inputSchema: {},
    },
    async () => toResult(await get("/dbs"))
  );

  server.registerTool(
    "get_database",
    {
      title: "Get a Feedonomics database",
      description: "Get details for a single database by ID.",
      inputSchema: { dbId: z.number().int().describe("Database ID") },
    },
    async ({ dbId }) => toResult(await get(`/dbs/${dbId}`))
  );

  server.registerTool(
    "list_imports",
    {
      title: "List imports",
      description: "List import configurations for a database.",
      inputSchema: { dbId: z.number().int().describe("Database ID") },
    },
    async ({ dbId }) => toResult(await get(`/dbs/${dbId}/imports`))
  );

  server.registerTool(
    "list_exports",
    {
      title: "List exports",
      description: "List export configurations for a database.",
      inputSchema: { dbId: z.number().int().describe("Database ID") },
    },
    async ({ dbId }) => toResult(await get(`/dbs/${dbId}/exports`))
  );

  server.registerTool(
    "list_transformers",
    {
      title: "List transformers",
      description: "List data transformers configured for a database.",
      inputSchema: { dbId: z.number().int().describe("Database ID") },
    },
    async ({ dbId }) => toResult(await get(`/dbs/${dbId}/transformers`))
  );

  // ponytail: stopgap tool using session-cookie auth instead of the
  // documented Bearer/x-api-key flow. Remove once real API access lands —
  // see client.ts's sessionGet().
  server.registerTool(
    "list_databases_session",
    {
      title: "List databases (session auth, experimental)",
      description:
        "List databases for an account via the internal web-app API (session auth, see " +
        "login_start/login_verify). Undocumented and fragile — prefer list_databases once " +
        "real API access is set up.",
      inputSchema: {
        accountId: z.number().int().describe("Account ID"),
        page: z.number().int().optional(),
        resultsPerPage: z.number().int().optional(),
      },
    },
    async ({ accountId, page, resultsPerPage }) =>
      toResult(
        await sessionGet(
          `/accounts/${accountId}/databases?page=${page ?? 1}&query=&paused=&results_per_page=${
            resultsPerPage ?? 50
          }`
        )
      )
  );
}

function toResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
