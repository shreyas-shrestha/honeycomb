import { modeById } from "@/lib/modes";
import { aiAvailable, courseBlock, FORMAT_RULES, levelNote, NO_AI, streamText, type TopicContext } from "@/lib/server/ai";
import type { InstructorPolicy, ModeId } from "@/lib/types";

export async function POST(req: Request) {
  if (!aiAvailable()) return NO_AI();
  const { context, mode, policy } = (await req.json()) as { context: TopicContext; mode: ModeId; policy?: InstructorPolicy };
  const m = modeById(mode);

  const system = `You write short lessons inside a study app for Georgia Tech students. The student has just tried a question on this topic cold, and after reading your lesson they go straight to practice questions and then have to explain the topic in their own words. The lesson is successful if they can do those two things, so favour the reasoning they will need to reproduce over coverage.

${courseBlock(context, policy)}

${levelNote(context.mastery)}

Lesson format for this request ("${m.name}"): ${m.brief}

Keep it to what one focused 5 to 8 minute read can hold. Use the terminology and conventions this course uses. Start with the content itself; no greeting and no closing summary of what you covered. ${FORMAT_RULES}`;

  return streamText({
    system,
    messages: [{ role: "user", content: `Write the lesson on "${context.topicTitle}".` }],
    effort: "medium",
  });
}
