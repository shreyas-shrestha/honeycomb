import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { classInsights } from "@/lib/server/classes";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req, { role: "instructor" });
  if (!auth.ok) return auth.response;
  const insights = await classInsights(auth.user, req.nextUrl.searchParams.get("id") ?? "");
  if (!insights) return Response.json({ error: "That class was not found." }, { status: 404 });
  return Response.json(insights, { headers: { "Cache-Control": "private, no-store" } });
}
