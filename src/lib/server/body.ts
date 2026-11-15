import { z } from "zod";
import { BlocksSchema } from "../blocks";

// Request-body validation shared by every route, so a malformed or oversized
// request gets a 400 instead of reaching the model or throwing a 500.
const DEFAULT_MAX_BYTES = 1_000_000;

const text = (max: number) => z.string().max(max);

// The student's own uploaded material for a topic, already digested to text.
export const MaterialText = z.string().max(12_000).optional();

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
  // "full" was an option in an earlier version; it now means guided.
  helpLevel: z.enum(["hints", "guided", "full"]).transform((l) => (l === "hints" ? "hints" : "guided")),
  emphasis: text(2000),
  notation: text(2000),
  offLimits: text(2000),
  allowedModes: z.array(ModeSchema).max(5),
  attemptFirst: z.boolean(),
});

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

const reject = (error: string, status = 400): Parsed<never> => ({ ok: false, response: Response.json({ error }, { status }) });

// Reads the body while counting bytes, so an oversized request is dropped
// without being held in memory first.
async function readCapped(req: Request, maxBytes: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T, maxBytes = DEFAULT_MAX_BYTES): Promise<Parsed<z.infer<T>>> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) return reject("That request is too large.", 413);
  let raw: string | null;
  try {
    raw = await readCapped(req, maxBytes);
  } catch {
    return reject("The request could not be read.");
  }
  if (raw === null) return reject("That request is too large.", 413);
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

// Shapes for content one user publishes and another receives. Unknown keys are
// dropped and every string is bounded, because a student's browser renders this.
// Ids are used as record keys and joined with ":" for lesson keys, so they stay plain.
const id = z.string().min(1).max(200).regex(/^[\w.~-]+$/, "has characters that are not allowed in an id");
const md = text(20_000);

const ExperienceSchema = z.object({ topicId: id, blocks: BlocksSchema, createdAt: text(40) });

const QuestionSchema = z.object({
  id,
  topicId: id,
  kind: z.enum(["mcq", "free"]),
  prompt: md,
  choices: z.array(text(4000)).max(6),
  answerIndex: z.number().int().min(0).max(5),
  solution: md,
  rubric: z.array(text(1000)).max(8),
  difficulty: z.number(),
});

const CourseSchema = z.object({
  id,
  code: text(40),
  title: text(200),
  instructor: text(200),
  term: text(80),
  units: z.array(z.object({ id, title: text(200), when: text(80).optional() })).max(40),
  topics: z
    .array(
      z.object({
        id,
        unitId: id,
        title: text(300),
        summary: text(1000),
        objectives: z.array(text(500)).max(12),
        prereqs: z.array(id).max(40),
        examIds: z.array(id).max(20),
        weight: z.number().min(1).max(3),
      }),
    )
    .min(1)
    .max(80),
  exams: z.array(z.object({ id, title: text(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), weightPct: z.number().nullable() })).max(20),
  grading: z.array(z.object({ name: text(200), pct: z.number() })).max(20),
  aiPolicy: text(2000),
  basis: z.enum(["syllabus", "web", "demo"]),
  sources: z.array(z.object({ title: text(300), url: z.string().max(2000).regex(/^https?:\/\//) })).max(12),
  createdAt: text(40),
});

export const BundleSchema = z.object({
  course: CourseSchema,
  questions: z.record(id, z.array(QuestionSchema).max(40)),
  lessons: z.record(z.string().max(240).regex(/^[\w.~-]+:[a-z]+$/), md),
  experiences: z.record(id, ExperienceSchema),
});
