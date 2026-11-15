import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";
import { EMPTY_TOPIC_STATE, PASS_SCORE, type Course, type Exam, type StoredCard, type Topic, type TopicState } from "./types";

// Long-term scheduling only: the first interval is in days. The library's
// default minute-level learning steps would mark a topic due again mid-session.
const scheduler = fsrs(
  generatorParameters({ enable_fuzz: false, request_retention: 0.9, enable_short_term: false, learning_steps: [], relearning_steps: [] }),
);

const RESCHEDULE_GAP_MS = 12 * 60 * 60 * 1000;
const PREREQ_READY = 0.5;
// Practice with a lesson and tutor at hand can raise mastery only this far.
// Going higher takes blind practice: no hints, graded like an exam.
export const GUIDED_CAP = 0.6;
export const CALIBRATION_NOTICE = 0.15;

function revive(card: StoredCard): Card {
  return {
    ...(card as unknown as Card),
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  };
}

function store(card: Card): StoredCard {
  return JSON.parse(JSON.stringify(card)) as StoredCard;
}

// Confidence is asked before the answer is revealed: 1 guessing, 2 fairly sure, 3 certain.
function rating(score: number, confidence: number): Grade {
  if (score < 0.5) return Rating.Again;
  if (score < PASS_SCORE || confidence <= 1) return Rating.Hard;
  return confidence >= 3 ? Rating.Easy : Rating.Good;
}

// Records one answer. Pass confidence null for a teach-back, where no confidence
// was asked: it moves mastery but stays out of the calibration and answer counts.
// Pass blind for an answer given with no help available.
export function recordAttempt(prev: TopicState | undefined, score: number, confidence: number | null, now = new Date(), blind = false): TopicState {
  const s = prev ?? EMPTY_TOPIC_STATE;
  // A session asks several questions on one topic within minutes. Only the
  // first answer of a sitting moves the review date; the rest move mastery.
  const last = s.card?.last_review ? new Date(s.card.last_review).getTime() : null;
  const reschedule = last === null || now.getTime() - last > RESCHEDULE_GAP_MS;
  const card = reschedule
    ? store(scheduler.next(s.card ? revive(s.card) : createEmptyCard(now), now, rating(score, confidence ?? 2)).card)
    : s.card;
  // A confident wrong answer moves mastery down harder than a hesitant one.
  const rate = blind || (score < 0.5 && confidence === 3) ? 0.5 : 0.35;
  const moved = Math.min(1, Math.max(0, s.mastery + rate * (score - s.mastery)));
  // Assisted work can lower mastery freely but cannot lift it past the cap.
  const mastery = blind || moved <= s.mastery ? moved : Math.min(moved, Math.max(s.mastery, GUIDED_CAP));
  const verified = blind ? { score, at: now.toISOString() } : s.verified;
  // A blind answer counts as an answer, but no confidence was asked, so it stays out of calibration.
  if (blind) return { ...s, mastery, card, verified, attempts: s.attempts + 1, correct: s.correct + (score >= PASS_SCORE ? 1 : 0) };
  if (confidence === null) return { ...s, mastery, card, verified };
  return {
    ...s,
    mastery,
    card,
    verified,
    attempts: s.attempts + 1,
    correct: s.correct + (score >= PASS_SCORE ? 1 : 0),
    calibration: [...s.calibration, { confidence, score }].slice(-30),
  };
}

// A topic is verified once its latest blind practice was a pass.
export function isVerified(s: TopicState | undefined): boolean {
  return (s?.verified?.score ?? 0) >= PASS_SCORE;
}

export function retrievability(s: TopicState | undefined, now = new Date()): number {
  if (!s?.card) return 1;
  const r = scheduler.get_retrievability(revive(s.card), now, false);
  return typeof r === "number" && Number.isFinite(r) ? r : 1;
}

// What we expect the learner could do on this topic today.
export function readiness(s: TopicState | undefined, now = new Date()): number {
  if (!s) return 0;
  return s.mastery * retrievability(s, now);
}

export function isDue(s: TopicState | undefined, now = new Date()): boolean {
  return Boolean(s?.card && new Date(s.card.due) <= now);
}

export function localISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Whole calendar days in the learner's local time: an exam tomorrow is 1 day away at any hour.
export function daysUntil(date: string | null, now = new Date()): number | null {
  if (!date) return null;
  const d = new Date(date.length === 10 ? `${date}T00:00:00` : date);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day.getTime() - today.getTime()) / 86_400_000);
}

// "today", "tomorrow", "in 9 days"
export function inDays(days: number): string {
  return days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

export function nextExam(course: Course, now = new Date()): Exam | null {
  const upcoming = course.exams
    .map((e) => ({ e, d: daysUntil(e.date, now) }))
    .filter((x): x is { e: Exam; d: number } => x.d !== null && x.d >= 0)
    .sort((a, b) => a.d - b.d);
  return upcoming[0]?.e ?? null;
}

function weightedReadiness(topics: Topic[], states: Record<string, TopicState>, now: Date): number {
  const total = topics.reduce((a, t) => a + t.weight, 0);
  if (!total) return 0;
  return topics.reduce((a, t) => a + t.weight * readiness(states[t.id], now), 0) / total;
}

export function examReadiness(course: Course, exam: Exam, states: Record<string, TopicState>, now = new Date()): number {
  return weightedReadiness(course.topics.filter((t) => t.examIds.includes(exam.id)), states, now);
}

export function courseReadiness(course: Course, states: Record<string, TopicState>, now = new Date()): number {
  return weightedReadiness(course.topics, states, now);
}

// Prerequisites of a topic that the learner has not yet half learned.
export function weakPrereqs(course: Course, topic: Topic, states: Record<string, TopicState>): Topic[] {
  return topic.prereqs
    .map((id) => course.topics.find((t) => t.id === id))
    .filter((p): p is Topic => p !== undefined && (states[p.id]?.mastery ?? 0) < PREREQ_READY);
}

export interface Suggestion {
  topic: Topic;
  reason: string;
}

// Deadline-aware ordering: weak, heavily tested topics on the nearest exam come
// first, and a topic waits until its prerequisites are at least half learned.
export function upNext(course: Course, states: Record<string, TopicState>, limit = 3, now = new Date()): Suggestion[] {
  const order = new Map(course.topics.map((t, i) => [t.id, i]));
  const scored = course.topics.map((topic) => {
    const s = states[topic.id];
    const ready = readiness(s, now);
    const blocked = weakPrereqs(course, topic, states).length > 0;
    const examDays = topic.examIds
      .map((id) => daysUntil(course.exams.find((e) => e.id === id)?.date ?? null, now))
      .filter((d): d is number => d !== null && d >= 0)
      .sort((a, b) => a - b)[0];
    const urgency = examDays === undefined ? 1 : 1 + 3 / (examDays / 7 + 1);
    const due = isDue(s, now);
    const priority = (blocked ? 0.2 : 1) * topic.weight * (1 - ready) * urgency + (due ? 1 : 0);
    let reason = "Next in the syllabus";
    if (due) reason = "Due for review";
    else if (examDays !== undefined && examDays <= 14) reason = `On an exam ${inDays(examDays)}`;
    else if (s && s.attempts > 0 && s.mastery < 0.6) reason = "Started but still shaky";
    else if (topic.weight >= 3) reason = "Heavily tested";
    return { topic, reason, priority, done: ready >= 0.85 && !due };
  });
  return scored
    .filter((x) => !x.done)
    .sort((a, b) => b.priority - a.priority || order.get(a.topic.id)! - order.get(b.topic.id)!)
    .slice(0, limit)
    .map(({ topic, reason }) => ({ topic, reason }));
}

// Positive means overconfident, negative underconfident. Null until there is enough data.
export function calibrationGap(s: TopicState[]): number | null {
  const all = s.flatMap((x) => x.calibration);
  if (all.length < 5) return null;
  const felt = all.reduce((a, c) => a + (c.confidence - 1) / 2, 0) / all.length;
  const got = all.reduce((a, c) => a + c.score, 0) / all.length;
  return felt - got;
}
