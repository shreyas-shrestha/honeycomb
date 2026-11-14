"use client";

import Link from "next/link";
import { useState } from "react";
import { Bar, Empty, Notice } from "@/components/ui";
import { pct } from "@/lib/client";
import { calibrationGap } from "@/lib/mastery";
import { MODES } from "@/lib/modes";
import { actions, policyFor, useHydrated, useStore } from "@/lib/store";
import type { Course, HelpLevel, InstructorPolicy, TopicState } from "@/lib/types";

const LEVELS: { id: HelpLevel; name: string; detail: string }[] = [
  { id: "hints", name: "Hints only", detail: "One hint at a time. Never a final answer; if a student stays stuck, the tutor works a different problem of the same type." },
  { id: "guided", name: "Guided", detail: "Hints first, then the stuck step, with the next step handed back. A full solution only after a real attempt." },
  { id: "full", name: "Full solutions", detail: "Complete solutions are allowed once the student says what they tried, followed by a check question." },
];

function PolicyForm({ course }: { course: Course }) {
  const saved = useStore((s) => policyFor(s, course.id));
  const [p, setP] = useState<InstructorPolicy>(saved);
  const [status, setStatus] = useState("");
  const set = <K extends keyof InstructorPolicy>(k: K, v: InstructorPolicy[K]) => {
    setP((x) => ({ ...x, [k]: v }));
    setStatus("");
  };

  return (
    <form
      className="card space-y-6 p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!p.allowedModes.length) return setStatus("Allow at least one explanation format.");
        actions.setPolicy(course.id, p);
        setStatus("Saved. The tutor and new lessons follow these settings from now on.");
      }}
    >
      <fieldset>
        <legend className="font-bold">How much help may the tutor give?</legend>
        <div className="mt-3 grid gap-2">
          {LEVELS.map((l) => (
            <label key={l.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${p.helpLevel === l.id ? "border-ink ring-1 ring-ink" : "border-line"}`}>
              <input type="radio" name="help" className="mt-1 accent-[var(--ink)]" checked={p.helpLevel === l.id} onChange={() => set("helpLevel", l.id)} />
              <span>
                <span className="block text-sm font-semibold">{l.name}</span>
                <span className="block text-sm text-muted">{l.detail}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-[var(--ink)]" checked={p.attemptFirst} onChange={(e) => set("attemptFirst", e.target.checked)} />
          <span>Ask students what they tried before helping</span>
        </label>
      </fieldset>

      <div>
        <label className="label" htmlFor="off">Graded work the tutor must not help solve</label>
        <textarea id="off" className="field min-h-20" placeholder="Homework 1 through 10, the LinkedList and AVL coding assignments" value={p.offLimits} onChange={(e) => set("offLimits", e.target.value)} />
        <p className="mt-1 text-xs text-muted">The tutor will explain the concept with a different example and say it cannot work on the graded item.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="emph">What you emphasise</label>
          <textarea id="emph" className="field min-h-24" placeholder="Tracing by hand, edge cases, justifying Big-O" value={p.emphasis} onChange={(e) => set("emphasis", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="not">Notation and conventions</label>
          <textarea id="not" className="field min-h-24" placeholder="Heaps are 1-indexed. Remove from a BST uses the successor. Height of a leaf is 0." value={p.notation} onChange={(e) => set("notation", e.target.value)} />
        </div>
      </div>

      <fieldset>
        <legend className="font-bold">Explanation formats students can choose</legend>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {MODES.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-[var(--ink)]"
                checked={p.allowedModes.includes(m.id)}
                onChange={(e) => set("allowedModes", e.target.checked ? [...p.allowedModes, m.id] : p.allowedModes.filter((x) => x !== m.id))}
              />
              <span><span className="font-semibold">{m.name}</span> <span className="text-muted">· {m.blurb}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary">Save course settings</button>
        <span className="text-sm text-muted" role="status">{status}</span>
      </div>
    </form>
  );
}

function Insights({ course }: { course: Course }) {
  const states = useStore((s) => s.topicState);
  const rows = course.topics
    .map((t) => ({ t, s: states[t.id] }))
    .filter((r): r is { t: Course["topics"][number]; s: TopicState } => Boolean(r.s?.attempts))
    .sort((a, b) => a.s.mastery - b.s.mastery);
  const gap = calibrationGap(rows.map((r) => r.s));

  return (
    <div className="card p-5">
      <h2 className="font-bold">Where students struggle</h2>
      <p className="mt-1 text-xs text-muted">Prototype: this shows only the practice data stored in this browser. A class view needs accounts and student consent.</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No practice data yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.slice(0, 6).map(({ t, s }) => (
            <li key={t.id}>
              <div className="mb-1 flex justify-between gap-2 text-sm">
                <span className="truncate">{t.title}</span>
                <span className="shrink-0 text-muted">{pct(s.mastery)} · {s.correct}/{s.attempts} right</span>
              </div>
              <Bar value={s.mastery} label={`${t.title} mastery`} tone={s.mastery < 0.5 ? "honey" : "leaf"} />
            </li>
          ))}
        </ul>
      )}
      {gap !== null && (
        <p className="mt-4 text-sm">
          Confidence vs results: <strong>{gap > 0 ? "+" : ""}{Math.round(gap * 100)} points</strong>{" "}
          <span className="text-muted">({gap > 0.1 ? "overconfident" : gap < -0.1 ? "underconfident" : "well calibrated"})</span>
        </p>
      )}
    </div>
  );
}

export default function TeachPage() {
  const hydrated = useHydrated();
  const courses = useStore((s) => s.courses);
  const active = useStore((s) => s.activeCourseId);
  const list = Object.values(courses);
  const [picked, setPicked] = useState<string | null>(null);
  const course = courses[picked ?? active ?? ""] ?? list[0];

  if (!hydrated) return <p className="text-sm text-muted">Loading…</p>;
  if (!course) {
    return (
      <Empty title="Instructor settings">
        <p>Add or load a course first, then set how Hive teaches it.</p>
        <Link href="/" className="btn btn-primary mt-4">Go to courses</Link>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Instructor settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Decide how the tutor behaves in your course. Students see the help level in the tutor panel and cannot change it.</p>
        </div>
        {list.length > 1 && (
          <div>
            <label className="label" htmlFor="course">Course</label>
            <select id="course" className="field" value={course.id} onChange={(e) => setPicked(e.target.value)}>
              {list.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}
            </select>
          </div>
        )}
      </header>
      <Notice>Prototype: there are no accounts yet, so anyone using this browser can change these settings. In the real product this page is limited to the verified instructor of the section.</Notice>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <PolicyForm key={course.id} course={course} />
        <Insights course={course} />
      </div>
    </div>
  );
}
