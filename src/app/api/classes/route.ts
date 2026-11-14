import { requireUser } from "@/lib/server/auth";
import { BundleSchema, parseBody } from "@/lib/server/body";
import { listClasses, publishClass } from "@/lib/server/classes";

const MAX_BUNDLE_BYTES = 3_000_000;

export async function GET(req: Request) {
  const auth = await requireUser(req, { role: "instructor" });
  if (!auth.ok) return auth.response;
  return Response.json({ classes: await listClasses(auth.user.id) });
}

export async function POST(req: Request) {
  const auth = await requireUser(req, { role: "instructor" });
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, BundleSchema, MAX_BUNDLE_BYTES);
  if (!body.ok) return body.response;
  const cls = await publishClass(auth.user, body.data);
  if (!cls) return Response.json({ error: "You have reached the limit on published classes." }, { status: 400 });
  return Response.json({ class: cls });
}
