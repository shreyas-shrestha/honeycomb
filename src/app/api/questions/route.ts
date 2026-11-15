import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { aiAvailable, errorMessage, NO_AI } from "@/lib/server/ai";
import { ContextSchema, MaterialText, parseBody } from "@/lib/server/body";
import { writeQuestions } from "@/lib/server/questions";
import { publicView } from "@/lib/server/vault";

const Body = z.object({
  context: ContextSchema,
  classId: z.string().max(60).optional(),
  topicId: z.string().min(1).max(200),
  avoid: z.array(z.string().max(4000)).max(40).optional(),
  // "exam" writes free-response questions for blind practice, marked by the reviewer.
  style: z.enum(["practice", "exam"]).optional(),
  count: z.number().int().min(1).max(4).optional(),
  material: MaterialText,
});

export async function POST(req: Request) {
  const auth = await requireUser(req, { ai: true });
  if (!auth.ok) return auth.response;
  if (!aiAvailable()) return NO_AI();
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  try {
    // The full questions stay in the vault; the browser gets the prompts.
    const questions = (await writeQuestions({ user: auth.user, signal: req.signal, ...body.data })).map(publicView);
    return Response.json({ questions });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 502 });
  }
}
