"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { RequireUser } from "@/components/RequireUser";
import { Bar, Empty, Loading, Notice, RubricCheck, VerdictLine } from "@/components/ui";
import { errorText, pct, postJSON, topicContext, useAiStatus } from "@/lib/client";
import { readiness } from "@/lib/mastery";
import { actions, getState, materialFor, useStore } from "@/lib/store";
import { PASS_SCORE, type AnswerKey, type CheckScope, type Course, type Question, type Review, type Topic } from "@/lib/types";

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const EXAM_TOPICS = 5;
const TOPIC_QUESTIONS = 3;

interface Answer {
  choice: number | null;
  text: string;
  photos: { name: string; data: string }[];
}
const blank = (): Answer => ({ choice: null, text: "", photos: [] });
const BLANK: Review = { score: 0, lines: [], feedback: "No answer was given.", fullCredit: "" };
// One marked question: its score (null until marked by hand), the reviewer's lines if any, and the key.
interface Marked {
  score: number | null;
  review: Review | null;
  key: AnswerKey;
}
const answered = (q: Question, a: Answer) => (q.kind === "mcq" ? a.choice !== null : a.text.trim().length > 0 || a.photos.length > 0);

function readPhoto(file: File): Promise<{ name: string; data: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, data: String(r.result) });
    r.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    r.readAsDataURL(file);
  });
}

// Picks what to ask. With AI, fresh exam-style questions the student has never
// seen; without it, the ready-made ones, written answers first.
async function gather(course: Course, topics: Topic[], exam: boolean, aiOn: boolean): Promise<Question[]> {
  const s = getState();
  if (!aiOn) {
    const pool = topics.flatMap((t) => s.questions[t.id] ?? []);
    return [...pool.filter((q) => q.kind === "free"), ...pool.filter((q) => q.kind === "mcq")].slice(0, exam ? EXAM_TOPICS : TOPIC_QUESTIONS);
  }
  // The weakest, most heavily tested topics first.
  const chosen = [...topics].sort((a, b) => b.weight * (1 - readiness(s.topicState[b.id])) - a.weight * (1 - readiness(s.topicState[a.id]))).slice(0, exam ? EXAM_TOPICS : 1);
  const sets = await Promise.all(
    chosen.map((t) =>
      postJSON<{ questions: Question[] }>("/api/questions", {
        context: topicContext(course, t, s.topicState[t.id]),
        classId: course.classId,
        topicId: t.id,
        style: "exam",
        count: exam ? 1 : TOPIC_QUESTIONS,
        material: materialFor(s, course.id, t.id) || undefined,
        avoid: (s.questions[t.id] ?? []).map((q) => q.prompt).slice(0, 20),
      }).then((r) => r.questions),
    ),
  );
  return sets.flat();
}

function Blind({ course, scope, aiOn, onRetry }: { course: Course; scope: CheckScope; aiOn: boolean; onRetry: () => void }) {
  const router = useRouter();
  const topics = course.topics.filter((t) => scope.topicIds.includes(t.id));
  const [stage, setStage] = useState<"intro" | "loading" | "answering" | "marking" | "results">("intro");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [i, setI] = useState(0);
  const [scores, setScores] = useState<(number | null)[]>([]);
  const [reviews, setReviews] = useState<(Review | null)[]>([]);
  const [keys, setKeys] = useState<AnswerKey[]>([]);
  const [error, setError] = useState("");
  const recorded = useRef(false);
  // What has come back for each question, kept so a failed hand-in only re-marks what is missing.
  const kept = useRef(new Map<number, Marked>());
  // The questions already marked after a hand-in that failed partway. Their answers are final.
  const [locked, setLocked] = useState<number[]>([]);

  async function begin() {
    setError("");
    setStage("loading");
    try {
      const qs = await gather(course, topics, scope.exam, aiOn);
      if (!qs.length) throw new Error("There are no questions for this yet.");
      setQuestions(qs);
      setAnswers(qs.map(blank));
      setStage("answering");
    } catch (e) {
      setError(errorText(e, "Could not set up the questions."));
      setStage("intro");
    }
  }

  // Scores go into mastery once, when every question has one. These are the only
  // answers allowed to lift a topic past the guided cap.
  function finish(all: (number | null)[]) {
    setScores(all);
    if (recorded.current || all.some((s) => s === null)) return;
    recorded.current = true;
    // One blind result per topic, the mean of its questions, so the order they were asked in cannot matter.
    const byTopic = new Map<string, number[]>();
    questions.forEach((q, k) => byTopic.set(q.topicId, [...(byTopic.get(q.topicId) ?? []), all[k]!]));
    for (const [topicId, got] of byTopic) actions.attempt(topicId, got.reduce((a, b) => a + b, 0) / got.length, null, true);
  }

  // Hands one question to the server, which holds the key. Multiple choice is
  // scored there; written work is marked by the reviewer, or, with no reviewer,
  // comes back with the key for the student to mark.
  async function mark(q: Question, a: Answer): Promise<Marked> {
    const answer = (body: object) => postJSON<{ grade: { score: number } | null; key: AnswerKey }>("/api/answer", { questionId: q.id, ...body });
    if (q.kind === "mcq") {
      if (a.choice === null) return { score: 0, review: null, key: (await answer({ reveal: true })).key };
      const r = await answer({ choice: a.choice });
      return { score: r.grade?.score ?? 0, review: null, key: r.key };
    }
    if (!answered(q, a)) return { score: 0, review: BLANK, key: (await answer({ reveal: true })).key };
    if (!aiOn) return { score: null, review: null, key: (await answer({ reveal: true })).key };
    const topic = course.topics.find((t) => t.id === q.topicId) ?? topics[0];
    const r = await postJSON<{ review: Review; key: AnswerKey }>("/api/review", {
      context: topicContext(course, topic),
      questionId: q.id,
      answer: a.text,
      photos: a.photos.map((p) => p.data),
      material: materialFor(getState(), course.id, topic.id) || undefined,
    });
    return { score: r.review.score, review: r.review, key: r.key };
  }

  async function handIn() {
    setError("");
    setStage("marking");
    const settled = await Promise.allSettled(
      questions.map(async (q, k) => {
        const done = kept.current.get(k) ?? (await mark(q, answers[k]));
        kept.current.set(k, done);
        return done;
      }),
    );
    const failed = settled.find((r) => r.status === "rejected");
    if (failed) {
      const missing = settled.filter((r) => r.status === "rejected").length;
      setError(`${errorText(failed.reason, "Marking failed.")} ${missing} of ${questions.length} answers still need marking; the rest are marked and cannot be changed.`);
      setLocked([...kept.current.keys()]);
      setStage("answering");
      return;
    }
    const marked = settled.map((r) => (r as PromiseFulfilledResult<Marked>).value);
    setReviews(marked.map((m) => m.review));
    setKeys(marked.map((m) => m.key));
    setStage("results");
    finish(marked.map((m) => m.score));
  }

  if (stage === "intro" || stage === "loading") {
    return (
      <div className="mx-auto max-w-2xl">
        <Link href="/course" className="link">← {course.code} study plan</Link>
        <h1 className="title mt-1">{scope.title}</h1>
        <p className="mt-3 leading-relaxed text-muted">
          {aiOn ? "New questions, no hints, marked like an exam." : "No hints, marked against the rubric."} This is the check that counts toward readiness.
        </p>
        <ul className="mt-4 list-disc space-y-1.5 pl-5">
          <li>No hints, no tutor, no lesson. Put your notes away.</li>
          <li>Show your reasoning. {aiOn ? "Type it, or work on paper and upload photos." : "Type it, or work on paper."}</li>
          <li>{aiOn ? "Nothing is marked until you hand in. Then it is marked the way a professor would mark an exam." : "Nothing is revealed until you hand in. Then you mark your own work against the rubric."}</li>
        </ul>
        {error && <div className="mt-4"><Notice tone="rose">{error}</Notice></div>}
        <button type="button" className="btn btn-primary mt-6" disabled={stage === "loading"} onClick={begin}>
          {stage === "loading" ? "Writing the questions…" : "Start"}
        </button>
        {stage === "loading" && aiOn && <p className="hint mt-3" role="status">Writing new questions. This takes up to a minute.</p>}
      </div>
    );
  }

  if (stage === "answering" || stage === "marking") {
    const q = questions[i];
    const a = answers[i];
    // An answer is final once it has been marked, and while the set is being marked.
    const final = stage === "marking" || locked.includes(i);
    const set = (patch: Partial<Answer>) => {
      if (final) return;
      setAnswers((all) => all.map((x, k) => (k === i ? { ...x, ...patch } : x)));
    };
    const last = i === questions.length - 1;
    const unanswered = questions.filter((x, k) => !answered(x, answers[k])).length;

    async function addPhotos(files: FileList | null) {
      setError("");
      const picked = [...(files ?? [])].slice(0, MAX_PHOTOS - a.photos.length);
      if (picked.some((f) => f.size > MAX_PHOTO_BYTES)) return setError("Each photo has to be under 4 MB.");
      try {
        set({ photos: [...a.photos, ...(await Promise.all(picked.map(readPhoto)))] });
      } catch (e) {
        setError(errorText(e, "Could not read that photo."));
      }
    }

    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <p className="text-sm text-muted">{scope.title} · <span className="tabular-nums">question {i + 1} of {questions.length}</span></p>
          <div className="mt-2"><Bar value={(i + 1) / questions.length} label="Progress through the questions" /></div>
        </header>
        <div className="card p-5 sm:p-6">
          <Markdown>{q.prompt}</Markdown>
          {final && <p className="hint mt-3">This answer has been marked and cannot be changed.</p>}
          {q.kind === "mcq" ? (
            <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Answer choices">
              {q.choices.map((c, k) => (
                <button key={k} type="button" role="radio" aria-checked={a.choice === k} disabled={final} className="choice" onClick={() => set({ choice: k })}>
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-ui text-xs font-semibold">{String.fromCharCode(65 + k)}</span>
                  <Markdown className="min-w-0 flex-1">{c}</Markdown>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <label className="label" htmlFor="blind-answer">Your answer, with your reasoning</label>
                <textarea id="blind-answer" className="field min-h-40" disabled={final} value={a.text} onChange={(e) => set({ text: e.target.value })} placeholder="Write it the way you would on the exam paper." />
              </div>
              {aiOn && (
                <div>
                  <label className="label" htmlFor="blind-photos">Or photos of your written work <span className="font-normal text-muted">· up to {MAX_PHOTOS}</span></label>
                  <input id="blind-photos" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={final || a.photos.length >= MAX_PHOTOS} className="block w-full text-sm text-muted file:mr-3 file:min-h-[2.75rem] file:rounded-full file:border file:border-line-ui file:bg-surface file:px-4 file:text-sm file:font-semibold file:text-ink" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
                  {a.photos.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {a.photos.map((p, k) => (
                        <li key={k} className="flex items-center justify-between gap-3">
                          <span className="truncate">{p.name}</span>
                          <button type="button" className="link" disabled={final} onClick={() => set({ photos: a.photos.filter((_, n) => n !== k) })}>Remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {error && <Notice tone="rose">{error}</Notice>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="btn" disabled={i === 0 || stage === "marking"} onClick={() => setI(i - 1)}>Previous</button>
          {last ? (
            <div className="flex flex-wrap items-center gap-3">
              {unanswered > 0 && stage !== "marking" && <span className="hint">{unanswered === 1 ? "Question" : "Questions"} {questions.map((x, k) => (answered(x, answers[k]) ? null : k + 1)).filter(Boolean).join(", ")} blank</span>}
              {stage === "marking" && <span className="hint" role="status">Marking {questions.length} answers. This takes up to a minute.</span>}
              <button type="button" className="btn btn-primary" disabled={stage === "marking"} onClick={() => void handIn()}>
                {stage === "marking" ? "Marking your work…" : error ? "Try marking again" : "Hand in"}
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => { setI(i + 1); window.scrollTo({ top: 0 }); }}>Next question</button>
          )}
        </div>
      </div>
    );
  }

  const done = scores.every((s) => s !== null);
  const total = done ? scores.reduce<number>((sum, s) => sum + (s ?? 0), 0) / scores.length : 0;
  const weak = done ? [...new Set(questions.filter((_, k) => (scores[k] ?? 0) < PASS_SCORE).map((q) => q.topicId))] : [];
  const topicTitle = (id: string) => course.topics.find((t) => t.id === id)?.title ?? "this topic";
  const weakTitles = weak.map(topicTitle);
  // Marks for one question: rubric points where a reviewer gave them, otherwise a percentage.
  const points = (k: number) => {
    const lines = reviews[k]?.lines ?? [];
    return lines.length ? { earned: lines.reduce((n, l) => n + l.earned, 0), possible: lines.reduce((n, l) => n + l.possible, 0) } : undefined;
  };
  const marks = (k: number) => {
    const p = points(k);
    return p ? `${p.earned}/${p.possible}` : pct(scores[k] ?? 0);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="eyebrow">{scope.title}</p>
        <h1 className="title mt-1">{scope.exam ? "Mock exam results" : "Blind practice results"}</h1>
        {done ? (
          <>
            <p className="display mt-4 tabular-nums">{pct(total)}</p>
            <p className="mt-2 leading-relaxed text-muted">
              {total >= PASS_SCORE
                ? `Passed. The pass line is ${pct(PASS_SCORE)}, and you did this with no help.`
                : `Below the ${pct(PASS_SCORE)} pass line. Go back over ${weakTitles.join(", ") || "the topic"}, then try again with new questions.`}
            </p>
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {questions.map((q, k) => (
                <li key={q.id}>
                  <a href={`#q${k + 1}`} className="flex min-h-[2.75rem] items-center justify-between gap-3 py-2 hover:bg-panel">
                    <span className="min-w-0 truncate">Question {k + 1}{scope.exam ? ` · ${topicTitle(q.topicId)}` : ""}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{answered(q, answers[k]) ? `${marks(k)} · ${(scores[k] ?? 0) >= PASS_SCORE ? "Passed" : "Not yet"}` : "Not answered"}</span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {weak.length > 0 && (
                <button type="button" className="btn btn-primary" onClick={() => { actions.open(course.id, weak[0]); router.push("/learn"); }}>Relearn {topicTitle(weak[0])}</button>
              )}
              <button type="button" className={weak.length > 0 ? "btn" : "btn btn-primary"} onClick={onRetry}>Try again{aiOn ? " with new questions" : ""}</button>
              <Link href="/course" className="link">Back to study plan</Link>
            </div>
          </>
        ) : (
          <p className="mt-2 leading-relaxed text-muted">Mark each written answer against its rubric, the way your professor would.</p>
        )}
      </header>

      {questions.map((q, k) => {
        const review = reviews[k];
        const a = answers[k];
        return (
          <section key={q.id} id={`q${k + 1}`} className="card scroll-mt-4 space-y-4 p-5 sm:p-6" aria-label={`Question ${k + 1}`}>
            <p className="eyebrow">Question {k + 1} · {topicTitle(q.topicId)}</p>
            <Markdown>{q.prompt}</Markdown>
            <div className="rounded-[10px] bg-panel px-4 py-3 text-sm">
              <p className="card-title">Your answer</p>
              {q.kind === "mcq" ? (
                <Markdown className="prose-sm mt-1">{a.choice === null ? "No answer." : q.choices[a.choice]}</Markdown>
              ) : (
                <p className="mt-1 whitespace-pre-wrap">{a.text || (a.photos.length ? `${a.photos.length} photo${a.photos.length === 1 ? "" : "s"} of written work` : "No answer.")}</p>
              )}
            </div>
            {scores[k] !== null && <VerdictLine score={scores[k]!} marks={points(k)} />}
            {review && review.lines.length > 0 && (
              <table className="w-full text-sm">
                <caption className="sr-only">Marks by rubric line</caption>
                <tbody className="divide-y divide-line">
                  {review.lines.map((l, n) => (
                    <tr key={n} className="align-top">
                      <td className="w-14 py-2 pr-3 font-semibold tabular-nums">{l.earned}/{l.possible}</td>
                      <td className="py-2"><span className="font-semibold">{l.criterion.replace(/\.$/, "")}.</span> {l.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {review?.feedback && <Markdown>{review.feedback}</Markdown>}
            {review?.fullCredit && (
              <div>
                <h3 className="card-title">A full-credit answer</h3>
                <Markdown className="mt-1">{review.fullCredit}</Markdown>
              </div>
            )}
            <div>
              <h3 className="card-title">Solution</h3>
              <Markdown className="mt-1">{keys[k]?.solution ?? ""}</Markdown>
            </div>
            {scores[k] === null && (
              <RubricCheck
                prompt="Which of these did your answer show?"
                items={keys[k]?.rubric ?? []}
                onSave={(score) => {
                  void postJSON("/api/answer", { questionId: q.id, selfScore: score }).catch(() => {});
                  finish(scores.map((s, n) => (n === k ? score : s)));
                }}
              />
            )}
          </section>
        );
      })}

      <div className="flex flex-wrap gap-3">
        <Link href="/course" className="btn">Back to study plan</Link>
      </div>
    </div>
  );
}

function CheckScreen() {
  const aiOn = useAiStatus();
  const scope = useStore((s) => s.check);
  const course = useStore((s) => (s.check ? s.courses[s.check.courseId] : undefined));
  const [round, setRound] = useState(0);
  if (aiOn === null) return <Loading />;
  if (!scope || !course) {
    return (
      <Empty title="Blind practice">
        <p>Pick a topic or an exam on your study plan to practice with no help.</p>
        <Link href="/course" className="btn btn-primary mt-4">Open study plan</Link>
      </Empty>
    );
  }
  return <Blind key={`${scope.at ?? scope.title}:${scope.topicIds.join()}:${round}`} course={course} scope={scope} aiOn={aiOn} onRetry={() => { setRound(round + 1); window.scrollTo({ top: 0 }); }} />;
}

export default function CheckPage() {
  return (
    <RequireUser>
      <CheckScreen />
    </RequireUser>
  );
}
