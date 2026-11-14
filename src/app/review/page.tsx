"use client";

import Link from "next/link";
import { useState } from "react";
import { QuestionCard } from "@/components/QuestionCard";
import { Empty, Loading } from "@/components/ui";
import { dueLabel, topicContext, useAiStatus } from "@/lib/client";
import { isDue } from "@/lib/mastery";
import { actions, getState, useHydrated } from "@/lib/store";
import { PASS_SCORE, type Course, type Question, type Topic } from "@/lib/types";

interface Item {
  course: Course;
  topic: Topic;
  question: Question;
}

const MAX_ITEMS = 20;

// Built once when the page opens so the queue does not reshuffle as answers are
// recorded. Topics from every course are mixed, most overdue first.
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
  return { items: items.slice(0, MAX_ITEMS), nextDue };
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
            ? `Your next review is due ${dueLabel(nextDue)}. Reviews are spaced so each one lands just before you would forget.`
            : "Finish a study session and its topic will come back here on a schedule."}
        </p>
        <Link href="/course" className="btn btn-honey mt-4">Open study plan</Link>
      </Empty>
    );
  }

  if (i >= items.length) {
    const right = scores.filter((s) => s >= PASS_SCORE).length;
    return (
      <Empty title="Review complete">
        <p>{right} of {items.length} recalled correctly. Missed topics come back sooner; the rest move further out.</p>
        <Link href="/course" className="btn btn-honey mt-4">Open study plan</Link>
      </Empty>
    );
  }

  const { course, topic, question } = items[i];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="title">Review</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted"><span className="tabular-nums">{i + 1} of {items.length}</span> · topics are mixed, because switching between them is what the exam asks of you.</p>
      </header>
      <QuestionCard
        key={`${question.id}:${i}`}
        question={question}
        context={topicContext(course, topic)}
        aiOn={aiOn}
        eyebrow={`${course.code} · ${topic.title}`}
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
  if (!hydrated || aiOn === null) return <Loading />;
  return <Queue aiOn={aiOn} />;
}
