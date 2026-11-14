"use client";

import Link from "next/link";
import { useState } from "react";
import { QuestionCard } from "@/components/QuestionCard";
import { Empty } from "@/components/ui";
import { topicContext, useAiStatus } from "@/lib/client";
import { isDue } from "@/lib/mastery";
import { actions, getState, useHydrated } from "@/lib/store";
import type { Course, Question, Topic } from "@/lib/types";

interface Item {
  course: Course;
  topic: Topic;
  question: Question;
}

// Built once when the page opens so the queue does not reshuffle as answers are
// recorded. Topics are interleaved across courses, most overdue first.
function buildQueue(): { items: Item[]; nextDue: Date | null } {
  const s = getState();
  const items: (Item & { due: number })[] = [];
  let nextDue: Date | null = null;
  for (const course of Object.values(s.courses)) {
    for (const topic of course.topics) {
      const st = s.topicState[topic.id];
      const pool = s.questions[topic.id];
      if (!st?.card || !pool?.length) continue;
      const due = new Date(st.card.due);
      if (isDue(st)) items.push({ course, topic, question: pool[st.attempts % pool.length], due: due.getTime() });
      else if (!nextDue || due < nextDue) nextDue = due;
    }
  }
  items.sort((a, b) => a.due - b.due);
  return { items: items.slice(0, 20), nextDue };
}

function Queue({ aiOn }: { aiOn: boolean }) {
  const [{ items, nextDue }] = useState(buildQueue);
  const [i, setI] = useState(0);
  const [scores, setScores] = useState<number[]>([]);

  if (items.length === 0) {
    return (
      <Empty title="Nothing to review right now">
        <p>
          {nextDue
            ? `Your next review is due ${nextDue.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}. Reviews are spaced so each one lands just before you would forget.`
            : "Finish a study session and its topic will come back here on a schedule."}
        </p>
        <Link href="/course" className="btn btn-primary mt-4">Study something new</Link>
      </Empty>
    );
  }

  if (i >= items.length) {
    const right = scores.filter((s) => s >= 0.8).length;
    return (
      <Empty title="Review complete">
        <p>{right} of {items.length} recalled correctly. Missed topics come back sooner; the rest move further out.</p>
        <Link href="/course" className="btn btn-primary mt-4">Back to study plan</Link>
      </Empty>
    );
  }

  const { course, topic, question } = items[i];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Review</h1>
        <p className="text-sm text-muted">{i + 1} of {items.length} · mixed across your topics, because switching between them is what you will do on the exam.</p>
      </header>
      <p className="text-xs font-semibold uppercase tracking-wide text-honey-deep">{course.code} · {topic.title}</p>
      <QuestionCard
        key={`${question.id}:${i}`}
        question={question}
        context={topicContext(course, topic)}
        aiOn={aiOn}
        nextLabel={i + 1 < items.length ? "Next" : "Finish"}
        onResult={(score, confidence) => {
          actions.attempt(topic.id, score, confidence);
          setScores((s) => [...s, score]);
        }}
        onNext={() => {
          setI(i + 1);
          window.scrollTo({ top: 0 });
        }}
      />
    </div>
  );
}

export default function ReviewPage() {
  const hydrated = useHydrated();
  const aiOn = useAiStatus();
  if (!hydrated || aiOn === null) return <p className="text-sm text-muted">Loading…</p>;
  return <Queue aiOn={aiOn} />;
}
