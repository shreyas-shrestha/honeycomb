import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { policyFor } from "@/lib/server/classes";
import { modeById } from "@/lib/modes";
import { aiAvailable, courseBlock, FORMAT_RULES, levelNote, materialBlock, NO_AI, streamText } from "@/lib/server/ai";
import { ContextSchema, MaterialText, ModeSchema, parseBody } from "@/lib/server/body";

const Body = z.object({ context: ContextSchema, mode: ModeSchema, classId: z.string().max(60).optional(), material: MaterialText });

export async function POST(req: Request) {
  const auth = await requireUser(req, { ai: true });
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { context, mode, classId, material } = body.data;
  const policy = await policyFor(auth.user, classId, context.courseCode);
  if (!policy.allowedModes.includes(mode)) return Response.json({ error: "Your instructor has turned this format off for the course." }, { status: 403 });
  if (!aiAvailable()) return NO_AI();
  const m = modeById(mode);

  const system = `You write short lessons inside a study app for Georgia Tech students. The student has just tried a question on this topic cold, and after reading your lesson they go straight to practice questions and then have to explain the topic in their own words. The lesson is successful if they can do those two things, so favor the reasoning they will need to reproduce over coverage.

${courseBlock(context, policy)}

${materialBlock(material)}

${levelNote(context.mastery)}

Lesson format for this request ("${m.name}"): ${m.brief}

Keep it to what one focused 5 to 8 minute read can hold. Use the terminology and conventions this course uses. Start with the content itself; no greeting and no closing summary of what you covered. ${FORMAT_RULES}`;

  return streamText({
    system,
    messages: [{ role: "user", content: `Write the lesson on "${context.topicTitle}".` }],
    effort: "medium",
    signal: req.signal,
  });
}
