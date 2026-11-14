import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { policyFor } from "@/lib/server/classes";
import { aiAvailable, courseBlock, errorMessage, FORMAT_RULES, NO_AI, structured } from "@/lib/server/ai";
import { ContextSchema, parseBody } from "@/lib/server/body";
import type { Question } from "@/lib/types";

const Body = z.object({
  context: ContextSchema,
  classId: z.string().max(60).optional(),
  topicId: z.string().min(1).max(200),
  avoid: z.array(z.string().max(4000)).max(40).optional(),
});

const Questions = z.object({
  questions: z.array(
    z.object({
      kind: z.enum(["mcq", "free"]),
      prompt: z.string(),
      choices: z.array(z.string()).describe("Exactly four options for mcq; empty array for free"),
      answerIndex: z.number().describe("Zero-based index of the correct choice for mcq; 0 for free"),
      solution: z.string().describe("Worked solution that explains why, and for mcq why the most tempting wrong option is wrong"),
      rubric: z.array(z.string()).describe("For free: two to four points a full-credit answer must contain. Empty for mcq"),
      difficulty: z.number().describe("1 recall, 2 apply, 3 exam-level"),
    }),
  ),
});

export async function POST(req: Request) {
  const auth = await requireUser(req, { ai: true });
  if (!auth.ok) return auth.response;
  if (!aiAvailable()) return NO_AI();
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { context, classId, topicId, avoid } = body.data;
  const policy = policyFor(auth.user, classId, context.courseCode);

  const system = `You write practice questions for a study app used by Georgia Tech students. The questions are how the app measures whether the student has learned a topic, and they are reused later for spaced review, so each one must stand on its own and have one defensible answer.

${courseBlock(context, policy)}

Write five questions: three multiple-choice and two free-response, ordered from easiest to hardest, ending at the difficulty of this course's exams. Test understanding and application, such as tracing, computing, predicting or spotting the error, over recalling a definition. Wrong multiple-choice options should each come from a specific mistake students make, and all four options should be similar in length and form so the answer cannot be guessed from shape. Vary which position holds the correct option. Free-response questions should be answerable in two to six sentences or a short calculation.

Check every answer by working the problem yourself before writing the solution. ${FORMAT_RULES}`;

  const content = avoid?.length
    ? `Write the questions for "${context.topicTitle}". The student has already seen the ones below, so write different ones.\n\n${avoid.map((a) => `- ${a.slice(0, 300)}`).join("\n")}`
    : `Write the questions for "${context.topicTitle}".`;

  try {
    const out = await structured({ schema: Questions, name: "practice_questions", system, content, effort: "medium", signal: req.signal });
    const stamp = Date.now().toString(36);
    const questions: Question[] = out.questions
      .map((q) => ({ ...q, answerIndex: Math.round(q.answerIndex) }))
      // Keep only items the app can score: a real keyed option, or a rubric to grade against.
      .filter((q) => (q.kind === "mcq" ? q.choices.length >= 2 && q.answerIndex >= 0 && q.answerIndex < q.choices.length : q.rubric.length > 0))
      .map((q, i) => ({ ...q, id: `${topicId}.q${stamp}${i}`, topicId }));
    if (!questions.length) return Response.json({ error: "No usable questions were generated. Try again." }, { status: 502 });
    return Response.json({ questions });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 502 });
  }
}
