import type OpenAI from "openai";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { aiAvailable, courseBlock, errorMessage, FORMAT_RULES, materialBlock, NO_AI, structured, untagged } from "@/lib/server/ai";
import { ContextSchema, MaterialText, parseBody } from "@/lib/server/body";
import { REVIEWER, ReviewOut } from "@/lib/server/reviewer";
import type { Review } from "@/lib/types";

const MAX_BODY_BYTES = 18_000_000; // up to three photos
const Photo = z.string().max(5_600_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "must be a PNG, JPEG or WebP image");

const Body = z.object({
  context: ContextSchema,
  prompt: z.string().min(1).max(8000),
  solution: z.string().max(12_000),
  rubric: z.array(z.string().max(1000)).min(1).max(12),
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
  const { context, prompt, solution, rubric, answer, photos = [], material } = body.data;
  if (!answer.trim() && photos.length === 0) return Response.json({ error: "There is no answer to mark." }, { status: 400 });

  const system = `${REVIEWER}\n\n${courseBlock(context)}\n\n${materialBlock(material)}\n\n${FORMAT_RULES}`;
  const content: OpenAI.Responses.ResponseInputMessageContentList = [
    {
      type: "input_text",
      text: `Question:\n${prompt}\n\nReference solution:\n${solution}\n\nRubric:\n${rubric.map((r) => `- ${r}`).join("\n")}\n\n<answer>\n${untagged(answer) || "(no typed answer; see the attached work)"}\n</answer>`,
    },
    ...photos.map((image_url) => ({ type: "input_image" as const, image_url, detail: "high" as const })),
  ];

  try {
    const out = await structured({ schema: ReviewOut, name: "review", system, content, effort: "medium", signal: req.signal });
    const lines = out.lines
      .map((l) => ({ ...l, possible: Math.max(0, l.possible), earned: Math.min(Math.max(0, l.earned), Math.max(0, l.possible)) }))
      .filter((l) => l.possible > 0);
    const possible = lines.reduce((a, l) => a + l.possible, 0);
    if (!possible) return Response.json({ error: "The marking came back empty. Try again." }, { status: 502 });
    const review: Review = { score: lines.reduce((a, l) => a + l.earned, 0) / possible, lines, feedback: out.feedback, fullCredit: out.fullCredit };
    return Response.json({ review });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 502 });
  }
}
