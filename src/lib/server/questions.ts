import { z } from "zod";
import type { Question, TopicContext, User } from "../types";
import { courseBlock, FORMAT_RULES, materialBlock, structured } from "./ai";
import { policyFor } from "./classes";
import { QUESTION_TYPES } from "./skills";
import { storeQuestions } from "./vault";

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
      type: z.enum(QUESTION_TYPES).describe("The kind of work asked for: trace (step through a procedure or data structure), proof (justify a claim), derivation (derive a bound or formula), explanation (say why or how in words), calculation (compute a value)"),
    }),
  ),
});

// Writes questions for one topic and files them in the vault. Returns them in full:
// callers decide what the student may see.
export async function writeQuestions(opts: { user: User; context: TopicContext; classId?: string; topicId: string; avoid?: string[]; style?: "practice" | "exam"; count?: number; material?: string; signal?: AbortSignal }): Promise<Question[]> {
  const { user, context, topicId, avoid, style = "practice", count = 2, material } = opts;
  const policy = await policyFor(user, opts.classId, context.courseCode);

  const system = `You write practice questions for a study app used by Georgia Tech students. The questions are how the app measures whether the student has learned a topic, and they are reused later for spaced review, so each one must stand on its own and have one defensible answer.

${courseBlock(context, policy)}

${materialBlock(material)}

${
  style === "exam"
    ? `Write ${count} free-response exam question${count === 1 ? "" : "s"} at the difficulty and in the form of this course's exams, the kind a student answers on paper with their work shown: a trace, a derivation, a proof, a calculation, or an explanation of why something holds. No multiple choice. Where the student's material includes example questions, write new questions of the same type and length with different specifics; do not reuse one. For each, give a rubric of three to five lines, each naming one thing a full-credit answer shows and its points in brackets, such as "[3] correct final array". Put most of the points on method and justification. Write each prompt as the question alone: no question number, no heading, no point total, and no note about where its style or notation came from.`
    : `Write five questions: three multiple-choice and two free-response, ordered from easiest to hardest, ending at the difficulty of this course's exams. Test understanding and application, such as tracing, computing, predicting or spotting the error, over recalling a definition. Wrong multiple-choice options should each come from a specific mistake students make, and all four options should be similar in length and form so the answer cannot be guessed from shape. Vary which position holds the correct option. Free-response questions should be answerable in two to six sentences or a short calculation.`
}

Check every answer by working the problem yourself before writing the solution. ${FORMAT_RULES}`;

  const content = avoid?.length
    ? `Write the questions for "${context.topicTitle}". The student has already seen the ones below, so write different ones.\n\n${avoid.map((a) => `- ${a.slice(0, 300)}`).join("\n")}`
    : `Write the questions for "${context.topicTitle}".`;

  const out = await structured({ schema: Questions, name: "practice_questions", system, content, effort: "medium", signal: opts.signal });
  const usable = out.questions
    .map((q) => ({ ...q, answerIndex: Math.round(q.answerIndex) }))
    // Keep only items the app can score: a real keyed option, or a rubric to grade against.
    .filter((q) => (q.kind === "mcq" ? q.choices.length >= 2 && q.answerIndex >= 0 && q.answerIndex < q.choices.length : q.rubric.length > 0))
    .filter((q) => style !== "exam" || q.kind === "free");
  if (!usable.length) throw new Error("No usable questions were generated. Try again.");
  return storeQuestions(user.id, topicId, usable, style);
}
