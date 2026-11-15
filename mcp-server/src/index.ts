import "./load-env";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTrackerMcp } from "../../lib/mcp/server";

const server = createTrackerMcp();
const transport = new StdioServerTransport();
server.connect(transport).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Failed to start";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
