import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { parseBody } from "@/lib/server/body";
import { db } from "@/lib/server/db";

const MAX_STATE_BYTES = 4_000_000;

// The learner's whole saved state is one JSON document. `rev` is a counter:
// a save names the revision it was based on, and a stale save is refused so one
// tab or device cannot silently overwrite another.
// `userId` is the account the browser believes it is saving for. If someone
// else has since signed in on the same browser, the save is refused.
const Body = z.object({ userId: z.string().max(60), baseRev: z.number().int().min(0), data: z.record(z.string(), z.unknown()) });

interface Row {
  rev: number;
  data: string;
}

const read = (userId: string) => db().prepare("SELECT rev, data FROM user_state WHERE user_id = ?").get(userId) as Row | undefined;

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const row = read(auth.user.id);
  return Response.json({ rev: row?.rev ?? 0, data: row ? (JSON.parse(row.data) as unknown) : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, Body, MAX_STATE_BYTES);
  if (!body.ok) return body.response;
  if (body.data.userId !== auth.user.id) return Response.json({ error: "You are signed in as a different account." }, { status: 401 });

  const save = db().transaction((userId: string, baseRev: number, data: string) => {
    const current = read(userId)?.rev ?? 0;
    if (current !== baseRev) return null;
    db()
      .prepare("INSERT INTO user_state (user_id, rev, data) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET rev = excluded.rev, data = excluded.data")
      .run(userId, current + 1, data);
    return current + 1;
  });
  const rev = save(auth.user.id, body.data.baseRev, JSON.stringify(body.data.data));
  if (rev === null) return Response.json({ error: "Your progress changed in another tab or device." }, { status: 409 });
  return Response.json({ rev });
}
