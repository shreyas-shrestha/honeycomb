import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { aiAvailable, errorMessage, NO_AI } from "@/lib/server/ai";
import { ContextSchema, parseBody } from "@/lib/server/body";
import { gradeAnswer } from "@/lib/server/grading";

// Grades a teach-back: the student's own explanation of a topic against the topic's objectives.
// Answers to questions go through /api/answer, where the key is held on the server.
const Body = z.object({
  context: ContextSchema,
  prompt: z.string().min(1).max(8000),
  answer: z.string().trim().min(1, "is empty; write an answer first").max(20_000),
  rubric: z.array(z.string().max(1000)).min(1).max(12),
});

export async function POST(req: Request) {
  const auth = await requireUser(req, { ai: true });
  if (!auth.ok) return auth.response;
  if (!aiAvailable()) return NO_AI();
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  try {
    return Response.json({ grade: await gradeAnswer({ ...body.data, teachBack: true, signal: req.signal }) });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 502 });
  }
}
