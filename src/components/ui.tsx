"use client";

import { useState } from "react";
import { pct } from "@/lib/client";
import { verdictFor } from "@/lib/types";
import { Markdown } from "./Markdown";

export function Bar({ value, label }: { value: number; label?: string }) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-panel"
    >
      <div className="h-full rounded-full bg-honey" style={{ width: pct(v) }} />
    </div>
  );
}

const NOTICE = {
  plain: "bg-panel border-line",
  honey: "bg-honey-soft border-honey-edge",
  rose: "bg-rose-soft border-rose/30",
  leaf: "bg-leaf-soft border-leaf/30",
};

// "plain" is for information; "honey" is for something the reader should act on.
export function Notice({ children, tone = "plain" }: { children: React.ReactNode; tone?: keyof typeof NOTICE }) {
  return <div className={`rounded-[10px] border px-4 py-3 text-sm leading-relaxed ${NOTICE[tone]}`}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <h1 className="heading">{title}</h1>
      <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}

export const Loading = () => <p className="text-sm text-muted" role="status">Loading…</p>;

// Small line icons drawn to match the hexagon's stroke, used where a tick or cross carries meaning.
const MARKS = { check: "M3.5 8.5l3 3 6-7", cross: "M4 4l8 8M12 4l-8 8", partial: "M4 8h8", up: "M4 10l4-4 4 4", down: "M4 6l4 4 4-4" };

export function Mark({ kind }: { kind: keyof typeof MARKS }) {
  return (
    <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block shrink-0 align-[-0.125em]">
      <path d={MARKS[kind]} />
    </svg>
  );
}

const VERDICT = {
  correct: { cls: "text-leaf", mark: "check" },
  partial: { cls: "text-honey-deep", mark: "partial" },
  incorrect: { cls: "text-rose", mark: "cross" },
} as const;

// The same three verdicts everywhere a score is shown.
export function VerdictLine({ score }: { score: number }) {
  const v = verdictFor(score);
  const text = v === "correct" ? "Correct" : v === "partial" ? `Partly there (${pct(score)})` : "Not yet";
  return (
    <p className={`font-semibold ${VERDICT[v].cls}`} role="status">
      <Mark kind={VERDICT[v].mark} /> {text}
    </p>
  );
}

// Self-grading against a list of points, used when there is no AI grader.
export function RubricCheck({ prompt, items, onSave }: { prompt: string; items: string[]; onSave: (score: number, missed: string[]) => void }) {
  const points = items.length ? items : ["My answer was correct"];
  const [checked, setChecked] = useState<boolean[]>(() => points.map(() => false));
  return (
    <div>
      <h3 className="card-title">Check yourself</h3>
      <p className="mt-1 text-sm">{prompt}</p>
      <div className="mt-1 grid">
        {points.map((point, i) => (
          <label key={i} className="flex cursor-pointer items-start gap-3 py-2">
            <input type="checkbox" className="check" checked={checked[i]} onChange={(e) => setChecked((c) => c.map((x, j) => (j === i ? e.target.checked : x)))} />
            <Markdown className="prose-sm min-w-0 flex-1">{point}</Markdown>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary mt-2 w-full sm:ml-auto sm:flex sm:w-auto"
        onClick={() => onSave(checked.filter(Boolean).length / points.length, points.filter((_, i) => !checked[i]))}
      >
        Save my score
      </button>
    </div>
  );
}
