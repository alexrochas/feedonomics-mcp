import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerPlatformTools } from "./tools/platform.js";
import { registerContentTools } from "./tools/content.js";
import { registerAuthTools } from "./tools/auth.js";

const server = new McpServer({ name: "feedonomics-mcp", version: "1.0.0" });

registerPlatformTools(server);
registerContentTools(server);
registerAuthTools(server);

await server.connect(new StdioServerTransport());
