"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bar, Notice } from "@/components/ui";
import { CATALOG } from "@/lib/catalog";
import { pct, postJSON, useAiStatus } from "@/lib/client";
import { buildDemoCourse } from "@/lib/demo-course";
import { courseReadiness, daysUntil, examReadiness, isDue, nextExam } from "@/lib/mastery";
import { actions, useHydrated, useStore } from "@/lib/store";
import type { Course } from "@/lib/types";

const MAX_PDF = 10 * 1024 * 1024;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });
}

function AddCourse({ aiOn, onDone }: { aiOn: boolean | null; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [syllabus, setSyllabus] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const match = CATALOG.find((c) => `${c.code} ${c.title}`.toLowerCase() === code.trim().toLowerCase() || c.code.toLowerCase() === code.trim().toLowerCase());
    if (file && file.size > MAX_PDF) return setError("That PDF is over 10 MB. Paste the syllabus text instead.");
    setBusy(true);
    try {
      const pdfBase64 = file ? await readBase64(file) : undefined;
      const { course } = await postJSON<{ course: Course }>("/api/course", {
        code: match?.code ?? code.trim(),
        title: match?.title,
        syllabus,
        pdfBase64,
      });
      actions.addCourse(course);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the course.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-bold">Add a course</h2>
        <p className="mt-1 text-sm text-muted">Hive reads your syllabus and builds the topics, prerequisites and exam schedule from it.</p>
      </div>
      <div>
        <label className="label" htmlFor="code">Course</label>
        <input id="code" list="catalog" className="field" placeholder="CS 1332" value={code} onChange={(e) => setCode(e.target.value)} required />
        <datalist id="catalog">
          {CATALOG.map((c) => <option key={c.code} value={`${c.code} ${c.title}`} />)}
        </datalist>
      </div>
      <div>
        <label className="label" htmlFor="syllabus">Syllabus text</label>
        <textarea id="syllabus" className="field min-h-36" placeholder="Paste the syllabus from Canvas here, including the schedule and exam dates." value={syllabus} onChange={(e) => setSyllabus(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="pdf">Or upload it as a PDF</label>
        <input id="pdf" type="file" accept="application/pdf" className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <p className="mt-1.5 text-xs text-muted">Your syllabus is sent to the AI model to build the plan and is stored only in this browser. With no syllabus, Hive uses the standard outline for the course and leaves exam dates blank.</p>
      </div>
      {aiOn === false && <Notice>Building a course from a syllabus needs an Anthropic API key. Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart the dev server, or try the demo course.</Notice>}
      {error && <Notice tone="rose">{error}</Notice>}
      <button type="submit" className="btn btn-honey" disabled={busy || !code.trim() || aiOn !== true}>
        {busy ? "Reading the syllabus… about a minute" : "Build my study plan"}
      </button>
    </form>
  );
}

function CourseCard({ course }: { course: Course }) {
  const router = useRouter();
  const states = useStore((s) => s.topicState);
  const exam = nextExam(course);
  const days = exam ? daysUntil(exam.date) : null;
  const due = course.topics.filter((t) => isDue(states[t.id])).length;
  const ready = exam ? examReadiness(course, exam, states) : courseReadiness(course, states);
  return (
    <div className="card flex flex-col gap-3 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-honey-deep">{course.code}{course.source === "demo" ? " · demo" : ""}</p>
        <h3 className="text-lg font-bold leading-snug">{course.title}</h3>
        <p className="text-sm text-muted">{[course.instructor, course.term].filter(Boolean).join(" · ") || `${course.topics.length} topics`}</p>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>{exam ? `Ready for ${exam.title}` : "Course progress"}</span>
          <span className="font-semibold text-ink">{pct(ready)}</span>
        </div>
        <Bar value={ready} label="Readiness" />
      </div>
      <p className="text-sm">
        {exam && days !== null ? <><strong>{exam.title}</strong> in {days} day{days === 1 ? "" : "s"}</> : "No upcoming exam on file"}
        {due > 0 && <> · <strong>{due}</strong> to review</>}
      </p>
      <div className="mt-auto flex gap-2">
        <button type="button" className="btn btn-primary flex-1" onClick={() => { actions.open(course.id); router.push("/course"); }}>Open study plan</button>
        <button type="button" className="btn" aria-label={`Remove ${course.code}`} onClick={() => { if (window.confirm(`Remove ${course.code} and its progress from this browser?`)) actions.removeCourse(course.id); }}>Remove</button>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const hydrated = useHydrated();
  const aiOn = useAiStatus();
  const courses = useStore((s) => s.courses);
  const list = Object.values(courses).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const hasDemo = Boolean(courses["demo-cs1332"]);

  function loadDemo() {
    const d = buildDemoCourse();
    actions.addCourse(d.course, d.questions, d.lessons);
    router.push("/course");
  }

  if (!hydrated) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-8">
      {list.length === 0 ? (
        <section className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Study the course you are actually taking.</h1>
          <p className="mt-3 text-muted">
            Give Hive your syllabus. It maps the topics and exam dates, teaches each topic in the format you pick, makes you try before it explains, and brings things back for review before you forget them. Built for Georgia Tech courses.
          </p>
        </section>
      ) : (
        <section>
          <h1 className="text-2xl font-bold tracking-tight">Your courses</h1>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => <CourseCard key={c.id} course={c} />)}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <AddCourse aiOn={aiOn} onDone={() => router.push("/course")} />
        <div className="space-y-4">
          {!hasDemo && (
            <div className="card p-5">
              <h2 className="font-bold">Try it first</h2>
              <p className="mt-1 text-sm text-muted">A sample CS 1332 course with four ready topics. Works without an API key.</p>
              <button type="button" className="btn btn-primary mt-3 w-full" onClick={loadDemo}>Load the demo course</button>
            </div>
          )}
          <div className="card p-5 text-sm">
            <h2 className="font-bold">How a session works</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted">
              <li><span className="text-ink">Try first.</span> One question before any teaching.</li>
              <li><span className="text-ink">Learn.</span> Pick the format: worked example, question-led, picture, derivation or recap.</li>
              <li><span className="text-ink">Practice.</span> Rate your confidence, then see how you did.</li>
              <li><span className="text-ink">Teach it back</span> in your own words.</li>
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
