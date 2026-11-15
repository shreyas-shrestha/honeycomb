"use client";

import Link from "next/link";
import { RequireUser } from "@/components/RequireUser";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExperiencePlayer } from "@/components/ExperiencePlayer";
import { Markdown } from "@/components/Markdown";
import { QuestionCard } from "@/components/QuestionCard";
import { TutorPanel } from "@/components/TutorPanel";
import { Bar, Empty, Loading, Notice, RubricCheck, VerdictLine } from "@/components/ui";
import { dueLabel, errorText, pct, postJSON, streamPost, topicContext, useAiStatus, usePolicy } from "@/lib/client";
import { isVerified, readiness, upNext } from "@/lib/mastery";
import { MODES } from "@/lib/modes";
import { actions, getState, materialFor, useStore } from "@/lib/store";
import { PASS_SCORE, type Block, type BlockKind, type Course, type Grade, type InstructorPolicy, type Question, type Topic } from "@/lib/types";

type Phase = "try" | "learn" | "practice" | "teach" | "done";
const STEPS: { id: Phase; label: string }[] = [
  { id: "try", label: "Try first" },
  { id: "learn", label: "Learn" },
  { id: "practice", label: "Practice" },
  { id: "teach", label: "Teach it back" },
];
const PRACTICE_COUNT = 3;
const ALL_KINDS: BlockKind[] = ["text", "check", "trace", "order", "fill", "match", "reveal"];

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Notice tone="rose">
      {message} <button type="button" className="link" onClick={onRetry}>Try again</button>
    </Notice>
  );
}

const writing = new Map<string, Promise<void>>();

// The interactive lesson for a topic, written on first visit if there is none yet.
function Interactive({ course, topic, aiOn, onFinish }: { course: Course; topic: Topic; aiOn: boolean; onFinish: () => void }) {
  const saved = useStore((s) => s.experiences[topic.id]);
  const state = useStore((s) => s.topicState[topic.id]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (saved || !aiOn) return;
    let live = true;
    // One request per topic, however many times this view mounts while it runs.
    let job = writing.get(topic.id);
    if (!job) {
      job = postJSON<{ blocks: Block[] }>("/api/experience", { context: topicContext(course, topic, state), classId: course.classId, kinds: ALL_KINDS, material: materialFor(getState(), course.id, topic.id) || undefined })
        .then(({ blocks }) => actions.saveExperience(topic.id, blocks))
        .finally(() => writing.delete(topic.id));
      writing.set(topic.id, job);
    }
    job.catch((e) => {
      if (live) setError(errorText(e, "Could not build the lesson."));
    });
    return () => {
      live = false;
    };
    // Written once per topic; mastery is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id, saved, aiOn, attempt]);

  if (saved) return <ExperiencePlayer key={saved.createdAt} blocks={saved.blocks} finishLabel="I’m ready to practice" onFinish={onFinish} />;
  if (error) return <Retry message={error} onRetry={() => { setError(""); setAttempt((n) => n + 1); }} />;
  if (aiOn) return <p className="card p-5 text-sm text-muted" role="status">Building your interactive lesson. This takes about half a minute…</p>;
  return <Notice>This topic has no interactive lesson yet. Writing one needs AI, which is off on this site.</Notice>;
}

// A written explanation in the format the learner picks.
function Reading({ course, topic, aiOn, policy }: { course: Course; topic: Topic; aiOn: boolean; policy: InstructorPolicy }) {
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
    streamPost("/api/lesson", { context: topicContext(course, topic, state), mode: mode.id, classId: course.classId, material: materialFor(getState(), course.id, topic.id) || undefined }, (text) => setLive({ key, text, error: "" }), ctrl.signal)
      .then((text) => actions.saveLesson(topic.id, mode.id, text))
      .catch((e) => {
        if (!ctrl.signal.aborted) setLive({ key, text: "", error: errorText(e, "Could not load the lesson.") });
      });
    return () => ctrl.abort();
    // Written once per topic and format; mastery is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, saved, aiOn, attempt]);

  const text = saved ?? (live.key === key ? live.text : "");
  const error = live.key === key ? live.error : "";

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap border-b border-line" role="tablist" aria-label="Explanation format">
        {modes.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={m.id === mode.id} className="tab" onClick={() => actions.setMode(m.id)}>
            {m.name}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">{mode.blurb}</p>
      <div className="mt-5">
        {error ? (
          <Retry message={error} onRetry={() => { setLive({ key: "", text: "", error: "" }); setAttempt((n) => n + 1); }} />
        ) : text ? (
          <Markdown>{text}</Markdown>
        ) : aiOn ? (
          <p className="text-sm text-muted" role="status">Writing your lesson…</p>
        ) : (
          <Notice>This format needs AI, which is off on this site. The sample topics have a “Worked example” ready.</Notice>
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
  const prompt = `Explain “${topic.title}” in your own words, as if to a classmate who missed the lecture.`;
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
      <p className="mt-1 text-sm leading-relaxed text-muted">{prompt} Write it without looking at the lesson.</p>
      <label htmlFor="teach" className="sr-only">Your explanation</label>
      <textarea id="teach" className="field mt-4 min-h-44" value={text} disabled={busy || Boolean(grade) || self} onChange={(e) => setText(e.target.value)} placeholder="What it is for, how it works, and one mistake people make with it." />
      {error && <div className="mt-3"><Notice tone="rose">{error} Check yourself against the goals below.</Notice></div>}

      {!grade && !self && (
        <div className="mt-4 grid gap-3 sm:flex sm:items-center sm:justify-between">
          <button type="button" className="btn btn-primary w-full sm:order-2 sm:w-auto" disabled={busy || text.trim().length < 40} onClick={submit}>
            {busy ? "Reading…" : "Check my explanation"}
          </button>
          <div className="flex items-center justify-center gap-4 sm:order-1">
            <button type="button" className="link" onClick={onDone}>Skip for now</button>
            {text.trim().length < 40 && <span className="hint">Write a few sentences to check it.</span>}
          </div>
        </div>
      )}

      {self && !grade && (
        <div className="mt-4 border-t border-line pt-4">
          <RubricCheck prompt="Which of these did your explanation cover correctly?" items={goals} onSave={(score, missed) => record({ score, feedback: "", missed })} />
        </div>
      )}

      {grade && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <VerdictLine score={grade.score} />
          {grade.feedback && <Markdown>{grade.feedback}</Markdown>}
          {grade.missed.length > 0 && (
            <ul className="grid gap-1 pl-5 text-sm">{grade.missed.map((m, i) => <li key={i} className="list-disc"><Markdown className="prose-sm">{m}</Markdown></li>)}</ul>
          )}
          <div className="flex justify-end"><button type="button" className="btn btn-primary w-full sm:w-auto" onClick={onDone}>Finish</button></div>
        </div>
      )}
    </div>
  );
}

function Session({ course, topic, aiOn }: { course: Course; topic: Topic; aiOn: boolean }) {
  const router = useRouter();
  const policy = usePolicy(course.classId);
  const pools = useStore((s) => s.questions);
  const states = useStore((s) => s.topicState);
  const hasInteractive = useStore((s) => Boolean(s.experiences[topic.id]));
  const pool = pools[topic.id];
  const state = states[topic.id];
  const [startAttempts] = useState(() => state?.attempts ?? 0);
  const [phase, setPhase] = useState<Phase>(startAttempts > 0 ? "learn" : "try");
  const [view, setView] = useState<"interactive" | "read">(hasInteractive || aiOn ? "interactive" : "read");
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [poolError, setPoolError] = useState("");
  const [fetchTry, setFetchTry] = useState(0);
  const [results, setResults] = useState<number[]>([]);
  const refilled = useRef(false);

  const context = useMemo(() => topicContext(course, topic, state), [course, topic, state]);
  const material = useStore((s) => materialFor(s, course.id, topic.id));
  const askForQuestions = (avoid?: string[]) =>
    postJSON<{ questions: Question[] }>("/api/questions", { context: topicContext(course, topic), classId: course.classId, topicId: topic.id, avoid, material: materialFor(getState(), course.id, topic.id) || undefined });

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
  // Leaving one unanswered keeps the tutor guarded on it, so the lesson is not a way round the hints.
  const [held, setHeld] = useState<{ id: string; prompt: string } | null>(null);
  const leavePractice = (to: Phase) => {
    if (answered) setIndex(index + 1);
    else if (current) setHeld({ id: current.id, prompt: current.prompt });
    go(to);
  };
  const open = current ? { id: current.id, prompt: current.prompt, answered } : held && phase !== "done" ? { ...held, answered: false } : undefined;
  // The tutor panel belongs to the last question that was open: it keeps its chat while that question is answered
  // or the learner steps back to the lesson, and starts again only when a different question opens.
  const [panel, setPanel] = useState("topic");
  if (open && open.id !== panel) setPanel(open.id);
  const toPractice = () => go(practiceDone ? "teach" : "practice");
  const next = upNext(course, states, course.topics.length).find((s) => s.topic.id !== topic.id && (aiOn || pools[s.topic.id]?.length));

  const waiting = poolError ? (
    <Retry message={poolError} onRetry={() => { setPoolError(""); setFetchTry((n) => n + 1); }} />
  ) : aiOn ? (
    <p className="card p-5 text-sm text-muted" role="status">Writing questions for this topic…</p>
  ) : (
    <Notice>This topic has no ready-made questions. Writing them needs AI, which is off on this site.</Notice>
  );
  const at = STEPS.findIndex((x) => x.id === phase);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        <header>
          <Link href="/course" className="link">← {course.code} study plan</Link>
          <h1 className="title mt-1">{topic.title}</h1>
          <p className="mt-1 hidden text-sm text-muted sm:block">{topic.summary}</p>
          {phase !== "done" && (
            <p className="mt-3 text-sm text-muted">Stage {at + 1} of {STEPS.length} · <span className="font-semibold text-ink">{STEPS[at].label}</span></p>
          )}
        </header>

        {phase === "try" && (
          <>
            <p className="text-sm leading-relaxed text-muted">One question before the lesson. It isn’t scored, so guess if you have to.</p>
            {warmUp ? (
              <QuestionCard key={warmUp.id} question={warmUp} context={context} aiOn={aiOn} scored={false} eyebrow="Try first · not scored" nextLabel="Go to the lesson" onAnswered={() => setAnswered(true)} onResult={() => {}} onNext={() => go("learn")} />
            ) : waiting}
            {!answered && <button type="button" className="link" onClick={() => go("learn")}>Skip to the lesson</button>}
          </>
        )}

        {phase === "learn" && (
          <>
            <div className="flex border-b border-line" role="tablist" aria-label="Lesson type">
              <button type="button" role="tab" aria-selected={view === "interactive"} className="tab" onClick={() => setView("interactive")}>Interactive</button>
              <button type="button" role="tab" aria-selected={view === "read"} className="tab" onClick={() => setView("read")}>Read it</button>
            </div>
            {view === "interactive" ? (
              <Interactive course={course} topic={topic} aiOn={aiOn} onFinish={toPractice} />
            ) : (
              <Reading course={course} topic={topic} aiOn={aiOn} policy={policy} />
            )}
            <div className="flex justify-end">
              <button type="button" className={view === "interactive" ? "link" : "btn btn-primary w-full sm:w-auto"} onClick={toPractice}>
                {practiceDone ? "On to teach it back" : view === "interactive" ? "Skip to practice" : "I’m ready to practice"}
              </button>
            </div>
          </>
        )}

        {phase === "practice" && (
          <>
            {current ? (
              <>
                <p className="text-sm text-muted"><span className="tabular-nums">Question {index + 1} of {practice.length}.</span> Answer from memory, without looking back at the lesson.</p>
                <QuestionCard
                  key={current.id}
                  question={current}
                  context={context}
                  aiOn={aiOn}
                  nextLabel={index + 1 < practice.length ? "Next question" : "On to teach it back"}
                  onAnswered={() => { setAnswered(true); setHeld(null); }}
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
              <div className="mb-1.5 flex justify-between text-sm"><span className="text-muted">Readiness for {topic.title}</span><span className="font-semibold tabular-nums">{pct(readiness(state))}</span></div>
              <Bar value={readiness(state)} label="Readiness" />
            </div>
            <p className="text-sm leading-relaxed text-muted">
              {results.length > 0 && <>You got {results.filter((r) => r >= PASS_SCORE).length} of {results.length} practice questions right. </>}
              {state?.card ? <>This topic comes back for review <span className="font-semibold text-ink">{dueLabel(state.card.due)}</span>.</> : "Answer practice questions to schedule a review."}
            </p>
            {!isVerified(state) && (
              <p className="text-sm leading-relaxed text-muted">
                You did this with the lesson and tutor nearby, so it is not verified yet. Blind practice asks new questions with no help and marks them like an exam.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={`btn ${isVerified(state) ? "" : "btn-primary"}`}
                onClick={() => {
                  actions.startCheck({ courseId: course.id, topicIds: [topic.id], title: `Blind practice: ${topic.title}`, exam: false });
                  router.push("/check");
                }}
              >
                Blind practice
              </button>
              {next && (
                <button type="button" className={`btn ${isVerified(state) ? "btn-primary" : ""}`} onClick={() => actions.open(course.id, next.topic.id)}>
                  Next: {next.topic.title}
                </button>
              )}
              <button type="button" className="btn" onClick={() => router.push("/course")}>Back to study plan</button>
            </div>
          </div>
        )}
      </div>

      {/* A different question gets a new panel, so one question's attempt and chat never carry over to the next. */}
      <TutorPanel
        key={panel}
        context={context}
        policy={policy}
        classId={course.classId}
        aiPolicy={course.aiPolicy}
        aiOn={aiOn}
        material={material}
        question={open}
      />
    </div>
  );
}

function LearnScreen() {
  const aiOn = useAiStatus();
  const course = useStore((s) => (s.activeCourseId ? s.courses[s.activeCourseId] : undefined));
  const topicId = useStore((s) => s.activeTopicId);
  const topic = course?.topics.find((t) => t.id === topicId);

  if (aiOn === null) return <Loading />;
  if (!course || !topic) {
    return (
      <Empty title="Pick a topic to study">
        <Link href="/course" className="btn btn-primary mt-4">Open study plan</Link>
      </Empty>
    );
  }
  return <Session key={topic.id} course={course} topic={topic} aiOn={aiOn} />;
}

export default function LearnPage() {
  return (
    <RequireUser>
      <LearnScreen />
    </RequireUser>
  );
}
