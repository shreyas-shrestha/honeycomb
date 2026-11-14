import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { parseBody, PolicySchema } from "@/lib/server/body";
import { policyFor, setPolicy } from "@/lib/server/classes";

const Body = z.object({ id: z.string().min(1).max(60), policy: PolicySchema });

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  return Response.json({ policy: await policyFor(auth.user, req.nextUrl.searchParams.get("id") ?? undefined, "") });
}

export async function PUT(req: Request) {
  const auth = await requireUser(req, { role: "instructor" });
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  if (!(await setPolicy(auth.user, body.data.id, body.data.policy))) return Response.json({ error: "That class was not found." }, { status: 404 });
  return Response.json({ ok: true });
}
