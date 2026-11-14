"use client";

import { useState } from "react";
import { pct } from "@/lib/client";
import { verdictFor } from "@/lib/types";
import { Markdown } from "./Markdown";

export function Bar({ value, label, tone = "leaf" }: { value: number; label?: string; tone?: "leaf" | "honey" }) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-line"
    >
      <div className={`h-full rounded-full ${tone === "leaf" ? "bg-leaf" : "bg-honey-edge"}`} style={{ width: pct(v) }} />
    </div>
  );
}

const NOTICE = {
  plain: "bg-panel border-line",
  honey: "bg-honey-soft border-honey-ledge",
  rose: "bg-rose-soft border-rose/30",
  leaf: "bg-leaf-soft border-leaf/30",
};

// "plain" is for information; "honey" is for something the reader should act on.
export function Notice({ children, tone = "plain" }: { children: React.ReactNode; tone?: keyof typeof NOTICE }) {
  return <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${NOTICE[tone]}`}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel mx-auto max-w-xl">
      <div className="card p-8 text-center">
        <h1 className="heading">{title}</h1>
        <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
      </div>
    </div>
  );
}

export const Loading = () => <p className="text-sm text-muted" role="status">Loading…</p>;

// The one wording of how to turn the AI features on.
export const KeyHelp = () => (
  <>Add <code>OPENAI_API_KEY</code> to <code>.env.local</code> and restart the dev server.</>
);

const VERDICT = {
  correct: { cls: "text-leaf", mark: "✓" },
  partial: { cls: "text-honey-deep", mark: "◐" },
  incorrect: { cls: "text-rose", mark: "✕" },
};

export function VerdictLine({ score, labels }: { score: number; labels: { correct: string; incorrect: string } }) {
  const v = verdictFor(score);
  const text = v === "correct" ? labels.correct : v === "partial" ? `Partly there (${pct(score)})` : labels.incorrect;
  return (
    <p className={`font-semibold ${VERDICT[v].cls}`} role="status">
      <span aria-hidden="true">{VERDICT[v].mark} </span>
      {text}
    </p>
  );
}

// Self-grading against a list of points, used when there is no AI grader.
export function RubricCheck({ prompt, items, onSave }: { prompt: string; items: string[]; onSave: (score: number, missed: string[]) => void }) {
  const points = items.length ? items : ["My answer was correct"];
  const [checked, setChecked] = useState<boolean[]>(() => points.map(() => false));
  return (
    <div>
      <h3 className="eyebrow">Check yourself</h3>
      <p className="mt-1.5 text-sm">{prompt}</p>
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
        className="btn btn-honey mt-2"
        onClick={() => onSave(checked.filter(Boolean).length / points.length, points.filter((_, i) => !checked[i]))}
      >
        Save my score
      </button>
    </div>
  );
}
