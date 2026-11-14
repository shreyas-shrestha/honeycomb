import type { NextRequest } from "next/server";
import { searchCatalog } from "@/lib/server/catalog";

export async function GET(req: NextRequest) {
  try {
    return Response.json(await searchCatalog(req.nextUrl.searchParams.get("q") ?? ""));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not load the course catalog." }, { status: 502 });
  }
}
