import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { downloadExportData } from "../client.js";

// Content API — fetches export data. `push` is hardcoded to false in the
// client (see client.ts), so this can only read data, never send it to a
// channel.
export function registerContentTools(server: McpServer): void {
  server.registerTool(
    "download_export_data",
    {
      title: "Download export data",
      description:
        "Run an export and return its data (read-only — never pushes to a channel). " +
        "Use rawData=true to skip transformers and get the raw feed data.",
      inputSchema: {
        dbId: z.number().int().describe("Database ID"),
        exportId: z.number().int().describe("Export ID"),
        delimiter: z.enum(["tab", "comma", "pipe", "semicolon"]).optional(),
        rawData: z.boolean().optional().describe("Skip transformers, return raw data"),
      },
    },
    async ({ dbId, exportId, delimiter, rawData }) => {
      const data = await downloadExportData(dbId, exportId, { delimiter, rawData });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );
}
