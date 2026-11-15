import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { rateLimited } from "@/lib/server/auth";
import { honeycombServer } from "@/lib/server/mcp";
import { userForToken } from "@/lib/server/tokens";

// The MCP endpoint (streamable HTTP, stateless). An assistant signs in with a
// personal access token from the Connect page, never with the browser's cookie,
// so another site cannot use a signed-in visitor's session to call it.
const rpcError = (status: number, message: string, headers?: HeadersInit) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers });

export async function POST(req: Request) {
  const user = await userForToken(req.headers.get("authorization"));
  if (!user) return rpcError(401, "Sign in with a Honeycomb access token: Authorization: Bearer hc_…", { "WWW-Authenticate": "Bearer" });
  if (rateLimited(`mcp:${user.id}`, 120, 60_000)) return rpcError(429, "Too many requests. Wait a minute and try again.");
  // Each request gets its own server and transport: there is no session to keep between calls.
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await honeycombServer(user).connect(transport);
  return transport.handleRequest(req);
}

const notAllowed = () => rpcError(405, "This endpoint takes POST only.", { Allow: "POST" });
export const GET = notAllowed;
export const DELETE = notAllowed;
