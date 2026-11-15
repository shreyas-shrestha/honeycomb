import { z } from "zod";
import { rateLimited, requireUser } from "@/lib/server/auth";
import { aiAvailable, errorMessage, NO_AI } from "@/lib/server/ai";
import { answerQuestion } from "@/lib/server/answering";
import { ContextSchema, parseBody } from "@/lib/server/body";
import { findQuestion } from "@/lib/server/vault";

// Answers one question. This is the only way the answer key leaves the server:
// it comes back with the result, once the question is closed.
const Body = z.object({
  questionId: z.string().min(1).max(200),
  context: ContextSchema.optional(),
  choice: z.number().int().min(0).max(7).optional(), // multiple choice
  text: z.string().max(20_000).optional(), // a written answer, to be graded
  reveal: z.boolean().optional(), // close the question and show the key, to mark it by hand
  selfScore: z.number().min(0).max(1).optional(), // the hand mark, sent afterward
});

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { questionId, ...given } = body.data;
  const q = await findQuestion(auth.user.id, questionId);
  if (!q) return Response.json({ error: "That question was not found. Reload and try again." }, { status: 404 });
  // Only a written answer needs the model.
  if (q.kind === "free" && q.style !== "exam" && !given.reveal && given.selfScore === undefined && given.text?.trim()) {
    if (!aiAvailable()) return NO_AI();
    if (rateLimited(`ai:${auth.user.id}`, 40, 60_000)) return Response.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 });
  }
  try {
    const out = await answerQuestion(auth.user.id, q, { ...given, signal: req.signal });
    if (!out.ok) return Response.json({ error: out.error }, { status: out.status });
    return Response.json({ grade: out.grade, key: out.key });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 502 });
  }
}
