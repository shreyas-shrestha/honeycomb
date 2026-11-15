import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { aiAvailable, errorMessage, NO_AI } from "@/lib/server/ai";
import { ContextSchema, MaterialText, parseBody } from "@/lib/server/body";
import { MAX_HINTS } from "@/lib/tutor-protocol";
import { tutorTurn } from "@/lib/server/tutor";
import { findQuestion } from "@/lib/server/vault";

const Body = z.object({
  context: ContextSchema,
  classId: z.string().max(60).optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(60),
  // The question on screen, by id. Its text, its solution and whether it has been answered are the server's own.
  // `open` says it is on screen unanswered; it can add the guard to a question the vault has seen answered, never remove it.
  question: z.object({ id: z.string().min(1).max(200), open: z.boolean().optional() }).optional(),
  aiPolicy: z.string().max(2000).optional(),
  material: MaterialText,
});

export async function POST(req: Request) {
  const auth = await requireUser(req, { ai: true });
  if (!auth.ok) return auth.response;
  if (!aiAvailable()) return NO_AI();
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { question: ref, ...rest } = body.data;
  const question = ref ? await findQuestion(auth.user.id, ref.id) : undefined;
  if (ref && !question) return Response.json({ error: "That question was not found. Reload and try again." }, { status: 404 });

  try {
    const turn = await tutorTurn({ user: auth.user, question, onScreenOpen: ref?.open, signal: req.signal, ...rest });
    if (!turn.ok) return Response.json({ error: turn.error }, { status: turn.status });
    if ("stream" in turn) return turn.stream;
    return new Response(turn.text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 502 });
  }
}

// Where a question's help stands, so the panel shows the right hint number after a reload.
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const id = new URL(req.url).searchParams.get("question") ?? "";
  const q = id.length <= 200 ? await findQuestion(auth.user.id, id) : undefined;
  if (!q) return Response.json({ error: "That question was not found." }, { status: 404 });
  return Response.json({ attempted: q.attempted, hintsUsed: Math.min(q.hintsUsed, MAX_HINTS) }, { headers: { "Cache-Control": "private, no-store" } });
}
