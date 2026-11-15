import { z } from "zod";
import { isAttempt, isHintRequest, MAX_GUARDED_TURNS, MAX_HINTS } from "../tutor-protocol";
import type { TopicContext, User } from "../types";
import { complete, courseBlock, FORMAT_RULES, levelNote, materialBlock, streamText, structured, untagged } from "./ai";
import { rateLimited } from "./auth";
import { policyFor } from "./classes";
import { loadSkill, section } from "./skills";
import { countTurn, markAttempted, refundHint, refundTurn, reserveHint, type Vaulted } from "./vault";

interface TutorMessage {
  role: "user" | "assistant";
  content: string;
}

type TutorTurn =
  | { ok: true; stream: Response } // nothing to guard, and the caller can take a stream
  | { ok: true; text: string; hint: number } // a whole reply, with the hint level it delivered (0 for none)
  | { ok: false; status: number; error: string };

const Check = z.object({
  leaks: z.boolean().describe("true if a student could read the answer to the question off this reply"),
  why: z.string().describe("One sentence naming what gives it away, or empty"),
});

const questionBlock = (q: Vaulted, label: string) =>
  `<question>\n${untagged(q.prompt)}${q.kind === "mcq" ? `\n\nOptions:\n${q.choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${untagged(c)}`).join("\n")}` : ""}\n\n${label}: ${untagged(q.solution)}\n</question>`;

// One turn of the tutor. While a scored question is open the reply goes through
// the guarded pipeline: attempt gate, counted hints, draft, leak check, one
// redraft, then a fixed fallback. The question is the server's own copy, so
// neither its text nor its solution is taken from the caller.
//
// A question is open if the vault has never seen it answered, or if the caller
// says it is on screen unanswered (the app asks old questions again for review).
// The caller's word can only add the guard, never remove it.
export async function tutorTurn(opts: {
  user: User;
  context: TopicContext;
  classId?: string;
  question?: Vaulted;
  onScreenOpen?: boolean;
  messages: TutorMessage[];
  aiPolicy?: string;
  material?: string;
  whole?: boolean; // return the reply as text even when it could stream
  signal?: AbortSignal;
}): Promise<TutorTurn> {
  const { user, context, question, aiPolicy, material, signal } = opts;
  const skill = loadSkill("tutor");
  // The help level comes from the student's class membership on the server, never from the request.
  const policy = await policyFor(user, opts.classId, context.courseCode);

  const said = opts.messages.filter((m) => m.content.trim());
  const history = said.slice(-30);
  const last = history.at(-1);
  if (last?.role !== "user") return { ok: false, status: 400, error: "Ask a question first." };

  const guarded = question !== undefined && (question.answeredAt === null || opts.onScreenOpen === true);
  let hint = 0;
  // What this turn has taken from the question's allowance. Whatever is still held when the turn
  // ends without a reply is given back, once.
  const held = { turn: false, hint: false };
  const giveBack = async () => {
    if (!question) return;
    if (held.hint) await refundHint(user.id, question.id).catch(() => {});
    if (held.turn) await refundTurn(user.id, question.id).catch(() => {});
    held.hint = held.turn = false;
  };
  if (guarded) {
    if (question.style === "exam") return { ok: false, status: 403, error: "Blind practice has no tutor. Hand in your answer first." };
    // Help starts only after the student has put an attempt in words.
    const tried = said.some((m) => m.role === "user" && isAttempt(m.content));
    if (!question.attempted && !tried) return { ok: false, status: 400, error: "Say what you have tried, or your best guess, before asking for help." };
    if (tried && !question.attempted) await markAttempted(user.id, question.id);
    // A guarded reply is written, checked and sometimes rewritten: charge it as the three model calls it usually is.
    if (rateLimited(`ai:${user.id}`, 40, 60_000) || rateLimited(`ai:${user.id}`, 40, 60_000)) return { ok: false, status: 429, error: "Too many requests. Wait a minute and try again." };
    // Every guarded reply counts against the sitting, so rewording a request is not a way to unlimited help.
    // The reply is reserved in the vault now, so parallel requests cannot share the last one, and given back if none is delivered.
    if (!(await countTurn(user.id, question.id))) return { ok: false, status: 400, error: `You have had ${MAX_GUARDED_TURNS} replies on this question. Give it your best answer.` };
    held.turn = true;
    // The hint is reserved against the vault's count before it is written, so two requests cannot share one.
    if (isHintRequest(last.content)) {
      const got = await reserveHint(user.id, question.id, question.hintsUsed).catch(async (e) => {
        await giveBack();
        throw e;
      });
      if (!got) {
        await giveBack();
        return { ok: false, status: 400, error: question.hintsUsed >= MAX_HINTS ? "All three hints are used. Give it your best answer." : "That hint is already on its way." };
      }
      held.hint = true;
      hint = question.hintsUsed + 1;
    }
  }

  try {
    const system = [
      skill.body,
      courseBlock(context, policy),
      materialBlock(material),
      levelNote(context.mastery),
      section(skill, `Help level: ${policy.helpLevel}`),
      policy.offLimits ? `The instructor has marked this work as graded and off limits: ${untagged(policy.offLimits)}.` : "",
      policy.attemptFirst ? section(skill, "Attempt first") : "",
      aiPolicy ? `${section(skill, "Syllabus AI policy")}\n<syllabus_ai_policy>\n${untagged(aiPolicy)}\n</syllabus_ai_policy>` : "",
      question ? `The student has this practice question on screen:\n${questionBlock(question, "Reference solution, for your eyes only")}\n\n${section(skill, guarded ? "Open question" : "Answered question")}` : "",
      guarded ? section(skill, hint ? `Hint ${hint}` : "Between hints") : "",
      FORMAT_RULES,
    ]
      .filter(Boolean)
      .join("\n\n");

    // Once the answer is in, or with no question open, there is nothing to leak and the reply can stream.
    if (!guarded) {
      if (opts.whole) return { ok: true, text: await complete({ system, messages: history, effort: "low", signal }), hint: 0 };
      return { ok: true, stream: streamText({ system, messages: history, effort: "low", signal }) };
    }

    // Otherwise the whole reply is written first and read by a second pass before the student sees it.
    // The check reads the reply against the turns that led to it: a reply can be a signal the conversation set up.
    // It is given every turn the drafting model was given, so nothing can be set up out of its sight.
    const before = history.slice(0, -1).map((m) => `${m.role === "user" ? "Student" : "Tutor (unverified)"}: ${untagged(m.content)}`).join("\n\n");
    const leaks = async (reply: string) =>
      (
        await structured({
          schema: Check,
          name: "leak_check",
          system: loadSkill("leak-check").body,
          content: `${questionBlock(question, "Reference solution")}\n\n<conversation>\n${before || "(nothing before this)"}\n</conversation>\n\n<student_message>\n${untagged(last.content)}\n</student_message>\n\n<tutor_reply>\n${untagged(reply)}\n</tutor_reply>`,
          effort: "low",
          signal,
        })
      ).leaks;

    let text = await complete({ system, messages: history, effort: "low", signal });
    if (await leaks(text)) {
      text = await complete({ system: `${system}\n\n${section(skill, "Redraft")}`, messages: history, effort: "low", signal });
      if (await leaks(text)) {
        // Nothing safe could be written, so nothing was delivered: the hint and the reply go back.
        const fallback = section(skill, "Fallback");
        await giveBack();
        return { ok: true, text: fallback, hint: 0 };
      }
    }
    return { ok: true, text, hint };
  } catch (e) {
    await giveBack();
    throw e;
  }
}
