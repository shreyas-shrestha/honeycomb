import { buildDemoCourse } from "../demo-course";
import { MAX_GUARDED_TURNS, MAX_HINTS } from "../tutor-protocol";
import type { AnswerKey, Question, Review } from "../types";
import { newId } from "./auth";
import { all, one, run } from "./db";

const MAX_HELD = 3000; // questions one account may keep

// A question as the server holds it: the full item plus what has happened to it.
export interface Vaulted extends Question {
  style: "practice" | "exam";
  batch: string | null; // the blind practice set it was written for
  attempted: boolean; // this sitting, the student has put an attempt in words
  hintsUsed: number; // this sitting
  turns: number; // guarded replies this sitting
  revealed: boolean; // closed by showing the key, to be marked by hand
  answeredAt: number | null; // when it was first closed
  score: number | null; // the first result, which later tries cannot change
  review: Review | null; // the reviewer's marking, for blind work
}

// A question is closed once it has been answered or its key shown. Closing and scoring are one
// write, so a closed question always has its result, except one waiting for a mark by hand.
// Only a closed question's key may leave the server.

interface Row {
  id: string;
  topic_id: string;
  kind: "mcq" | "free";
  type: string | null;
  style: string;
  batch: string | null;
  prompt: string;
  choices: string;
  answer_index: number;
  solution: string;
  rubric: string;
  difficulty: number;
  attempted: number;
  hints_used: number;
  turns: number;
  revealed: number;
  answered_at: number | null;
  score: number | null;
  review: string | null;
}

const fromRow = (r: Row): Vaulted => ({
  id: r.id,
  topicId: r.topic_id,
  kind: r.kind,
  type: r.type ?? undefined,
  style: r.style === "exam" ? "exam" : "practice",
  batch: r.batch,
  prompt: r.prompt,
  choices: JSON.parse(r.choices) as string[],
  answerIndex: r.answer_index,
  solution: r.solution,
  rubric: JSON.parse(r.rubric) as string[],
  difficulty: r.difficulty,
  attempted: r.attempted === 1,
  hintsUsed: r.hints_used,
  turns: r.turns,
  revealed: r.revealed === 1,
  answeredAt: r.answered_at,
  score: r.score,
  review: r.review ? (JSON.parse(r.review) as Review) : null,
});

// What the browser, or an MCP client, is allowed to see before the question is answered.
export const publicView = (q: Question): Question => ({
  id: q.id,
  topicId: q.topicId,
  kind: q.kind,
  type: q.type,
  prompt: q.prompt,
  choices: q.choices,
  difficulty: q.difficulty,
  answerIndex: -1,
  solution: "",
  rubric: [],
  vaulted: true,
});

export const keyOf = (q: Question): AnswerKey => ({ answerIndex: q.answerIndex, solution: q.solution, rubric: q.rubric });

async function insert(userId: string, q: Question, style: Vaulted["style"], batch: string | null = null): Promise<void> {
  await run(
    `INSERT INTO questions (user_id, id, topic_id, kind, type, style, batch, prompt, choices, answer_index, solution, rubric, difficulty, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, id) DO NOTHING`,
    userId, q.id, q.topicId, q.kind, q.type ?? null, style, batch, q.prompt, JSON.stringify(q.choices), q.answerIndex, q.solution, JSON.stringify(q.rubric), Math.round(q.difficulty), Date.now(),
  );
}

// Whether this account can hold `more` questions. Keeps one account from filling the database.
export async function hasRoom(userId: string, more = 1): Promise<boolean> {
  return ((await one<{ n: number }>("SELECT COUNT(*) AS n FROM questions WHERE user_id = ?", userId))?.n ?? 0) + more <= MAX_HELD;
}

// Files new questions in the vault under fresh ids and returns them in full.
// Questions written as one blind practice set share a batch, so they are handed in together.
export async function storeQuestions(userId: string, topicId: string, list: Omit<Question, "id" | "topicId">[], style: Vaulted["style"]): Promise<Vaulted[]> {
  if (!(await hasRoom(userId, list.length))) throw new Error("This account holds too many questions. Remove a course to make room.");
  const batch = style === "exam" ? `b_${newId(9)}` : null;
  const stored: Question[] = list.map((q) => ({ ...q, id: `q_${newId(9)}`, topicId }));
  for (const q of stored) await insert(userId, q, style, batch);
  return (await Promise.all(stored.map((q) => read(userId, q.id)))).filter((q): q is Vaulted => q !== undefined);
}

// Files questions that already have ids, such as a joined class's, without touching ones already held.
export async function fileQuestions(userId: string, list: Question[]): Promise<void> {
  const fresh: Question[] = [];
  for (const q of list) if (!(await read(userId, q.id))) fresh.push(q);
  if (!(await hasRoom(userId, fresh.length))) throw new Error("This account holds too many questions. Remove a course to make room.");
  for (const q of fresh) await insert(userId, q, "practice");
}

// The full questions behind a set of browser copies, for publishing a course to a class.
// A copy the vault does not hold is passed through if it still carries its own key, and dropped if not.
export async function withKeys(userId: string, list: Question[]): Promise<Question[]> {
  const out: Question[] = [];
  for (const q of list) {
    const held = await read(userId, q.id);
    // Blind practice questions are one student's exam paper, not course content.
    if (held?.style === "exam") continue;
    if (held) out.push({ id: held.id, topicId: held.topicId, kind: held.kind, type: held.type, prompt: held.prompt, choices: held.choices, answerIndex: held.answerIndex, solution: held.solution, rubric: held.rubric, difficulty: held.difficulty });
    else if (q.solution) out.push(q);
  }
  return out;
}

// The sample course's questions ship with the app, so the server knows them without being told.
let demo: Map<string, Question> | null = null;
const demoQuestion = (id: string) => (demo ??= new Map(Object.values(buildDemoCourse().questions).flat().map((q) => [q.id, q]))).get(id);

// Questions that predate the vault live in the student's saved state, key included.
async function savedQuestion(userId: string, id: string): Promise<Question | undefined> {
  const row = await one<{ data: string }>("SELECT data FROM user_state WHERE user_id = ?", userId);
  if (!row) return undefined;
  const pools = (JSON.parse(row.data) as { questions?: Record<string, Question[]> }).questions ?? {};
  const found = Object.values(pools).flat().find((q) => q?.id === id);
  return found && typeof found.solution === "string" && found.solution ? found : undefined;
}

async function read(userId: string, id: string): Promise<Vaulted | undefined> {
  const row = await one<Row>("SELECT * FROM questions WHERE user_id = ? AND id = ?", userId, id);
  return row ? fromRow(row) : undefined;
}

// Looks a question up for one student. A question the vault has not seen yet is
// filed on first use, so its hints and its answer are tracked like any other.
export async function findQuestion(userId: string, id: string): Promise<Vaulted | undefined> {
  const held = await read(userId, id);
  if (held) return held;
  const source = demoQuestion(id) ?? (await savedQuestion(userId, id));
  if (!source || !(await hasRoom(userId))) return undefined;
  await insert(userId, source, "practice");
  return read(userId, id);
}

// A practice question on this topic the student has not answered yet, if the vault holds one.
export async function openQuestion(userId: string, topicId: string): Promise<Vaulted | undefined> {
  const row = await one<Row>("SELECT * FROM questions WHERE user_id = ? AND topic_id = ? AND style = 'practice' AND answered_at IS NULL ORDER BY created_at LIMIT 1", userId, topicId);
  return row ? fromRow(row) : undefined;
}

// Every question of one blind practice set.
export async function batchOf(userId: string, batch: string): Promise<Vaulted[]> {
  return (await all<Row>("SELECT * FROM questions WHERE user_id = ? AND batch = ? ORDER BY created_at, id", userId, batch)).map(fromRow);
}

// ---- help, counted per sitting ----

export async function markAttempted(userId: string, id: string): Promise<void> {
  await run("UPDATE questions SET attempted = 1 WHERE user_id = ? AND id = ?", userId, id);
}

// Counts one guarded reply against the sitting's allowance. False when it is used up.
export async function countTurn(userId: string, id: string): Promise<boolean> {
  return (await run("UPDATE questions SET turns = turns + 1 WHERE user_id = ? AND id = ? AND turns < ?", userId, id, MAX_GUARDED_TURNS)) > 0;
}

// Takes the next hint, but only if the count is still what the caller read: two
// requests racing for the same hint cannot both win. False when it was taken or none are left.
export async function reserveHint(userId: string, id: string, used: number): Promise<boolean> {
  if (used >= MAX_HINTS) return false;
  return (await run("UPDATE questions SET hints_used = hints_used + 1 WHERE user_id = ? AND id = ? AND hints_used = ?", userId, id, used)) > 0;
}

// Gives a reserved hint back when nothing useful was delivered.
export async function refundHint(userId: string, id: string): Promise<void> {
  await run("UPDATE questions SET hints_used = hints_used - 1 WHERE user_id = ? AND id = ? AND hints_used > 0", userId, id);
}

// ---- closing ----

// Closes a question with its result, in one write. True for the one caller that
// closed it; anyone racing it, or answering again later, gets false and changes nothing.
export async function close(userId: string, id: string, score: number, review: Review | null = null): Promise<boolean> {
  const clean = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  return (await run("UPDATE questions SET answered_at = ?, score = ?, review = ? WHERE user_id = ? AND id = ? AND answered_at IS NULL", Date.now(), clean, review ? JSON.stringify(review) : null, userId, id)) > 0;
}

// Closes a written question by showing its key, to be marked by hand. True for the caller that closed it.
export async function closeRevealed(userId: string, id: string): Promise<boolean> {
  return (await run("UPDATE questions SET answered_at = ?, revealed = 1 WHERE user_id = ? AND id = ? AND answered_at IS NULL", Date.now(), userId, id)) > 0;
}

// Records the hand mark of a revealed question, once.
export async function setSelfScore(userId: string, id: string, score: number): Promise<void> {
  await run("UPDATE questions SET score = ? WHERE user_id = ? AND id = ? AND revealed = 1 AND score IS NULL", Math.min(1, Math.max(0, score)), userId, id);
}

// An answer ends the sitting: the next time the question comes round, the attempt gate and the hints start over.
export async function endSitting(userId: string, id: string): Promise<void> {
  await run("UPDATE questions SET attempted = 0, hints_used = 0, turns = 0 WHERE user_id = ? AND id = ?", userId, id);
}
