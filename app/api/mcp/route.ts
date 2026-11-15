import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createTrackerMcp } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.TRACKER_MCP_TOKEN?.trim() ?? "";
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

async function handle(request: Request): Promise<Response> {
  if (!process.env.TRACKER_MCP_TOKEN?.trim()) {
    return Response.json(
      { error: "TRACKER_MCP_TOKEN is not set on this deployment." },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const server = createTrackerMcp();
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export {
  handle as GET,
  handle as POST,
  handle as DELETE,
};
