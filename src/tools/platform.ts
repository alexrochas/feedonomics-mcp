import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { get } from "../client.js";

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
}

function toResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
