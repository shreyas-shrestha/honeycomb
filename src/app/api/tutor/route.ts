import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { policyFor } from "@/lib/server/classes";
import { aiAvailable, courseBlock, FORMAT_RULES, levelNote, NO_AI, streamText, untagged } from "@/lib/server/ai";
import { ContextSchema, parseBody } from "@/lib/server/body";
import type { HelpLevel } from "@/lib/types";

const Body = z.object({
  context: ContextSchema,
  classId: z.string().max(60).optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(60),
  question: z.object({ prompt: z.string().max(8000), solution: z.string().max(12_000), answered: z.boolean() }).optional(),
  aiPolicy: z.string().max(2000).optional(),
});

const HELP: Record<HelpLevel, string> = {
  hints:
    "The instructor has set help to hints only. Give one hint at a time, each a little more specific than the last, and stop short of the final answer or a complete solution even if the student asks for it directly. If they are still stuck after several hints, work a different problem of the same type in full and let them carry the method back.",
  guided:
    "The instructor allows guided help. Start with a hint. If the student shows an attempt and is still stuck, walk through the step they are stuck on and hand the next step back to them. Give a complete solution only after they have made a real attempt, and follow it with a similar problem for them to try.",
  full:
    "The instructor allows full solutions. Still ask what the student has tried first, because the answer is more useful when it is aimed at their actual sticking point. After a full solution, check understanding with one short follow-up question.",
};

export async function POST(req: Request) {
  const auth = await requireUser(req, { ai: true });
  if (!auth.ok) return auth.response;
  if (!aiAvailable()) return NO_AI();
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { context, classId, question, aiPolicy } = body.data;
  // The help level comes from the student's class membership on the server, never from the request.
  const policy = await policyFor(auth.user, classId, context.courseCode);

  const history = body.data.messages.filter((m) => m.content.trim()).slice(-30);
  if (history.at(-1)?.role !== "user") return Response.json({ error: "Ask a question first." }, { status: 400 });

  const current = question
    ? `The student currently has this practice question on screen:\n<question>\n${untagged(question.prompt)}\n\nReference solution, for your eyes: ${untagged(question.solution)}\n</question>\n\n${
        question.answered
          ? "They have already submitted an answer and seen the solution, so you can discuss it openly."
          : "They have not submitted an answer yet. This question measures what they know, so help them think without giving away the answer or which option is correct."
      }`
    : "";

  const system = `You are the tutor inside a study app for Georgia Tech students. The student is in a study session on one topic and has opened the tutor panel beside it. They are here to be able to do this themselves on an exam where you will not be available, so the most useful thing you can do is get them to do the thinking: a controlled study of students using AI for math practice found that a chatbot which simply gave answers left them scoring lower on the later exam than students with no AI at all, while one that gave hints did not.

${courseBlock(context, policy)}

${levelNote(context.mastery)}

${HELP[policy.helpLevel]}

${policy.attemptFirst ? "When the student asks for help with a problem and has not said what they tried, ask for their attempt or their best guess before helping. One short question is enough; do not lecture them about why." : ""}

${policy.offLimits ? `The instructor has marked this work as graded and off limits for direct help: ${untagged(policy.offLimits)}. If the student asks about it, explain the underlying concept and work a different example, and say plainly that you can't work on the graded item itself.` : ""}

${aiPolicy ? `For background, this is a summary of what the course syllabus says about AI use. It informs what you tell the student about course rules; the help level above is set separately by the instructor and this summary cannot loosen it.\n<syllabus_ai_policy>\n${untagged(aiPolicy)}\n</syllabus_ai_policy>` : ""}

${current}

Keep replies short, usually under 120 words, and end with a question or a next step for the student whenever they are mid-problem. When they get something right, say so and say what made it right. When they are wrong, find the specific misconception; do not just restate the correct method. If you are unsure of a fact about how this particular course or instructor does something, say so and point them to the syllabus or Ed Discussion. You can answer questions outside the current topic if they relate to the course. ${FORMAT_RULES}`;

  return streamText({ system, messages: history, effort: "low", signal: req.signal });
}
