import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { aiAvailable, errorMessage, NO_AI } from "@/lib/server/ai";
import { reviewBlind } from "@/lib/server/answering";
import { ContextSchema, MaterialText, parseBody } from "@/lib/server/body";
import { findQuestion } from "@/lib/server/vault";

const MAX_BODY_BYTES = 18_000_000; // up to three photos
const Photo = z.string().max(5_600_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "must be a PNG, JPEG or WebP image");

// Marks one piece of blind work, once. The question, its solution and its rubric
// are the server's own copies, so the marking cannot be steered from the browser.
const Body = z.object({
  context: ContextSchema,
  questionId: z.string().min(1).max(200),
  answer: z.string().max(20_000),
  photos: z.array(Photo).max(3).optional(),
  material: MaterialText,
});

export async function POST(req: Request) {
  const auth = await requireUser(req, { ai: true });
  if (!auth.ok) return auth.response;
  if (!aiAvailable()) return NO_AI();
  const body = await parseBody(req, Body, MAX_BODY_BYTES);
  if (!body.ok) return body.response;
  const { questionId, answer, photos = [], ...rest } = body.data;
  if (!answer.trim() && photos.length === 0) return Response.json({ error: "There is no answer to mark." }, { status: 400 });
  const q = await findQuestion(auth.user.id, questionId);
  if (!q) return Response.json({ error: "That question was not found. Reload and try again." }, { status: 404 });
  try {
    const out = await reviewBlind(auth.user.id, q, { answer, photos, signal: req.signal, ...rest });
    if (!out.ok) return Response.json({ error: out.error }, { status: out.status });
    return Response.json({ review: out.review, key: out.key });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 502 });
  }
}
