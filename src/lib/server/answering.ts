import type { AnswerKey, Grade, Review, TopicContext } from "../types";
import { gradeAnswer, reviewAnswer } from "./grading";
import { close, closeRevealed, endSitting, findQuestion, keyOf, setSelfScore, type Vaulted } from "./vault";

export type Outcome<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };
const no = (status: number, error: string) => ({ ok: false as const, status, error });
const plain = (score: number): Grade => ({ score, feedback: "", missed: [] });
const BLANK: Review = { score: 0, lines: [], feedback: "No answer was given.", fullCredit: "" };

// Answers a practice question, for the app and for MCP alike. The first answer
// closes the question and fixes its recorded score; a question that comes round
// again can be answered again, but its record does not change. `first` says
// whether this call was the one that closed it.
export async function answerQuestion(
  userId: string,
  q: Vaulted,
  given: { choice?: number; text?: string; reveal?: boolean; selfScore?: number; context?: TopicContext; signal?: AbortSignal },
): Promise<Outcome<{ grade: Grade | null; key: AnswerKey; first: boolean }>> {
  const key = keyOf(q);

  if (given.selfScore !== undefined) {
    // A hand mark counts only for a question that was closed by showing its key.
    if (!q.revealed) return no(400, "Answer the question first.");
    await setSelfScore(userId, q.id, given.selfScore);
    return { ok: true, grade: plain(given.selfScore), key, first: q.score === null };
  }

  if (q.style === "exam") {
    // Blind work is marked by the reviewer. The only thing allowed here is giving
    // up on a question, which scores it zero; once it is closed, its key can be read.
    if (q.answeredAt !== null) return { ok: true, grade: plain(q.score ?? 0), key, first: false };
    if (!given.reveal) return no(400, "This is blind practice. Hand it in to have it marked.");
    return { ok: true, grade: plain(0), key, first: await close(userId, q.id, 0, BLANK) };
  }

  if (given.reveal) {
    // Multiple choice cannot be marked by hand: showing its key is a zero.
    const first = q.kind === "mcq" ? await close(userId, q.id, 0) : await closeRevealed(userId, q.id);
    await endSitting(userId, q.id);
    return { ok: true, grade: q.kind === "mcq" ? plain(0) : null, key, first };
  }

  let grade: Grade;
  if (q.kind === "mcq") {
    if (given.choice === undefined) return no(400, "Pick an option first.");
    grade = plain(given.choice === q.answerIndex ? 1 : 0);
  } else {
    if (!given.text?.trim()) return no(400, "Write an answer first.");
    if (!given.context) return no(400, "Invalid request: context is missing.");
    grade = await gradeAnswer({ context: given.context, prompt: q.prompt, answer: given.text, solution: q.solution, rubric: q.rubric, signal: given.signal });
  }
  const first = await close(userId, q.id, grade.score);
  await endSitting(userId, q.id);
  return { ok: true, grade, key, first };
}

// What a closed piece of blind work was given. The marking is kept with the
// question, so asking again returns the same result.
const stored = (q: Vaulted): Review => q.review ?? { score: q.score ?? 0, lines: [], feedback: "", fullCredit: "" };

// Closes one piece of blind work with its marking. The result is whatever the
// question was first closed with: if another request got there first, that one's.
export async function closeBlind(userId: string, q: Vaulted, review: Review): Promise<{ review: Review; key: AnswerKey; first: boolean }> {
  if (await close(userId, q.id, review.score, review)) return { review, key: keyOf(q), first: true };
  const now = (await findQuestion(userId, q.id)) ?? q;
  return { review: stored(now), key: keyOf(q), first: false };
}

// Marks one piece of blind work, once. The reviewer runs before the question is
// closed, and closing records the result in the same write, so the key cannot be
// read while marking is under way and a failed marking leaves the question open.
// Handing in a question that is already closed returns its first marking.
export async function reviewBlind(
  userId: string,
  q: Vaulted,
  work: { answer: string; photos?: string[]; context: TopicContext; material?: string; signal?: AbortSignal },
): Promise<Outcome<{ review: Review; key: AnswerKey; first: boolean }>> {
  if (q.answeredAt !== null) return { ok: true, review: stored(q), key: keyOf(q), first: false };
  if (q.rubric.length === 0) return no(400, "That question has no rubric to mark against.");
  const review = await reviewAnswer({ context: work.context, question: q, answer: work.answer, photos: work.photos, material: work.material, signal: work.signal });
  return { ok: true, ...(await closeBlind(userId, q, review)) };
}
