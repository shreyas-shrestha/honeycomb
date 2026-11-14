import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";
import { EMPTY_TOPIC_STATE, type Course, type Exam, type StoredCard, type Topic, type TopicState } from "./types";

const scheduler = fsrs(generatorParameters({ enable_fuzz: false, request_retention: 0.9 }));

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
  if (score < 0.8 || confidence <= 1) return Rating.Hard;
  return confidence >= 3 ? Rating.Easy : Rating.Good;
}

export function recordAttempt(prev: TopicState | undefined, score: number, confidence: number, now = new Date()): TopicState {
  const s = prev ?? EMPTY_TOPIC_STATE;
  const card = s.card ? revive(s.card) : createEmptyCard(now);
  const next = scheduler.next(card, now, rating(score, confidence)).card;
  // A confident wrong answer moves mastery down harder than a hesitant one.
  const rate = score < 0.5 && confidence >= 3 ? 0.5 : 0.35;
  return {
    ...s,
    mastery: Math.min(1, Math.max(0, s.mastery + rate * (score - s.mastery))),
    attempts: s.attempts + 1,
    correct: s.correct + (score >= 0.8 ? 1 : 0),
    card: store(next),
    lastSeen: now.toISOString(),
    calibration: [...s.calibration, { confidence, score }].slice(-30),
  };
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

export function daysUntil(date: string | null, now = new Date()): number | null {
  if (!date) return null;
  // Whole calendar days in the learner's local time: an exam tomorrow is 1 day away at any hour.
  const d = new Date(date.length === 10 ? `${date}T00:00:00` : date);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day.getTime() - today.getTime()) / 86_400_000);
}

export function nextExam(course: Course, now = new Date()): Exam | null {
  const upcoming = course.exams
    .map((e) => ({ e, d: daysUntil(e.date, now) }))
    .filter((x): x is { e: Exam; d: number } => x.d !== null && x.d >= 0)
    .sort((a, b) => a.d - b.d);
  return upcoming[0]?.e ?? null;
}

export function examReadiness(course: Course, exam: Exam, states: Record<string, TopicState>, now = new Date()): number {
  const covered = course.topics.filter((t) => t.examIds.includes(exam.id));
  const total = covered.reduce((a, t) => a + t.weight, 0);
  if (!total) return 0;
  return covered.reduce((a, t) => a + t.weight * readiness(states[t.id], now), 0) / total;
}

export function courseReadiness(course: Course, states: Record<string, TopicState>, now = new Date()): number {
  const total = course.topics.reduce((a, t) => a + t.weight, 0);
  if (!total) return 0;
  return course.topics.reduce((a, t) => a + t.weight * readiness(states[t.id], now), 0) / total;
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
    const blockedBy = topic.prereqs
      .map((id) => course.topics.find((t) => t.id === id))
      .filter((p): p is Topic => Boolean(p) && (states[p!.id]?.mastery ?? 0) < 0.5);
    const examDays = topic.examIds
      .map((id) => daysUntil(course.exams.find((e) => e.id === id)?.date ?? null, now))
      .filter((d): d is number => d !== null && d >= 0)
      .sort((a, b) => a - b)[0];
    const urgency = examDays === undefined ? 1 : 1 + 3 / (examDays / 7 + 1);
    const due = isDue(s, now);
    const priority = (blockedBy.length ? 0.2 : 1) * topic.weight * (1 - ready) * urgency + (due ? 1 : 0);
    let reason = "Next in the syllabus";
    if (due) reason = "Due for review before you forget it";
    else if (examDays !== undefined && examDays <= 14) reason = `On an exam in ${examDays} day${examDays === 1 ? "" : "s"}`;
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
