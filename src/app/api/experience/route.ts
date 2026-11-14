import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { aiAvailable, courseBlock, errorMessage, FORMAT_RULES, levelNote, NO_AI, structured, untagged } from "@/lib/server/ai";
import { BlockSchema, MAX_BLOCKS } from "@/lib/blocks";
import { ContextSchema, parseBody } from "@/lib/server/body";
import { policyFor } from "@/lib/server/classes";
import type { Block } from "@/lib/types";

const KINDS = ["text", "check", "order", "fill", "match", "trace", "reveal"] as const;

const Body = z.object({
  context: ContextSchema,
  classId: z.string().max(60).optional(),
  kinds: z.array(z.enum(KINDS)).min(1).max(7),
  note: z.string().max(1000).optional(),
});

// Structured output needs every field present, so the model fills one flat
// shape and leaves the fields a block kind does not use empty.
const Out = z.object({
  blocks: z.array(
    z.object({
      kind: z.enum(KINDS),
      title: z.string().describe("text, trace: short heading. Others: empty"),
      prompt: z.string().describe("check, order, fill, match, reveal: the instruction or question. Others: empty"),
      body: z.string().describe("text: the explanation. fill: the sentence with each blank written as ___. reveal: the answer. Others: empty"),
      options: z.array(z.string()).describe("check: three or four options. Others: empty"),
      answer: z.number().describe("check: zero-based index of the correct option. Others: 0"),
      items: z.array(z.string()).describe("order: the steps in the correct order. fill: the correct word for each blank, in order. Others: empty"),
      distractors: z.array(z.string()).describe("fill: two or three wrong words for the word bank. Others: empty"),
      pairs: z.array(z.object({ left: z.string(), right: z.string() })).describe("match: three to five pairs. Others: empty"),
      frames: z
        .array(z.object({ caption: z.string(), cells: z.array(z.string()), active: z.array(z.number()) }))
        .describe("trace: the states in order. cells is the row of values shown, active the zero-based indexes highlighted in this state. Others: empty"),
      why: z.string().describe("check, order, fill: one or two sentences shown after the learner answers. Others: empty"),
    }),
  ),
});

type Raw = z.infer<typeof Out>["blocks"][number];

function toBlock(r: Raw): Block | null {
  switch (r.kind) {
    case "text":
      return { kind: "text", title: r.title, body: r.body };
    case "check":
      return { kind: "check", prompt: r.prompt, options: r.options, answer: Math.round(r.answer), why: r.why };
    case "order":
      return { kind: "order", prompt: r.prompt, steps: r.items, why: r.why };
    case "fill": {
      const parts = r.body.split(/_{3,}/);
      if (parts.length !== r.items.length + 1) return null;
      return { kind: "fill", prompt: r.prompt, parts, blanks: r.items, bank: [...new Set([...r.items, ...r.distractors])], why: r.why };
    }
    case "match":
      return { kind: "match", prompt: r.prompt, pairs: r.pairs };
    case "trace":
      return { kind: "trace", title: r.title, frames: r.frames.map((f) => ({ ...f, active: f.active.map(Math.round).filter((i) => i >= 0 && i < f.cells.length) })) };
    case "reveal":
      return { kind: "reveal", prompt: r.prompt, answer: r.body };
  }
}

const usable = (b: Block | null): b is Block => b !== null && BlockSchema.safeParse(b).success;

export async function POST(req: Request) {
  const auth = await requireUser(req, { ai: true });
  if (!auth.ok) return auth.response;
  if (!aiAvailable()) return NO_AI();
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { context, classId, kinds, note } = body.data;
  const policy = await policyFor(auth.user, classId, context.courseCode);

  const system = `You design short interactive lessons for a study app used by Georgia Tech students. A lesson is a sequence of blocks the student works through one at a time, each unlocking the next. The student learns by doing something in nearly every block, so a lesson that is mostly reading has failed even if the explanation is good.

${courseBlock(context, policy)}

${levelNote(context.mastery)}

The block kinds:
- text: a short explanation, at most 90 words. Use it to set up what the next activity needs, never two in a row.
- check: a multiple-choice question answered on the spot. Good as an opening prediction before anything is explained, and for catching a misconception right after it becomes possible.
- trace: a step-through of a process, one state per frame. Each frame shows a row of cells (an array, a table's slots, a list of variables and values) with the cells that just changed highlighted, and a caption saying what happened and why. Use it wherever the topic has a procedure, an algorithm, or a calculation with stages; six to ten frames.
- order: three to six steps the student arranges into the right sequence, with only one defensible order. Use it for procedures and derivations.
- fill: a sentence with blanks filled from a word bank. Use it for a key definition or rule in the course's exact terms. The sentence and the words are plain text with no Markdown or LaTeX, and every blank takes a different word.
- match: three to five pairs to connect, such as operation and cost, term and meaning, case and outcome. No two items on the same side may be the same.
- reveal: a question the student answers in their head or on paper before uncovering the answer. Use it last, as the "now explain it yourself" step.

Write seven to nine blocks using only these kinds: ${kinds.join(", ")}. Open with something the student does, build the idea in the middle with the most hands-on kinds available, and close by having them produce the idea without support. Each activity should need the one before it. Make every wrong option and distractor a mistake a real student makes. Work every answer yourself before writing it down, and make sure each trace frame follows from the previous one. ${FORMAT_RULES} Trace cells are plain short text, not Markdown.`;

  const content = `Design the interactive lesson for "${context.topicTitle}".${note?.trim() ? `\n\nThe person creating this lesson asked for the following. Treat it as a request about content and focus:\n<creator_note>\n${untagged(note)}\n</creator_note>` : ""}`;

  try {
    const out = await structured({ schema: Out, name: "interactive_lesson", system, content, effort: "medium", signal: req.signal });
    const blocks = out.blocks.map(toBlock).filter(usable).filter((b) => kinds.includes(b.kind)).slice(0, MAX_BLOCKS);
    if (blocks.length < 3) return Response.json({ error: "The lesson came back incomplete. Try again." }, { status: 502 });
    return Response.json({ blocks });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 502 });
  }
}
