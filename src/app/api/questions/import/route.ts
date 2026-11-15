import { z } from "zod";
import { rateLimited, requireUser } from "@/lib/server/auth";
import { errorMessage } from "@/lib/server/ai";
import { parseBody } from "@/lib/server/body";
import { QUESTION_TYPES } from "@/lib/server/skills";
import { publicView, storeQuestions } from "@/lib/server/vault";

// Files a question someone wrote by hand: an instructor's own, or a fixed case for the evals.
// Like every question, its key stays on the server from here on.
const Body = z
  .object({
  topicId: z.string().min(1).max(200),
  // "exam" files it as blind practice, where the tutor gives no help.
  style: z.enum(["practice", "exam"]).optional(),
  question: z
    .object({
      kind: z.enum(["mcq", "free"]),
      prompt: z.string().min(1).max(8000),
      choices: z.array(z.string().max(2000)).max(8),
      answerIndex: z.number().int().min(0).max(7),
      solution: z.string().min(1).max(12_000),
      rubric: z.array(z.string().max(1000)).max(12),
      type: z.enum(QUESTION_TYPES).optional(),
      difficulty: z.number().int().min(1).max(3).optional(),
    })
    .refine((q) => (q.kind === "mcq" ? q.choices.length >= 2 && q.answerIndex < q.choices.length : q.rubric.length > 0), "needs a keyed option (multiple choice) or a rubric (written)"),
  })
  .refine((b) => b.style !== "exam" || b.question.kind === "free", "blind practice questions are written, not multiple choice");

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { topicId, question, style = "practice" } = body.data;
  if (rateLimited(`import:${auth.user.id}`, 60, 60_000)) return Response.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 });
  try {
    const [stored] = await storeQuestions(auth.user.id, topicId, [{ ...question, difficulty: question.difficulty ?? 2 }], style);
    return Response.json({ question: publicView(stored) });
  } catch (e) {
    // The account is at its limit of stored questions.
    return Response.json({ error: errorMessage(e) }, { status: 409 });
  }
}
