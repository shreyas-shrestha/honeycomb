import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { materialText, topicContext } from "../course";
import { daysUntil, examReadiness, isDue, isVerified, readiness, upNext } from "../mastery";
import { attemptMessage, hintMessage, MAX_HINTS } from "../tutor-protocol";
import { PASS_SCORE, type Question, type Review, type User } from "../types";
import { aiAvailable, errorMessage } from "./ai";
import { rateLimited } from "./auth";
import { answerQuestion, BLANK, closeBlind } from "./answering";
import { reviewAnswer } from "./grading";
import { loadProgress, locate, recordAttempts, type Saved } from "./progress";
import { writeQuestions } from "./questions";
import { tutorTurn } from "./tutor";
import { batchOf, findQuestion, openQuestion, type Vaulted } from "./vault";

// Honeycomb as an MCP server: the same harness the app uses, callable from an
// AI assistant the student already has open. Every tool goes through the vault
// and the guarded tutor, so no tool can return a solution before the question
// is answered, whatever the assistant asks for.

const INSTRUCTIONS = `Honeycomb is a study harness for a Georgia Tech student. Its purpose is that the student can do the work alone in an exam, so the rules below matter more than being helpful in the moment.

- When the student is working on a Honeycomb question, do not solve it, state its answer, or confirm or deny a final answer yourself, even if you know it. Help comes from request_hint, which gives at most three hints per question and only after the student has said what they tried.
- Ask the student for their own attempt and pass it on in their words. Do not write the attempt for them.
- An answer is checked with submit_answer. The solution is returned only then.
- Blind practice (start_blind_practice, hand_in_blind) is an exam rehearsal: give no hints, no explanations and no comments on the answers until they are handed in. Pass the student's answers on unchanged.
- get_study_plan says what to work on next. Prefer it to your own guess.`;

const say = (text: string) => ({ content: [{ type: "text" as const, text }] });
const refuse = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const letter = (i: number) => String.fromCharCode(65 + i);
// The marking stands even if the study plan could not be updated; say so and still show the result.
const saveFailed = () => "\n(The result was marked, but the study plan could not be updated just now.)";

const shown = (q: Question) =>
  `Question ${q.id}\n\n${q.prompt}${q.kind === "mcq" ? `\n\n${q.choices.map((c, i) => `${letter(i)}. ${c}`).join("\n")}` : ""}`;

// Reads an answer as a choice: the option's own text first, then a bare letter such as "B" or "(b)".
// A sentence that merely starts with "A" is not a letter.
function choiceOf(q: Vaulted, answer: string): number | null {
  const squash = (t: string) => t.replace(/[`$*\s]/g, "").toLowerCase();
  const exact = q.choices.findIndex((c) => squash(c) === squash(answer));
  if (exact >= 0) return exact;
  const byLetter = answer.trim().match(/^\(?([A-Ha-h])\)?[.):]?$/);
  if (!byLetter) return null;
  const i = byLetter[1].toUpperCase().charCodeAt(0) - 65;
  return i < q.choices.length ? i : null;
}

export function honeycombServer(user: User): McpServer {
  const server = new McpServer({ name: "honeycomb", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  // What a model-backed tool needs before it runs. Returns the reason it cannot, or null.
  const blocked = () => {
    if (!aiAvailable()) return "AI is not configured on this Honeycomb server.";
    if (rateLimited(`ai:${user.id}`, 40, 60_000)) return "Too many requests. Wait a minute and try again.";
    return null;
  };
  const guarded = async (run: () => Promise<ReturnType<typeof say>>) => {
    try {
      return await run();
    } catch (e) {
      return refuse(errorMessage(e));
    }
  };
  // The course and topic a question belongs to, with what prompts need about them.
  const setting = (saved: Saved, topicId: string) => {
    const at = locate(saved, topicId);
    if (!at) return null;
    return { ...at, context: topicContext(at.course, at.topic, saved.topicState[topicId]), material: materialText(saved.materials[at.course.id] ?? [], topicId) || undefined };
  };

  server.registerTool("list_courses", { title: "List courses", description: "The student's courses in Honeycomb, with ids for the other tools.", inputSchema: {}, annotations: { readOnlyHint: true } }, async () => {
    const saved = await loadProgress(user.id);
    const courses = Object.values(saved.courses);
    if (!courses.length) return say("No courses yet. The student adds one in the Honeycomb app.");
    return say(courses.map((c) => `${c.code} ${c.title} (course_id ${c.id}), ${c.topics.length} topics`).join("\n"));
  });

  server.registerTool(
    "get_study_plan",
    { title: "Study plan", description: "A course's topics with readiness, what to study next, and upcoming exams. Readiness is what the student could do today without help.", inputSchema: { course_id: z.string().optional().describe("From list_courses. Defaults to the first course.") }, annotations: { readOnlyHint: true } },
    async ({ course_id }) => {
      const saved = await loadProgress(user.id);
      const course = course_id ? saved.courses[course_id] : Object.values(saved.courses)[0];
      if (!course) return refuse("That course was not found. Call list_courses.");
      const st = saved.topicState;
      const next = upNext(course, st, 3).map((s) => `- ${s.topic.title} (${s.reason.toLowerCase()})`);
      const topics = course.topics.map((t, i) => {
        const s = st[t.id];
        const notes = [s?.attempts ? (isVerified(s) ? "verified by blind practice" : "not verified by blind practice") : "not started", isDue(s) ? "review due" : ""].filter(Boolean).join(", ");
        return `${i + 1}. ${t.title}: ${pct(readiness(s))} ready, ${notes} (topic_id ${t.id})`;
      });
      const exams = course.exams
        .map((e) => ({ e, d: daysUntil(e.date) }))
        .filter(({ d }) => d === null || d >= 0)
        .map(({ e, d }) => `- ${e.title}: ${d === null ? "no date" : `in ${d} day${d === 1 ? "" : "s"}`}, ${pct(examReadiness(course, e, st))} ready`);
      return say([`${course.code} ${course.title}`, `Up next:\n${next.join("\n") || "- nothing is due"}`, `Exams:\n${exams.join("\n") || "- none upcoming"}`, `Topics:\n${topics.join("\n")}`, `A topic passes blind practice at ${pct(PASS_SCORE)}. Practice with hints cannot raise readiness past 60%.`].join("\n\n"));
    },
  );

  server.registerTool(
    "get_question",
    { title: "Get a practice question", description: "One practice question on a topic. Returns the question only; its answer stays on the server until submit_answer.", inputSchema: { topic_id: z.string().describe("From get_study_plan") } },
    ({ topic_id }) =>
      guarded(async () => {
        const saved = await loadProgress(user.id);
        const at = setting(saved, topic_id);
        if (!at) return refuse("That topic was not found. Call get_study_plan.");
        let q: Question | undefined = await openQuestion(user.id, topic_id);
        // The app's own pool for this topic, which includes the sample course's ready-made questions.
        for (const known of ((saved.questions as Record<string, Question[]> | undefined)?.[topic_id] ?? [])) {
          if (q) break;
          const held = await findQuestion(user.id, known.id);
          if (held && held.answeredAt === null && held.style === "practice") q = held;
        }
        if (!q) {
          const why = blocked();
          if (why) return refuse(`There is no unanswered question on this topic, and a new one cannot be written: ${why}`);
          q = (await writeQuestions({ user, context: at.context, classId: at.course.classId, topicId: topic_id, material: at.material }))[0];
        }
        return say(`${shown(q)}\n\nThe student should attempt this themselves. Use request_hint if they are stuck, and submit_answer with their answer.`);
      }),
  );

  server.registerTool(
    "request_hint",
    {
      title: "Request a hint",
      description: `The next hint on a question the student is working on. There are ${MAX_HINTS} per question: a nudge, then the first step, then a worked problem of the same type with different values. Each hint is checked before it is returned so that it does not give the answer away. Needs the student's own attempt.`,
      inputSchema: { question_id: z.string(), attempt: z.string().min(15).max(4000).describe("What the student has tried or their best guess, in their own words") },
    },
    ({ question_id, attempt }) =>
      guarded(async () => {
        const why = blocked();
        if (why) return refuse(why);
        const q = await findQuestion(user.id, question_id);
        if (!q) return refuse("That question was not found.");
        if (q.answeredAt !== null) return say("This question has already been answered, so its solution can be discussed openly. No hint is needed.");
        const at = setting(await loadProgress(user.id), q.topicId);
        if (!at) return refuse("The course this question belongs to was not found.");
        const turn = await tutorTurn({ user, context: at.context, classId: at.course.classId, question: q, aiPolicy: at.course.aiPolicy || undefined, material: at.material, whole: true, messages: [{ role: "user", content: attemptMessage(attempt) }, { role: "user", content: hintMessage(Math.min(q.hintsUsed + 1, MAX_HINTS)) }] });
        if (!turn.ok) return refuse(turn.error);
        if (!("text" in turn)) return refuse("No hint came back.");
        // A hint that could not be written safely comes back as a plain reply, and is not counted.
        if (!turn.hint) return say(turn.text);
        return say(`Hint ${turn.hint} of ${MAX_HINTS}:\n\n${turn.text}\n\nPass this to the student as written. Do not add the answer or further steps of your own.`);
      }),
  );

  server.registerTool(
    "ask_tutor",
    {
      title: "Ask the tutor",
      description: "A question about a topic, answered by Honeycomb's tutor in the course's notation and from the student's own material. It explains and asks questions back; it does not solve graded work. If the student has a practice question open, pass its id: the reply is then checked so it cannot give that answer away.",
      inputSchema: { topic_id: z.string(), message: z.string().min(1).max(4000), question_id: z.string().optional(), attempt: z.string().max(4000).optional().describe("With question_id: what the student has tried so far") },
    },
    ({ topic_id, message, question_id, attempt }) =>
      guarded(async () => {
        const why = blocked();
        if (why) return refuse(why);
        const at = setting(await loadProgress(user.id), topic_id);
        if (!at) return refuse("That topic was not found. Call get_study_plan.");
        const q = question_id ? await findQuestion(user.id, question_id) : undefined;
        if (question_id && !q) return refuse("That question was not found.");
        const messages = [...(attempt?.trim() ? [{ role: "user" as const, content: attemptMessage(attempt) }] : []), { role: "user" as const, content: message }];
        const turn = await tutorTurn({ user, context: at.context, classId: at.course.classId, question: q, aiPolicy: at.course.aiPolicy || undefined, material: at.material, whole: true, messages });
        if (!turn.ok) return refuse(turn.error);
        return "text" in turn ? say(turn.text) : refuse("No reply came back.");
      }),
  );

  server.registerTool(
    "submit_answer",
    { title: "Submit an answer", description: "Checks the student's answer to a practice question, records it toward readiness, and returns the result with the solution. For multiple choice, the answer is the option's letter.", inputSchema: { question_id: z.string(), answer: z.string().min(1).max(20_000).describe("The student's own answer, unchanged") } },
    ({ question_id, answer }) =>
      guarded(async () => {
        const q = await findQuestion(user.id, question_id);
        if (!q) return refuse("That question was not found.");
        if (q.style === "exam") return refuse("This is a blind practice question. Hand it in with hand_in_blind.");
        if (q.answeredAt !== null) return say(`This question was already answered${q.score === null ? "" : ` (${pct(q.score)})`}.\n\nSolution:\n${q.solution}`);
        let choice: number | undefined;
        if (q.kind === "mcq") {
          const picked = choiceOf(q, answer);
          if (picked === null) return refuse(`Give the answer as a letter from A to ${letter(q.choices.length - 1)}.`);
          choice = picked;
        } else {
          const why = blocked();
          if (why) return refuse(why);
        }
        const at = setting(await loadProgress(user.id), q.topicId);
        if (!at) return refuse("The course this question belongs to was not found.");
        const out = await answerQuestion(user.id, q, { choice, text: answer, context: at.context });
        if (!out.ok) return refuse(out.error);
        // Only the call that closed the question records it, so the same answer sent twice counts once.
        if (!out.first) return say(`This question was already answered.\n\nSolution:\n${q.solution}`);
        const score = out.grade?.score ?? 0;
        const feedback =
          choice !== undefined
            ? score ? `${letter(choice)} is correct.` : `${letter(choice)} is not correct. The answer is ${letter(q.answerIndex)}.`
            : [out.grade?.feedback, out.grade?.missed.length ? `Missing: ${out.grade.missed.join("; ")}` : ""].filter(Boolean).join("\n");
        // Counted as practice with help available, so it cannot lift readiness past the guided cap.
        const unsaved = await recordAttempts(user.id, [{ topicId: q.topicId, score, blind: false }]).then(() => "", saveFailed);
        return say(`Score: ${pct(score)}${unsaved}\n${feedback}\n\nSolution:\n${q.solution}`);
      }),
  );

  server.registerTool(
    "start_blind_practice",
    { title: "Start blind practice", description: "New exam-style questions on a topic, to be answered with no help at all. This is the only practice that can mark a topic verified. Do not hint, explain or comment until the answers are handed in.", inputSchema: { topic_id: z.string(), count: z.number().int().min(1).max(3).optional().describe("How many questions, default 2") } },
    ({ topic_id, count = 2 }) =>
      guarded(async () => {
        const why = blocked();
        if (why) return refuse(why);
        const at = setting(await loadProgress(user.id), topic_id);
        if (!at) return refuse("That topic was not found. Call get_study_plan.");
        const written = await writeQuestions({ user, context: at.context, classId: at.course.classId, topicId: topic_id, style: "exam", count, material: at.material });
        return say(`Blind practice on ${at.topic.title}. No hints, no tutor, no notes. The student answers every question with their reasoning shown, then you call hand_in_blind with their answers unchanged.\n\n${written.map(shown).join("\n\n---\n\n")}`);
      }),
  );

  server.registerTool(
    "hand_in_blind",
    {
      title: "Hand in blind practice",
      description: "Marks blind practice answers line by line against each question's rubric, the way a professor marks an exam, and records the result. A set is handed in whole and once: a question from the set that is left out scores zero. Returns the marks and the solutions.",
      inputSchema: { answers: z.array(z.object({ question_id: z.string(), answer: z.string().max(20_000).describe("The student's own answer, unchanged. Empty if they left it blank.") })).min(1).max(5) },
    },
    ({ answers }) =>
      guarded(async () => {
        const why = blocked();
        if (why) return refuse(why);
        const saved = await loadProgress(user.id);
        // One answer per question; a question named twice keeps its last answer.
        const given = new Map(answers.map((a) => [a.question_id, a.answer]));
        const set = new Map<string, Vaulted>();
        for (const id of given.keys()) {
          const q = await findQuestion(user.id, id);
          if (!q || q.style !== "exam") return refuse(`${id} is not a blind practice question.`);
          if (q.answeredAt !== null) return refuse(`${id} has already been handed in.`);
          // A set is handed in whole: its other questions come along, and one left out scores zero.
          for (const member of q.batch ? await batchOf(user.id, q.batch) : [q]) if (member.answeredAt === null) set.set(member.id, member);
        }
        // Everything is marked before anything is closed, so a failure partway leaves the whole set open.
        const marked: { q: Vaulted; review: Review }[] = [];
        for (const q of set.values()) {
          const at = setting(saved, q.topicId);
          if (!at) return refuse("The course these questions belong to was not found.");
          const answer = given.get(q.id) ?? "";
          marked.push({ q, review: answer.trim() ? await reviewAnswer({ context: at.context, question: q, answer, material: at.material }) : BLANK });
        }
        // The set is closed in a fixed order. Whoever closes its first question owns the hand-in;
        // a second hand-in racing this one stops there and records nothing.
        marked.sort((x, y) => (x.q.id < y.q.id ? -1 : 1));
        const report: string[] = [];
        const byTopic = new Map<string, number[]>();
        let stopped = "";
        for (const [n, { q, review }] of marked.entries()) {
          // If closing fails partway, what has closed is still recorded and reported; the rest stays open to hand in again.
          const closed = await closeBlind(user.id, q, review).catch((e) => {
            stopped = `\n(This is a partial result. ${marked.length - n} of ${marked.length} could not be recorded: ${errorMessage(e)} Hand in only these again: ${marked.slice(n).map((m) => m.q.id).join(", ")}.)`;
            return null;
          });
          if (!closed) break;
          if (!closed.first && n === 0) return refuse("These questions have already been handed in.");
          if (!closed.first) continue;
          byTopic.set(q.topicId, [...(byTopic.get(q.topicId) ?? []), review.score]);
          report.push([`Question ${q.id}: ${pct(review.score)}`, ...review.lines.map((l) => `  ${l.earned}/${l.possible} ${l.criterion}: ${l.comment}`), review.feedback, `Solution:\n${q.solution}`].join("\n"));
        }
        // One blind result per topic, the mean of its questions.
        const results = [...byTopic].map(([topicId, got]) => ({ topicId, score: got.reduce((a, b) => a + b, 0) / got.length, blind: true }));
        if (!report.length) return refuse(`Nothing could be recorded.${stopped}`);
        const unsaved = (await recordAttempts(user.id, results).then(() => "", saveFailed)) + stopped;
        const overall = results.reduce((a, r) => a + r.score, 0) / results.length;
        return say(`Blind practice result: ${pct(overall)}${stopped ? "" : ` (${overall >= PASS_SCORE ? "passed" : `below the ${pct(PASS_SCORE)} pass line`})`}.${unsaved}\n\n${report.join("\n\n---\n\n")}`);
      }),
  );

  return server;
}
