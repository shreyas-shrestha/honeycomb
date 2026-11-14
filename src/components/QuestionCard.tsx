"use client";

import { useEffect, useRef, useState } from "react";
import { errorText, postJSON } from "@/lib/client";
import type { Grade, Question, TopicContext } from "@/lib/types";
import { Markdown } from "./Markdown";
import { Mark, Notice, RubricCheck, VerdictLine } from "./ui";

const CONFIDENCE = [
  { v: 1, label: "Guessing" },
  { v: 2, label: "Fairly sure" },
  { v: 3, label: "Certain" },
];

interface Props {
  question: Question;
  context: TopicContext;
  aiOn: boolean;
  eyebrow?: string;
  scored?: boolean; // false for the warm-up, where being wrong is expected
  nextLabel?: string;
  onResult: (score: number, confidence: number) => void;
  onNext: () => void;
  onAnswered?: () => void;
}

// One practice item. The learner commits to an answer and a confidence level
// before anything is revealed. Mount with key={question.id} to reset.
export function QuestionCard({ question: q, context, aiOn, eyebrow, scored = true, nextLabel = "Next", onResult, onNext, onAnswered }: Props) {
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [phase, setPhase] = useState<"answer" | "grading" | "self" | "done">("answer");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState("");
  // Grading can outlive the card (the learner moves on); a late result must not be recorded.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const hasAnswer = q.kind === "mcq" ? choice !== null : text.trim().length > 0;
  const revealed = phase === "self" || phase === "done";

  function finish(g: Grade, sure: number) {
    setGrade(g);
    setPhase("done");
    onResult(g.score, sure);
  }

  async function check() {
    if (!hasAnswer || confidence === null) return;
    setError("");
    onAnswered?.();
    if (q.kind === "mcq") return finish({ score: choice === q.answerIndex ? 1 : 0, feedback: "", missed: [] }, confidence);
    if (!aiOn) return setPhase("self");
    setPhase("grading");
    try {
      const { grade: g } = await postJSON<{ grade: Grade }>("/api/grade", {
        context,
        prompt: q.prompt,
        answer: text,
        solution: q.solution,
        rubric: q.rubric,
      });
      if (live.current) finish(g, confidence);
    } catch (e) {
      if (!live.current) return;
      setError(errorText(e, "Grading failed."));
      setPhase("self");
    }
  }

  const overconfident = scored && grade && grade.score < 0.5 && confidence === 3;
  const underconfident = scored && grade && grade.score >= 0.8 && confidence === 1;

  return (
    <div className="card p-5 sm:p-6">
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <Markdown>{q.prompt}</Markdown>

      {q.kind === "mcq" ? (
        <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Answer choices">
          {q.choices.map((c, i) => {
            const letter = String.fromCharCode(65 + i);
            const state = phase === "done" ? (i === q.answerIndex ? "right" : i === choice ? "wrong" : undefined) : undefined;
            const badge = state === "right" ? "border-leaf bg-leaf text-surface" : state === "wrong" ? "border-rose bg-rose text-surface" : "border-line";
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={choice === i}
                aria-label={`${letter}: ${c.replace(/[$\\`]/g, "")}`}
                disabled={phase !== "answer"}
                data-state={state}
                className="choice"
                onClick={() => setChoice(i)}
              >
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${badge}`}>
                  {state === "right" ? <Mark kind="check" /> : state === "wrong" ? <Mark kind="cross" /> : letter}
                </span>
                <Markdown className="min-w-0 flex-1">{c}</Markdown>
                {state && (
                  <span className="shrink-0 self-center text-xs font-semibold">
                    {state === "right" ? "Correct answer" : "Your answer"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-4">
          <label className="label" htmlFor={`a-${q.id}`}>Your answer</label>
          <textarea
            id={`a-${q.id}`}
            className="field min-h-32"
            placeholder="Write it out. Partial reasoning is better than nothing."
            value={text}
            disabled={phase !== "answer"}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      )}

      {phase === "answer" && (
        <div className="mt-5 grid gap-4 sm:flex sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm text-muted" id={`c-${q.id}`}>How sure are you?</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={`c-${q.id}`}>
              {CONFIDENCE.map((c) => (
                <button key={c.v} type="button" role="radio" aria-checked={confidence === c.v} className="chip" onClick={() => setConfidence(c.v)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="btn btn-primary w-full sm:ml-auto sm:w-auto" disabled={!hasAnswer || confidence === null} onClick={check}>
            Check answer
          </button>
        </div>
      )}

      {phase === "grading" && <p className="mt-5 text-sm text-muted" role="status">Reading your answer…</p>}
      {error && <div className="mt-4"><Notice tone="rose">{error} You can score it yourself below.</Notice></div>}

      {revealed && (
        <div className="mt-5 space-y-4 border-t border-line pt-5">
          {phase === "done" && grade && <VerdictLine score={grade.score} />}
          {grade?.feedback && <Markdown>{grade.feedback}</Markdown>}
          {overconfident && <Notice tone="rose">You marked this Certain and got it wrong, so it counts more against your readiness than a wrong guess would. Read the solution before you move on.</Notice>}
          {underconfident && <Notice tone="leaf">You marked this Guessing and got it right.</Notice>}
          <div>
            <h3 className="card-title">Solution</h3>
            <Markdown className="mt-1.5">{q.solution}</Markdown>
          </div>

          {phase === "self" && (
            <RubricCheck
              prompt="Compare your answer with the solution. Which points did you make?"
              items={q.rubric}
              onSave={(score, missed) => finish({ score, feedback: "", missed }, confidence ?? 2)}
            />
          )}

          {phase === "done" && grade && grade.missed.length > 0 && (
            <div>
              <h3 className="card-title">What was missing</h3>
              <ul className="mt-1.5 grid gap-1 pl-5 text-sm">
                {grade.missed.map((m, i) => <li key={i} className="list-disc"><Markdown className="prose-sm">{m}</Markdown></li>)}
              </ul>
            </div>
          )}

          {phase === "done" && (
            <div className="flex justify-end">
              <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={onNext}>{nextLabel}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
