import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { parseBody } from "@/lib/server/body";
import { one, run } from "@/lib/server/db";

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

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const row = await one<Row>("SELECT rev, data FROM user_state WHERE user_id = ?", auth.user.id);
  return Response.json({ rev: row?.rev ?? 0, data: row ? (JSON.parse(row.data) as unknown) : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, Body, MAX_STATE_BYTES);
  if (!body.ok) return body.response;
  const { userId, baseRev, data } = body.data;
  if (userId !== auth.user.id) return Response.json({ error: "You are signed in as a different account." }, { status: 401 });

  // Each branch is one statement, so the revision check and the write cannot be split by another save.
  const json = JSON.stringify(data);
  const changed =
    baseRev === 0
      ? await run("INSERT INTO user_state (user_id, rev, data) VALUES (?, 1, ?) ON CONFLICT(user_id) DO NOTHING", userId, json)
      : await run("UPDATE user_state SET rev = rev + 1, data = ? WHERE user_id = ? AND rev = ?", json, userId, baseRev);
  if (changed === 0) return Response.json({ error: "Your progress changed in another tab or device." }, { status: 409 });
  return Response.json({ rev: baseRev + 1 });
}
