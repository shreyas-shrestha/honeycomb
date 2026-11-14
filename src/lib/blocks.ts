import { z } from "zod";

// The shape of an interactive lesson, shared by the server (which validates
// what the model writes and what instructors publish) and the Studio (which
// validates steps written by hand). The rules past basic shape are the ones the
// player relies on: a lesson that breaks them could not be completed.
const need = (max: number) => z.string().trim().min(1, "is empty").max(max);
const md = need(20_000);
const short = need(2000);
const unique = (items: string[]) => new Set(items.map((s) => s.trim())).size === items.length;

export const BlockSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), title: z.string().max(200), body: md }),
    z.object({ kind: z.literal("check"), prompt: md, options: z.array(short).min(2).max(6), answer: z.number().int().min(0), why: z.string().max(20_000) }),
    z.object({ kind: z.literal("order"), prompt: md, steps: z.array(short).min(3).max(8), why: z.string().max(20_000) }),
    z.object({ kind: z.literal("fill"), prompt: md, parts: z.array(z.string().max(4000)).min(2).max(7), blanks: z.array(need(200)).min(1).max(6), bank: z.array(need(200)).min(2).max(12), why: z.string().max(20_000) }),
    z.object({ kind: z.literal("match"), prompt: md, pairs: z.array(z.object({ left: short, right: short })).min(3).max(6) }),
    z.object({
      kind: z.literal("trace"),
      title: z.string().max(200),
      frames: z.array(z.object({ caption: md, cells: z.array(z.string().max(40)).min(1).max(16), active: z.array(z.number().int().min(0).max(15)).max(16) })).min(2).max(14),
    }),
    z.object({ kind: z.literal("reveal"), prompt: md, answer: md }),
  ])
  .superRefine((b, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (b.kind === "check" && b.answer >= b.options.length) fail("has no correct option marked");
    if (b.kind === "order" && !unique(b.steps)) fail("has two identical steps");
    if (b.kind === "match" && (!unique(b.pairs.map((p) => p.left)) || !unique(b.pairs.map((p) => p.right)))) fail("has two identical items on one side");
    if (b.kind === "fill") {
      if (b.parts.length !== b.blanks.length + 1) fail("has a different number of blanks and answers");
      if (!unique(b.bank) || !unique(b.blanks)) fail("repeats a word; each blank needs a different word");
      if (!b.blanks.every((w) => b.bank.includes(w))) fail("is missing an answer from its word bank");
    }
  });

export const MAX_BLOCKS = 14;
export const BlocksSchema = z.array(BlockSchema).min(1).max(MAX_BLOCKS);

// Why a step cannot be used, in words, or null when it is fine.
export function blockProblem(block: unknown): string | null {
  const result = BlockSchema.safeParse(block);
  if (result.success) return null;
  const issue = result.error.issues[0];
  const where = issue.path.length ? `${issue.path.join(" ")} ` : "This step ";
  return `${where}${issue.message}`;
}
