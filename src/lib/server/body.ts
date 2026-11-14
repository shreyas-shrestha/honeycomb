import { z } from "zod";

// Request-body validation shared by every route, so a malformed or oversized
// request gets a 400 instead of reaching the model or throwing a 500.
const DEFAULT_MAX_BYTES = 1_000_000;

const text = (max: number) => z.string().max(max);

export const ContextSchema = z.object({
  courseCode: text(40),
  courseTitle: text(200),
  instructor: text(200).optional(),
  topicTitle: text(300),
  topicSummary: text(1000),
  objectives: z.array(text(500)).max(12),
  prereqTitles: z.array(text(300)).max(40),
  mastery: z.number().min(0).max(1).optional(),
});

const ModeSchema = z.enum(["walkthrough", "socratic", "visual", "derive", "recap"]);
export { ModeSchema };

export const PolicySchema = z.object({
  helpLevel: z.enum(["hints", "guided", "full"]),
  emphasis: text(2000),
  notation: text(2000),
  offLimits: text(2000),
  allowedModes: z.array(ModeSchema).max(5),
  attemptFirst: z.boolean(),
});

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

const reject = (error: string, status = 400): Parsed<never> => ({ ok: false, response: Response.json({ error }, { status }) });

export async function parseBody<T extends z.ZodType>(req: Request, schema: T, maxBytes = DEFAULT_MAX_BYTES): Promise<Parsed<z.infer<T>>> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) return reject("That request is too large.", 413);
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return reject("The request could not be read.");
  }
  if (raw.length > maxBytes) return reject("That request is too large.", 413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return reject("The request was not valid JSON.");
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    return reject(`Invalid request: ${issue.path.join(".") || "body"} ${issue.message}`);
  }
  return { ok: true, data: result.data };
}
