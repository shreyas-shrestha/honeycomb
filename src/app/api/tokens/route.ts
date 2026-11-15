import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { parseBody } from "@/lib/server/body";
import { createToken, listTokens, revokeToken } from "@/lib/server/tokens";

// Personal access tokens for connecting an AI assistant over MCP.
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  return Response.json({ tokens: await listTokens(auth.user.id) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, z.object({ name: z.string().trim().min(1).max(60) }));
  if (!body.ok) return body.response;
  const token = await createToken(auth.user.id, body.data.name);
  if (!token) return Response.json({ error: "You have the most tokens allowed. Revoke one first." }, { status: 409 });
  // The token is shown this once; only its hash is kept.
  return Response.json({ token, tokens: await listTokens(auth.user.id) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, z.object({ id: z.string().max(20) }));
  if (!body.ok) return body.response;
  if (!(await revokeToken(auth.user.id, body.data.id))) return Response.json({ error: "That token was not found." }, { status: 404 });
  return Response.json({ tokens: await listTokens(auth.user.id) });
}
