import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sessionGet } from "../client.js";

// Read-only lookups over accounts/databases/imports/exports/transformers/
// schedules, via session auth (see login_start/login_verify) since real
// Bearer/x-api-key API access isn't set up yet. No create/update/delete
// tools are exposed. Secrets (SFTP credentials embedded in export/import
// records) are stripped by client.ts before reaching these tools.
export function registerPlatformTools(server: McpServer): void {
  server.registerTool(
    "list_databases",
    {
      title: "List Feedonomics databases",
      description: "List all databases (feeds) on an account.",
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

  server.registerTool(
    "get_database",
    {
      title: "Get a Feedonomics database",
      description: "Get details for a single database by ID.",
      inputSchema: { dbId: z.number().int().describe("Database ID") },
    },
    async ({ dbId }) => toResult(await sessionGet(`/dbs/${dbId}`))
  );

  server.registerTool(
    "list_imports",
    {
      title: "List imports",
      description: "List import configurations (data sources) for a database.",
      inputSchema: { dbId: z.number().int().describe("Database ID") },
    },
    async ({ dbId }) => toResult(await sessionGet(`/dbs/${dbId}/imports`))
  );

  server.registerTool(
    "list_exports",
    {
      title: "List exports",
      description: "List export configurations (channel destinations) for a database.",
      inputSchema: { dbId: z.number().int().describe("Database ID") },
    },
    async ({ dbId }) => toResult(await sessionGet(`/dbs/${dbId}/exports`))
  );

  server.registerTool(
    "list_transformers",
    {
      title: "List transformers",
      description:
        "List data transformers for a database, including which exports each one applies to.",
      inputSchema: { dbId: z.number().int().describe("Database ID") },
    },
    async ({ dbId }) => toResult(await sessionGet(`/dbs/${dbId}/transformers`))
  );

  server.registerTool(
    "list_schedules",
    {
      title: "List schedules",
      description: "List import/export run schedules for a database.",
      inputSchema: { dbId: z.number().int().describe("Database ID") },
    },
    async ({ dbId }) => toResult(await sessionGet(`/dbs/${dbId}/schedules`))
  );
}

function toResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
