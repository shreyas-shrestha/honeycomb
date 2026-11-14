import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { InstructorPolicy } from "../types";

export const MODEL = process.env.HIVE_MODEL ?? "claude-opus-5-5";
// If the model's safety classifiers decline a request, the API reruns it on a
// fallback model inside the same call instead of returning nothing.
const BETAS = ["server-side-fallback-2026-07-01"];

type Effort = "low" | "medium" | "high";

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let cached: Anthropic | null = null;
const client = () => (cached ??= new Anthropic());

export function errorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.";
  if (e instanceof Anthropic.RateLimitError) return "The AI service is rate limited right now. Try again in a minute.";
  if (e instanceof Anthropic.APIConnectionError) return "Could not reach the AI service. Check your connection.";
  if (e instanceof Anthropic.APIError) return `The AI service returned an error (${e.status ?? "unknown"}): ${e.message}`;
  return e instanceof Error ? e.message : "Something went wrong.";
}

export const NO_AI = () =>
  Response.json(
    { error: "AI is not configured. Add ANTHROPIC_API_KEY to .env.local and restart the dev server." },
    { status: 503 },
  );

export async function structured<T extends z.ZodType>(opts: {
  schema: T;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[] | string;
  effort?: Effort;
}): Promise<z.infer<T>> {
  const res = await client().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: "default",
    system: opts.system,
    output_config: { effort: opts.effort ?? "medium", format: zodOutputFormat(opts.schema) },
    messages: [{ role: "user", content: opts.content }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (res.stop_reason === "max_tokens") throw new Error("The response was cut off. Try a shorter syllabus or fewer items.");
  if (!res.parsed_output) throw new Error("The model returned output that did not match the expected format.");
  return res.parsed_output;
}

export function streamText(opts: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  effort?: Effort;
}): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = client().beta.messages.stream({
          model: MODEL,
          max_tokens: 32000,
          betas: BETAS,
          fallbacks: "default",
          system: opts.system,
          output_config: { effort: opts.effort ?? "low" },
          messages: opts.messages,
        });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(enc.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(enc.encode("\n\n*The model declined to answer this.*"));
      } catch (e) {
        controller.enqueue(enc.encode(`\n\n**Error:** ${errorMessage(e)}`));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export interface TopicContext {
  courseCode: string;
  courseTitle: string;
  instructor?: string;
  topicTitle: string;
  topicSummary: string;
  objectives: string[];
  prereqTitles: string[];
  mastery?: number;
}

export const FORMAT_RULES =
  "Write in GitHub-flavoured Markdown. Put mathematics in LaTeX using $...$ inline and $$...$$ for display, and put code in fenced blocks with a language tag.";

export function courseBlock(c: TopicContext, policy?: InstructorPolicy): string {
  const lines = [
    `Course: ${c.courseCode} ${c.courseTitle} at Georgia Tech${c.instructor ? `, taught by ${c.instructor}` : ""}.`,
    `Topic: ${c.topicTitle}. ${c.topicSummary}`,
    c.objectives.length ? `After this topic the student should be able to:\n${c.objectives.map((o) => `- ${o}`).join("\n")}` : "",
    c.prereqTitles.length ? `Topics the student has already met: ${c.prereqTitles.join("; ")}.` : "",
    policy?.emphasis ? `The instructor emphasises: ${policy.emphasis}` : "",
    policy?.notation ? `Follow the instructor's notation and conventions: ${policy.notation}` : "",
  ];
  return lines.filter(Boolean).join("\n\n");
}

export function levelNote(mastery: number | undefined): string {
  if (mastery === undefined) return "";
  if (mastery < 0.3) return "The student is new to this topic, so assume nothing beyond the prerequisites and keep each step small.";
  if (mastery < 0.7) return "The student has seen this topic and gets about half of questions on it right, so spend the words on the parts that are easy to get wrong.";
  return "The student is already strong on this topic, so skip the basics and go to edge cases and exam-level difficulty.";
}
