"use client";

import { useState } from "react";
import { postJSON } from "@/lib/client";
import type { TopicContext } from "@/lib/server/ai";
import type { Grade, Question } from "@/lib/types";
import { Markdown } from "./Markdown";
import { Notice } from "./ui";

const CONFIDENCE = [
  { v: 1, label: "Guessing" },
  { v: 2, label: "Fairly sure" },
  { v: 3, label: "Certain" },
];

interface Props {
  question: Question;
  context: TopicContext;
  aiOn: boolean;
  countsNote?: string;
  nextLabel?: string;
  onResult: (score: number, confidence: number) => void;
  onNext: () => void;
  onAnswered?: () => void;
}

// One practice item. The learner commits to an answer and a confidence level
// before anything is revealed. Mount with key={question.id} to reset.
export function QuestionCard({ question: q, context, aiOn, countsNote, nextLabel = "Next", onResult, onNext, onAnswered }: Props) {
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [phase, setPhase] = useState<"answer" | "grading" | "self" | "done">("answer");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [checked, setChecked] = useState<boolean[]>(() => q.rubric.map(() => false));
  const [error, setError] = useState("");

  const hasAnswer = q.kind === "mcq" ? choice !== null : text.trim().length > 0;
  const revealed = phase === "self" || phase === "done";

  function finish(g: Grade) {
    setGrade(g);
    setPhase("done");
    onResult(g.score, confidence ?? 2);
  }

  async function check() {
    if (!hasAnswer || confidence === null) return;
    setError("");
    onAnswered?.();
    if (q.kind === "mcq") {
      const right = choice === q.answerIndex;
      finish({ score: right ? 1 : 0, verdict: right ? "correct" : "incorrect", feedback: "", missed: [] });
      return;
    }
    if (!aiOn) {
      setPhase("self");
      return;
    }
    setPhase("grading");
    try {
      const { grade: g } = await postJSON<{ grade: Grade }>("/api/grade", {
        context,
        prompt: q.prompt,
        answer: text,
        solution: q.solution,
        rubric: q.rubric,
      });
      finish(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grading failed.");
      setPhase("self");
    }
  }

  function selfGrade() {
    const hit = checked.filter(Boolean).length;
    const score = q.rubric.length ? hit / q.rubric.length : 0;
    finish({
      score,
      verdict: score >= 0.8 ? "correct" : score >= 0.4 ? "partial" : "incorrect",
      feedback: "",
      missed: q.rubric.filter((_, i) => !checked[i]),
    });
  }

  const overconfident = grade && grade.score < 0.5 && confidence === 3;
  const underconfident = grade && grade.score >= 0.8 && confidence === 1;

  return (
    <div className="card p-5 sm:p-6">
      {countsNote && <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-honey-deep">{countsNote}</p>}
      <Markdown>{q.prompt}</Markdown>

      {q.kind === "mcq" ? (
        <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Answer choices">
          {q.choices.map((c, i) => {
            const state = phase === "done" ? (i === q.answerIndex ? "right" : i === choice ? "wrong" : undefined) : undefined;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={choice === i}
                aria-label={`${String.fromCharCode(65 + i)}: ${c.replace(/[$\\`]/g, "")}`}
                disabled={phase !== "answer"}
                data-on={choice === i}
                data-state={state}
                className="choice"
                onClick={() => setChoice(i)}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-xs font-semibold">
                  {String.fromCharCode(65 + i)}
                </span>
                <Markdown className="min-w-0 flex-1">{c}</Markdown>
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
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">How sure are you?</span>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Confidence">
            {CONFIDENCE.map((c) => (
              <button
                key={c.v}
                type="button"
                role="radio"
                aria-checked={confidence === c.v}
                className={`btn !py-1.5 !text-xs ${confidence === c.v ? "btn-primary" : ""}`}
                onClick={() => setConfidence(c.v)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-honey ml-auto" disabled={!hasAnswer || confidence === null} onClick={check}>
            Check answer
          </button>
        </div>
      )}

      {phase === "grading" && <p className="mt-5 text-sm text-muted" role="status">Reading your answer…</p>}
      {error && <div className="mt-4"><Notice tone="rose">{error} You can grade it yourself below.</Notice></div>}

      {revealed && (
        <div className="mt-5 space-y-4 border-t border-line pt-5">
          {phase === "done" && grade && (
            <p className={`text-sm font-bold ${grade.verdict === "correct" ? "text-leaf" : grade.verdict === "partial" ? "text-honey-deep" : "text-rose"}`} role="status">
              {grade.verdict === "correct" ? "Correct" : grade.verdict === "partial" ? `Partly there (${Math.round(grade.score * 100)}%)` : "Not yet"}
            </p>
          )}
          {grade?.feedback && <Markdown>{grade.feedback}</Markdown>}
          {overconfident && <Notice tone="rose">You were certain and it was wrong. That is the most useful kind of miss: read the solution closely, because this is a belief to fix, not a gap to fill.</Notice>}
          {underconfident && <Notice tone="leaf">You said you were guessing and got it right. You may know this better than you think.</Notice>}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Solution</h3>
            <Markdown className="mt-1.5">{q.solution}</Markdown>
          </div>

          {phase === "self" && (
            <div>
              <h3 className="text-sm font-semibold">Compare your answer with the solution. Which points did you make?</h3>
              <div className="mt-2 grid gap-1.5">
                {q.rubric.map((r, i) => (
                  <label key={i} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 accent-[var(--leaf)]"
                      checked={checked[i]}
                      onChange={(e) => setChecked((c) => c.map((x, j) => (j === i ? e.target.checked : x)))}
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
              <button type="button" className="btn btn-honey mt-3" onClick={selfGrade}>Save my score</button>
            </div>
          )}

          {phase === "done" && grade && grade.missed.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">What was missing</h3>
              <ul className="mt-1.5 list-disc pl-5 text-sm">
                {grade.missed.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}

          {phase === "done" && (
            <div className="flex justify-end">
              <button type="button" className="btn btn-primary" onClick={onNext}>{nextLabel}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
