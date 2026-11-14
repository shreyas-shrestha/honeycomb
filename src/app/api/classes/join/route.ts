import { z } from "zod";
import { rateLimited, requireUser } from "@/lib/server/auth";
import { parseBody } from "@/lib/server/body";
import { joinClass, leaveClass } from "@/lib/server/classes";

const Join = z.object({ code: z.string().trim().min(4).max(20) });
const Leave = z.object({ classId: z.string().min(1).max(60) });

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  // Codes are short, so guessing has to be slow.
  if (rateLimited(`join:${auth.user.id}`, 10, 10 * 60_000)) return Response.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
  const body = await parseBody(req, Join);
  if (!body.ok) return body.response;
  const result = joinClass(auth.user, body.data.code);
  if (result.ok) return Response.json({ bundle: result.bundle });
  return result.reason === "own-class"
    ? Response.json({ error: "That is your own class. Manage it from Classes." }, { status: 400 })
    : Response.json({ error: "No class has that code. Check it with your instructor." }, { status: 404 });
}

export async function DELETE(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, Leave);
  if (!body.ok) return body.response;
  leaveClass(auth.user, body.data.classId);
  return Response.json({ ok: true });
}
