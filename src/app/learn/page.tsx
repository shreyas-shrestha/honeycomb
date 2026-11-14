"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { QuestionCard } from "@/components/QuestionCard";
import { TutorPanel } from "@/components/TutorPanel";
import { Bar, Empty, Loading, Notice, RubricCheck, VerdictLine } from "@/components/ui";
import { dueLabel, errorText, pct, postJSON, streamPost, topicContext, useAiStatus } from "@/lib/client";
import { upNext } from "@/lib/mastery";
import { MODES } from "@/lib/modes";
import { actions, policyFor, useHydrated, useStore } from "@/lib/store";
import { PASS_SCORE, type Course, type Grade, type Question, type Topic } from "@/lib/types";

type Phase = "try" | "learn" | "practice" | "teach" | "done";
const STEPS: { id: Phase; label: string }[] = [
  { id: "try", label: "Try first" },
  { id: "learn", label: "Learn" },
  { id: "practice", label: "Practice" },
  { id: "teach", label: "Teach it back" },
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
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (saved || !aiOn) return;
    const ctrl = new AbortController();
    streamPost("/api/lesson", { context: topicContext(course, topic, state), mode: mode.id, policy }, (text) => setLive({ key, text, error: "" }), ctrl.signal)
      .then((text) => actions.saveLesson(topic.id, mode.id, text))
      .catch((e) => {
        if (!ctrl.signal.aborted) setLive({ key, text: "", error: errorText(e, "Could not load the lesson.") });
      });
    return () => ctrl.abort();
    // A lesson is written once per topic and format; mastery and settings are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, saved, aiOn, attempt]);

  const text = saved ?? (live.key === key ? live.text : "");
  const error = live.key === key ? live.error : "";

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Explanation format">
        {modes.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={m.id === mode.id} title={m.blurb} className="chip" onClick={() => actions.setMode(m.id)}>
            {m.name}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">{mode.blurb} Best for: {mode.bestFor.toLowerCase()}.</p>
      <div className="mt-5">
        {error ? (
          <Notice tone="rose">
            {error}{" "}
            <button type="button" className="link" onClick={() => { setLive({ key: "", text: "", error: "" }); setAttempt((n) => n + 1); }}>Try again</button>
          </Notice>
        ) : text ? (
          <Markdown>{text}</Markdown>
        ) : aiOn ? (
          <p className="text-sm text-muted" role="status">Writing your lesson…</p>
        ) : (
          <Notice>This format needs an OpenAI API key. The sample topics have a “Worked example” lesson ready.</Notice>
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
  const [error, setError] = useState("");
  const prompt = `Explain "${topic.title}" in your own words, as if to a classmate who missed the lecture.`;
  const goals = topic.objectives.length ? topic.objectives : ["Explain the idea correctly and completely"];

  function record(g: Grade) {
    setGrade(g);
    actions.attempt(topic.id, g.score, null);
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
        rubric: goals.map((o) => `Shows they can: ${o}`),
        teachBack: true,
      });
      record(g);
    } catch (e) {
      setError(errorText(e, "Grading failed."));
      setSelf(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5 sm:p-6">
      <h2 className="heading">Teach it back</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">{prompt} No notes. If you get stuck partway, that is the part to go back to.</p>
      <label htmlFor="teach" className="sr-only">Your explanation</label>
      <textarea id="teach" className="field mt-4 min-h-44" value={text} disabled={busy || Boolean(grade) || self} onChange={(e) => setText(e.target.value)} placeholder="Start with what it is for, then how it works, then one thing people get wrong." />
      {error && <div className="mt-3"><Notice tone="rose">{error} Check yourself against the goals below.</Notice></div>}

      {!grade && !self && (
        <div className="mt-4 grid gap-3 sm:flex sm:items-center sm:justify-between">
          <button type="button" className="btn btn-honey w-full sm:order-2 sm:w-auto" disabled={busy || text.trim().length < 40} onClick={submit}>
            {busy ? "Reading…" : "Check my explanation"}
          </button>
          <button type="button" className="link justify-self-center sm:order-1" onClick={onDone}>Skip for now</button>
        </div>
      )}

      {self && !grade && (
        <div className="mt-4 border-t border-line pt-4">
          <RubricCheck prompt="Which of these did your explanation cover correctly?" items={goals} onSave={(score, missed) => record({ score, feedback: "", missed })} />
        </div>
      )}

      {grade && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <VerdictLine score={grade.score} labels={{ correct: "A classmate would get it from that.", incorrect: "Not there yet" }} />
          {grade.feedback && <Markdown>{grade.feedback}</Markdown>}
          {grade.missed.length > 0 && (
            <ul className="grid gap-1 pl-5 text-sm">{grade.missed.map((m, i) => <li key={i} className="list-disc"><Markdown className="prose-sm">{m}</Markdown></li>)}</ul>
          )}
          <div className="flex justify-end"><button type="button" className="btn btn-honey w-full sm:w-auto" onClick={onDone}>Finish</button></div>
        </div>
      )}
    </div>
  );
}

function Session({ course, topic, aiOn }: { course: Course; topic: Topic; aiOn: boolean }) {
  const router = useRouter();
  const policy = useStore((s) => policyFor(s, course.id));
  const pools = useStore((s) => s.questions);
  const states = useStore((s) => s.topicState);
  const pool = pools[topic.id];
  const state = states[topic.id];
  const [startAttempts] = useState(() => state?.attempts ?? 0);
  const [phase, setPhase] = useState<Phase>(startAttempts > 0 ? "learn" : "try");
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [poolError, setPoolError] = useState("");
  const [fetchTry, setFetchTry] = useState(0);
  const [results, setResults] = useState<number[]>([]);
  const refilled = useRef(false);

  const context = useMemo(() => topicContext(course, topic, state), [course, topic, state]);
  const askForQuestions = (avoid?: string[]) =>
    postJSON<{ questions: Question[] }>("/api/questions", { context: topicContext(course, topic), policy, topicId: topic.id, avoid });

  useEffect(() => {
    if (pool?.length || !aiOn) return;
    let live = true;
    askForQuestions()
      .then(({ questions }) => actions.saveQuestions(topic.id, questions))
      .catch((e) => {
        if (live) setPoolError(errorText(e, "Could not load questions."));
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id, aiOn, pool?.length, fetchTry]);

  // Once the learner has seen every question, write fresh ones for next time so
  // review tests the idea and not memory of the answer key.
  useEffect(() => {
    if (phase !== "done" || !aiOn || !pool?.length || refilled.current) return;
    if ((state?.attempts ?? 0) < pool.length) return;
    refilled.current = true;
    askForQuestions(pool.map((q) => q.prompt))
      .then(({ questions }) => actions.saveQuestions(topic.id, questions))
      .catch(() => {
        // Best effort; the existing questions still work.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // The first question is the warm-up; practice rotates through the rest so a
  // returning learner meets different ones. A one-question pool is reused.
  const warmUp = pool?.[0];
  const practice = useMemo(() => {
    const all = pool ?? [];
    const rest = startAttempts > 0 || all.length < 2 ? all : all.slice(1);
    if (!rest.length) return [];
    const offset = startAttempts % rest.length;
    return [...rest.slice(offset), ...rest.slice(0, offset)].slice(0, PRACTICE_COUNT);
  }, [pool, startAttempts]);
  const practiceDone = practice.length > 0 && index >= practice.length;

  const current = phase === "try" ? warmUp : phase === "practice" ? practice[index] : undefined;
  const go = (p: Phase) => {
    setPhase(p);
    setAnswered(false);
    window.scrollTo({ top: 0 });
  };
  // Leaving a question that has been answered counts it as finished, so it is never asked and scored twice.
  const leavePractice = (to: Phase) => {
    if (answered) setIndex(index + 1);
    go(to);
  };
  const next = upNext(course, states, course.topics.length).find((s) => s.topic.id !== topic.id && (aiOn || pools[s.topic.id]?.length));

  const waiting = poolError ? (
    <Notice tone="rose">
      {poolError}{" "}
      <button type="button" className="link" onClick={() => { setPoolError(""); setFetchTry((n) => n + 1); }}>Try again</button>
    </Notice>
  ) : aiOn ? (
    <p className="card p-5 text-sm text-muted" role="status">Writing questions for this topic…</p>
  ) : (
    <Notice>This topic has no ready-made questions. It unlocks with an OpenAI API key; the sample topics work without one.</Notice>
  );
  const at = STEPS.findIndex((x) => x.id === phase);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        <header>
          <Link href="/course" className="link">← {course.code} study plan</Link>
          <h1 className="title mt-1">{topic.title}</h1>
          <p className="mt-1 text-sm text-muted">{topic.summary}</p>
          <ol className="mt-4 flex flex-nowrap gap-1.5 overflow-x-auto" aria-label="Session steps">
            {STEPS.map((s, i) => {
              const done = phase === "done" || i < at;
              return (
                <li key={s.id} aria-current={s.id === phase ? "step" : undefined} className={`tag ${s.id === phase ? "bg-ink text-paper" : done ? "bg-leaf-soft text-leaf" : "bg-line text-muted"}`}>
                  {done ? "✓" : i + 1}&nbsp;{s.label}
                </li>
              );
            })}
          </ol>
        </header>

        {phase === "try" && (
          <>
            <p className="text-sm leading-relaxed text-muted">Answer before the lesson. Getting it wrong here is expected and makes the lesson stick. It does not count toward your mastery.</p>
            {warmUp ? (
              <QuestionCard key={warmUp.id} question={warmUp} context={context} aiOn={aiOn} eyebrow="Try first · not scored" nextLabel="Go to the lesson" onAnswered={() => setAnswered(true)} onResult={() => {}} onNext={() => go("learn")} />
            ) : waiting}
            <button type="button" className="link" onClick={() => go("learn")}>Skip to the lesson</button>
          </>
        )}

        {phase === "learn" && (
          <>
            <Lesson course={course} topic={topic} aiOn={aiOn} />
            <div className="flex justify-end">
              <button type="button" className="btn btn-honey w-full sm:w-auto" onClick={() => go(practiceDone ? "teach" : "practice")}>
                {practiceDone ? "On to teach it back" : "I’m ready to practice"}
              </button>
            </div>
          </>
        )}

        {phase === "practice" && (
          <>
            {current ? (
              <>
                <p className="text-sm text-muted">Question {index + 1} of {practice.length}. Answer from memory, without looking back at the lesson.</p>
                <QuestionCard
                  key={current.id}
                  question={current}
                  context={context}
                  aiOn={aiOn}
                  nextLabel={index + 1 < practice.length ? "Next question" : "On to teach it back"}
                  onAnswered={() => setAnswered(true)}
                  onResult={(score, confidence) => {
                    actions.attempt(topic.id, score, confidence);
                    setResults((r) => [...r, score]);
                  }}
                  onNext={() => {
                    setIndex(index + 1);
                    if (index + 1 < practice.length) {
                      setAnswered(false);
                      window.scrollTo({ top: 0 });
                    } else go("teach");
                  }}
                />
              </>
            ) : waiting}
            <div className="flex flex-wrap gap-x-6">
              <button type="button" className="link" onClick={() => leavePractice("learn")}>Back to the lesson</button>
              {!current && <button type="button" className="link" onClick={() => go("teach")}>Skip to teach it back</button>}
            </div>
          </>
        )}

        {phase === "teach" && <TeachBack course={course} topic={topic} aiOn={aiOn} onDone={() => go("done")} />}

        {phase === "done" && (
          <div className="card space-y-4 p-6">
            <h2 className="heading">Session done</h2>
            <div>
              <div className="mb-1.5 flex justify-between text-sm"><span className="text-muted">Mastery of {topic.title}</span><span className="font-medium tabular-nums">{pct(state?.mastery ?? 0)}</span></div>
              <Bar value={state?.mastery ?? 0} label="Mastery" />
            </div>
            <p className="text-sm leading-relaxed text-muted">
              {results.length > 0 && <>You got {results.filter((r) => r >= PASS_SCORE).length} of {results.length} practice questions right. </>}
              {state?.card ? <>This topic comes back for review <span className="font-medium text-ink">{dueLabel(state.card.due)}</span>, just before you would start forgetting it.</> : "Answer practice questions to schedule a review."}
            </p>
            <div className="flex flex-wrap gap-3">
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

  if (!hydrated || aiOn === null) return <Loading />;
  if (!course || !topic) {
    return (
      <Empty title="Pick a topic to study">
        <Link href="/course" className="btn btn-honey mt-4">Open study plan</Link>
      </Empty>
    );
  }
  return <Session key={topic.id} course={course} topic={topic} aiOn={aiOn} />;
}
