import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loginStart, loginVerify } from "../auth.js";

// Session-auth bootstrap for the stopgap in client.ts's sessionGet(). Not a
// Feedonomics API tool — manages the local Playwright login used until real
// Bearer/x-api-key API access is granted.
export function registerAuthTools(server: McpServer): void {
  server.registerTool(
    "login_start",
    {
      title: "Start Feedonomics session login",
      description:
        "Logs into Feedonomics with credentials from 1Password. If the device is still " +
        "remembered from a previous login, completes immediately. Otherwise returns " +
        "2fa_required — check your email for a code and call login_verify with it.",
      inputSchema: {},
    },
    async () => {
      const result = await loginStart();
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    }
  );

  server.registerTool(
    "login_verify",
    {
      title: "Verify Feedonomics 2FA code",
      description: "Completes login_start with the 2FA code emailed to you.",
      inputSchema: { code: z.string().describe("2FA code from your email") },
    },
    async ({ code }) => {
      const result = await loginVerify(code);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    }
  );
}
