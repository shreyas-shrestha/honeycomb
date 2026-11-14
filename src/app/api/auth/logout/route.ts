import { crossSite, endSession } from "@/lib/server/auth";

export async function POST(req: Request) {
  if (crossSite(req)) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
  await endSession();
  return Response.json({ ok: true });
}
