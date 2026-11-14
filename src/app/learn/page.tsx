"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { QuestionCard } from "@/components/QuestionCard";
import { TutorPanel } from "@/components/TutorPanel";
import { Bar, Empty, Notice } from "@/components/ui";
import { pct, postJSON, streamPost, topicContext, useAiStatus } from "@/lib/client";
import { upNext } from "@/lib/mastery";
import { MODES } from "@/lib/modes";
import { actions, policyFor, useHydrated, useStore } from "@/lib/store";
import type { Course, Grade, Question, Topic } from "@/lib/types";

type Phase = "try" | "learn" | "practice" | "teach" | "done";
const STEPS: { id: Phase; label: string }[] = [
  { id: "try", label: "Try first" },
  { id: "learn", label: "Learn" },
  { id: "practice", label: "Practice" },
  { id: "teach", label: "Teach back" },
];
const PRACTICE_COUNT = 3;

function Lesson({ course, topic, aiOn }: { course: Course; topic: Topic; aiOn: boolean }) {
  const policy = useStore((s) => policyFor(s, course.id));
  const preferred = useStore((s) => s.mode);
  const modes = MODES.filter((m) => policy.allowedModes.includes(m.id));
  const mode = modes.find((m) => m.id === preferred) ?? modes[0] ?? MODES[0];
  const key = `${topic.id}:${mode.id}`;
  const saved = useStore((s) => s.lessons[key]);
  const state = useStore((s) => s.topicState[topic.id]);
  const [live, setLive] = useState<{ key: string; text: string; error: string }>({ key: "", text: "", error: "" });

  useEffect(() => {
    if (saved || !aiOn) return;
    const ctrl = new AbortController();
    streamPost("/api/lesson", { context: topicContext(course, topic, state), mode: mode.id, policy }, (text) => setLive({ key, text, error: "" }), ctrl.signal)
      .then((text) => {
        if (text.trim()) actions.saveLesson(topic.id, mode.id, text);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setLive({ key, text: "", error: e instanceof Error ? e.message : "Could not load the lesson." });
      });
    return () => ctrl.abort();
    // The lesson is keyed by topic and mode; mastery and policy are read once when it is written.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, saved, aiOn]);

  const text = saved ?? (live.key === key ? live.text : "");
  const error = live.key === key ? live.error : "";

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Explanation format">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === mode.id}
            title={m.blurb}
            className={`btn !py-1.5 !text-xs ${m.id === mode.id ? "btn-primary" : ""}`}
            onClick={() => actions.setMode(m.id)}
          >
            {m.name}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{mode.blurb} Best for: {mode.bestFor.toLowerCase()}.</p>
      <div className="mt-5">
        {text ? (
          <Markdown>{text}</Markdown>
        ) : error ? (
          <Notice tone="rose">{error}</Notice>
        ) : aiOn ? (
          <p className="text-sm text-muted" role="status">Writing your lesson…</p>
        ) : (
          <Notice>This format needs an API key. In demo mode the ready topics have a “Worked example” lesson.</Notice>
        )}
      </div>
    </div>
  );
}

function TeachBack({ course, topic, aiOn, onDone }: { course: Course; topic: Topic; aiOn: boolean; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [self, setSelf] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(() => topic.objectives.map(() => false));
  const [error, setError] = useState("");
  const prompt = `Explain "${topic.title}" in your own words, as if to a classmate who missed the lecture.`;

  function record(g: Grade) {
    setGrade(g);
    actions.taughtBack(topic.id, g.score);
  }

  async function submit() {
    setError("");
    if (!aiOn) return setSelf(true);
    setBusy(true);
    try {
      const { grade: g } = await postJSON<{ grade: Grade }>("/api/grade", {
        context: topicContext(course, topic),
        prompt,
        answer: text,
        rubric: topic.objectives.map((o) => `Shows they can: ${o}`),
        teachBack: true,
      });
      record(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grading failed.");
      setSelf(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5 sm:p-6">
      <h2 className="text-lg font-bold">Teach it back</h2>
      <p className="mt-1 text-sm text-muted">{prompt} No notes. If you get stuck partway, that is the part to go back to.</p>
      <label htmlFor="teach" className="sr-only">Your explanation</label>
      <textarea id="teach" className="field mt-4 min-h-44" value={text} disabled={busy || Boolean(grade) || self} onChange={(e) => setText(e.target.value)} placeholder="Start with what it is for, then how it works, then one thing people get wrong." />
      {error && <div className="mt-3"><Notice tone="rose">{error} Check yourself against the goals below.</Notice></div>}

      {!grade && !self && (
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <button type="button" className="btn" onClick={onDone}>Skip for now</button>
          <button type="button" className="btn btn-honey" disabled={busy || text.trim().length < 40} onClick={submit}>
            {busy ? "Reading…" : "Check my explanation"}
          </button>
        </div>
      )}

      {self && !grade && (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="text-sm font-semibold">Which of these did your explanation cover correctly?</h3>
          <div className="mt-2 grid gap-1.5">
            {topic.objectives.map((o, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 accent-[var(--leaf)]" checked={checked[i]} onChange={(e) => setChecked((c) => c.map((x, j) => (j === i ? e.target.checked : x)))} />
                <span>{o}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-honey mt-3"
            onClick={() => {
              const score = checked.filter(Boolean).length / Math.max(1, checked.length);
              record({ score, verdict: score >= 0.8 ? "correct" : score >= 0.4 ? "partial" : "incorrect", feedback: "", missed: topic.objectives.filter((_, i) => !checked[i]) });
            }}
          >
            Save
          </button>
        </div>
      )}

      {grade && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <p className={`text-sm font-bold ${grade.verdict === "correct" ? "text-leaf" : grade.verdict === "partial" ? "text-honey-deep" : "text-rose"}`} role="status">
            {grade.verdict === "correct" ? "A classmate would get it from that." : grade.verdict === "partial" ? `Partly there (${Math.round(grade.score * 100)}%)` : "Not there yet"}
          </p>
          {grade.feedback && <Markdown>{grade.feedback}</Markdown>}
          {grade.missed.length > 0 && (
            <ul className="list-disc pl-5 text-sm">{grade.missed.map((m, i) => <li key={i}>{m}</li>)}</ul>
          )}
          <div className="flex justify-end"><button type="button" className="btn btn-primary" onClick={onDone}>Finish</button></div>
        </div>
      )}
    </div>
  );
}

function Session({ course, topic, aiOn }: { course: Course; topic: Topic; aiOn: boolean }) {
  const router = useRouter();
  const policy = useStore((s) => policyFor(s, course.id));
  const pool = useStore((s) => s.questions[topic.id]);
  const state = useStore((s) => s.topicState[topic.id]);
  const states = useStore((s) => s.topicState);
  const [startAttempts] = useState(() => state?.attempts ?? 0);
  const [phase, setPhase] = useState<Phase>(startAttempts > 0 ? "learn" : "try");
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [poolError, setPoolError] = useState("");
  const [results, setResults] = useState<number[]>([]);

  const context = useMemo(() => topicContext(course, topic, state), [course, topic, state]);

  useEffect(() => {
    if (pool?.length || !aiOn) return;
    const ctrl = new AbortController();
    postJSON<{ questions: Question[] }>("/api/questions", { context: topicContext(course, topic), policy, topicId: topic.id }, ctrl.signal)
      .then(({ questions }) => actions.saveQuestions(topic.id, questions))
      .catch((e) => {
        if (!ctrl.signal.aborted) setPoolError(e instanceof Error ? e.message : "Could not load questions.");
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id, aiOn, pool?.length]);

  // The pre-question is the first item; practice rotates through the rest so a
  // returning learner meets different questions.
  const pre = pool?.[0];
  const practice = useMemo(() => {
    const rest = (pool ?? []).slice(startAttempts > 0 ? 0 : 1);
    if (!rest.length) return [];
    const offset = startAttempts % rest.length;
    return [...rest.slice(offset), ...rest.slice(0, offset)].slice(0, PRACTICE_COUNT);
  }, [pool, startAttempts]);

  const current = phase === "try" ? pre : phase === "practice" ? practice[index] : undefined;
  const go = (p: Phase) => {
    setPhase(p);
    setAnswered(false);
    window.scrollTo({ top: 0 });
  };
  const pools = useStore((s) => s.questions);
  const next = upNext(course, states, course.topics.length).find((s) => s.topic.id !== topic.id && (aiOn || pools[s.topic.id]?.length));

  const waiting = !pool?.length && (
    poolError ? <Notice tone="rose">{poolError}</Notice>
    : aiOn ? <p className="card p-5 text-sm text-muted" role="status">Writing questions for this topic…</p>
    : <Notice>This topic has no ready-made questions. Add an API key to generate them, or pick one of the demo topics.</Notice>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        <header>
          <Link href="/course" className="text-sm text-muted hover:text-ink">← {course.code} study plan</Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{topic.title}</h1>
          <p className="text-sm text-muted">{topic.summary}</p>
          <ol className="mt-4 flex flex-wrap gap-1.5 text-xs font-semibold" aria-label="Session steps">
            {STEPS.map((s, i) => {
              const at = STEPS.findIndex((x) => x.id === phase);
              const done = phase === "done" || i < at;
              return (
                <li key={s.id} aria-current={s.id === phase ? "step" : undefined} className={`rounded-full px-3 py-1 ${s.id === phase ? "bg-ink text-white" : done ? "bg-leaf-soft text-leaf" : "bg-line text-muted"}`}>
                  {i + 1}. {s.label}
                </li>
              );
            })}
          </ol>
        </header>

        {phase === "try" && (
          <>
            <p className="text-sm text-muted">Have a go before the lesson. Getting it wrong here is expected and makes the lesson stick better. It does not count toward your mastery.</p>
            {pre ? (
              <QuestionCard key={pre.id} question={pre} context={context} aiOn={aiOn} countsNote="Warm-up · not scored" nextLabel="Go to the lesson" onAnswered={() => setAnswered(true)} onResult={() => {}} onNext={() => go("learn")} />
            ) : waiting}
            <button type="button" className="text-sm text-muted underline" onClick={() => go("learn")}>Skip to the lesson</button>
          </>
        )}

        {phase === "learn" && (
          <>
            <Lesson course={course} topic={topic} aiOn={aiOn} />
            <div className="flex justify-end"><button type="button" className="btn btn-honey" onClick={() => go("practice")}>I’m ready to practice</button></div>
          </>
        )}

        {phase === "practice" && (
          <>
            {current ? (
              <>
                <p className="text-sm text-muted">Question {index + 1} of {practice.length}. Close the lesson in your head: answer from memory.</p>
                <QuestionCard
                  key={current.id}
                  question={current}
                  context={context}
                  aiOn={aiOn}
                  nextLabel={index + 1 < practice.length ? "Next question" : "On to teach back"}
                  onAnswered={() => setAnswered(true)}
                  onResult={(score, confidence) => {
                    actions.attempt(topic.id, score, confidence);
                    setResults((r) => [...r, score]);
                  }}
                  onNext={() => {
                    if (index + 1 < practice.length) {
                      setIndex(index + 1);
                      setAnswered(false);
                      window.scrollTo({ top: 0 });
                    } else go("teach");
                  }}
                />
              </>
            ) : waiting}
            <button type="button" className="text-sm text-muted underline" onClick={() => go("learn")}>Back to the lesson</button>
          </>
        )}

        {phase === "teach" && <TeachBack course={course} topic={topic} aiOn={aiOn} onDone={() => go("done")} />}

        {phase === "done" && (
          <div className="card space-y-4 p-6">
            <h2 className="text-lg font-bold">Session done</h2>
            <div>
              <div className="mb-1 flex justify-between text-sm"><span>Mastery of {topic.title}</span><span className="font-semibold">{pct(state?.mastery ?? 0)}</span></div>
              <Bar value={state?.mastery ?? 0} label="Mastery" />
            </div>
            <p className="text-sm text-muted">
              {results.length > 0 && <>You got {results.filter((r) => r >= 0.8).length} of {results.length} practice questions right. </>}
              {state?.card ? <>This topic comes back for review on <strong className="text-ink">{new Date(state.card.due).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</strong>, when you are about to start forgetting it.</> : "Answer practice questions to schedule a review."}
            </p>
            <div className="flex flex-wrap gap-2">
              {next && (
                <button type="button" className="btn btn-honey" onClick={() => actions.open(course.id, next.topic.id)}>
                  Next: {next.topic.title}
                </button>
              )}
              <button type="button" className="btn" onClick={() => router.push("/course")}>Back to study plan</button>
            </div>
          </div>
        )}
      </div>

      <TutorPanel
        context={context}
        policy={policy}
        aiPolicy={course.aiPolicy}
        aiOn={aiOn}
        question={current ? { prompt: current.prompt, solution: current.solution, answered } : undefined}
      />
    </div>
  );
}

export default function LearnPage() {
  const hydrated = useHydrated();
  const aiOn = useAiStatus();
  const course = useStore((s) => (s.activeCourseId ? s.courses[s.activeCourseId] : undefined));
  const topicId = useStore((s) => s.activeTopicId);
  const topic = course?.topics.find((t) => t.id === topicId);

  if (!hydrated || aiOn === null) return <p className="text-sm text-muted">Loading…</p>;
  if (!course || !topic) {
    return (
      <Empty title="Pick a topic to study">
        <Link href="/course" className="btn btn-primary mt-4">Open the study plan</Link>
      </Empty>
    );
  }
  return <Session key={topic.id} course={course} topic={topic} aiOn={aiOn} />;
}
