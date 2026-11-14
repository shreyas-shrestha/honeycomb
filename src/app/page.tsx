"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Shell";
import { Bar, KeyHelp, Loading, Notice } from "@/components/ui";
import { errorText, getJSON, pct, postJSON, useAiStatus } from "@/lib/client";
import { buildDemoCourse, DEMO_ID } from "@/lib/demo-course";
import { courseReadiness, daysUntil, examReadiness, inDays, isDue, nextExam } from "@/lib/mastery";
import type { CatalogCourse } from "@/lib/server/catalog";
import { actions, useHydrated, useStore } from "@/lib/store";
import type { Course } from "@/lib/types";

const MAX_PDF = 10 * 1024 * 1024;
const POPULAR = ["CS 1332", "MATH 1554", "PHYS 2212", "CS 2110", "CHEM 1310"];

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });
}

// Live search over the public Georgia Tech course catalog.
function useCatalogSearch(query: string) {
  const [state, setState] = useState<{ q: string; courses: CatalogCourse[]; error: string }>({ q: "", courses: [], error: "" });
  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      getJSON<{ courses: CatalogCourse[] }>(`/api/catalog?q=${encodeURIComponent(q)}`, ctrl.signal)
        .then((j) => setState({ q, courses: j.courses, error: "" }))
        .catch((e) => {
          if (!ctrl.signal.aborted) setState({ q, courses: [], error: errorText(e, "Could not reach the course catalog.") });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);
  const current = state.q === q && q.length >= 2;
  return { courses: current ? state.courses : [], error: current ? state.error : "", searched: current };
}

function CoursePicker({ picked, onPick }: { picked: CatalogCourse | null; onPick: (c: CatalogCourse | null) => void }) {
  const [query, setQuery] = useState("");
  const { courses, error, searched } = useCatalogSearch(query);

  if (picked) {
    return (
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">{picked.code} · {picked.term}{picked.credits ? ` · ${picked.credits} credits` : ""}</p>
            <p className="card-title mt-1">{picked.title}</p>
          </div>
          <button type="button" className="link shrink-0" onClick={() => onPick(null)}>Change</button>
        </div>
        {picked.description && <p className="mt-2 text-sm leading-relaxed text-muted">{picked.description}</p>}
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {picked.prereqs && (<><dt className="text-faint">Prerequisites</dt><dd>{picked.prereqs}</dd></>)}
          {picked.instructors.length > 0 && (<><dt className="text-faint">Taught by</dt><dd>{picked.instructors.join(", ")}</dd></>)}
        </dl>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <label className="label" htmlFor="course-search">Which course?</label>
      <input id="course-search" className="field" placeholder="CS 1332 or linear algebra" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
      {query.trim().length < 2 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {POPULAR.map((p) => (
            <button key={p} type="button" className="chip" onClick={() => setQuery(p)}>{p}</button>
          ))}
        </div>
      )}
      {error && <p className="hint mt-2" role="status">{error}</p>}
      {searched && !error && courses.length === 0 && <p className="hint mt-2" role="status">No course matches that. Check the code, or try part of the name.</p>}
      {courses.length > 0 && (
        <ul className="mt-2 grid gap-0.5">
          {courses.map((c) => (
            <li key={c.code}>
              <button type="button" className="flex min-h-[2.75rem] w-full items-baseline gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-panel focus-visible:bg-panel" onClick={() => onPick(c)}>
                <span className="w-24 shrink-0 font-mono text-sm">{c.code}</span>
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddCourse({ aiOn, onDone }: { aiOn: boolean | null; onDone: () => void }) {
  const [picked, setPicked] = useState<CatalogCourse | null>(null);
  const [syllabus, setSyllabus] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasSyllabus = Boolean(syllabus.trim() || file);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setError("");
    if (file && file.size > MAX_PDF) return setError("That PDF is over 10 MB. Paste the syllabus text instead.");
    setBusy(true);
    try {
      const pdfBase64 = file ? await readBase64(file) : undefined;
      const { course } = await postJSON<{ course: Course }>("/api/course", { code: picked.code, syllabus, pdfBase64 });
      actions.addCourse(course);
      onDone();
    } catch (err) {
      setError(errorText(err, "Could not build the study plan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-3">
      <h2 className="heading px-[17px] pt-1">Add a course</h2>
      <CoursePicker picked={picked} onPick={setPicked} />
      {picked && (
        <div className="card space-y-4 p-4">
          <div>
            <label className="label" htmlFor="syllabus">Syllabus <span className="font-normal text-faint">· optional, but it gets you the real exam dates</span></label>
            <textarea id="syllabus" className="field min-h-32" placeholder="Paste the syllabus from Canvas, including the schedule." value={syllabus} onChange={(e) => setSyllabus(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pdf">Or upload the PDF</label>
            <input id="pdf" type="file" accept="application/pdf" className="block w-full text-sm text-muted file:mr-3 file:min-h-[2.75rem] file:rounded-lg file:border file:border-line file:bg-paper file:px-3 file:text-sm file:font-medium file:text-ink" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <p className="hint">
            {hasSyllabus
              ? "Your syllabus is sent to the AI model to build the study plan and is kept only in this browser."
              : "With no syllabus, Honeycomb searches the web for this course's public syllabus and builds the study plan from what it finds. Exam dates may be missing."}
          </p>
          {aiOn === false && <Notice tone="honey">Building a study plan needs an OpenAI API key. <KeyHelp /> Or try the sample course below.</Notice>}
          {error && <Notice tone="rose">{error}</Notice>}
          <button type="submit" className="btn btn-honey w-full sm:w-auto" disabled={busy || aiOn !== true}>
            {busy ? (hasSyllabus ? "Reading the syllabus…" : "Searching the web…") : "Build my study plan"}
          </button>
        </div>
      )}
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
    <div className="card flex flex-col gap-4 p-5">
      <div>
        <p className="eyebrow">{course.code}{course.basis === "demo" ? " · sample" : ""}</p>
        <h3 className="heading mt-1">{course.title}</h3>
        <p className="mt-0.5 text-sm text-muted">{[course.instructor, course.term].filter(Boolean).join(" · ") || `${course.topics.length} topics`}</p>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="text-muted">{exam ? `Readiness for ${exam.title}` : "Course readiness"}</span>
          <span className="font-medium tabular-nums">{pct(ready)}</span>
        </div>
        <Bar value={ready} label="Readiness" />
      </div>
      <p className="text-sm text-muted">
        {exam && days !== null ? <><span className="text-ink">{exam.title}</span> {inDays(days)}</> : "No upcoming exam on file"}
        {due > 0 && <> · <span className="text-ink tabular-nums">{due}</span> to review</>}
      </p>
      <div className="mt-auto flex items-center justify-between gap-3">
        <button type="button" className="btn btn-honey" onClick={() => { actions.open(course.id); router.push("/course"); }}>Open study plan</button>
        <button type="button" className="link" onClick={() => { if (window.confirm(`Remove ${course.code} and its progress from this browser?`)) actions.removeCourse(course.id); }}>Remove<span className="sr-only"> {course.code}</span></button>
      </div>
    </div>
  );
}

const STEPS = [
  { title: "Try first", body: "One question before any teaching. Being wrong here is the point." },
  { title: "Learn", body: "Pick the format: worked example, question-led, picture, derivation or recap." },
  { title: "Practice", body: "Say how sure you are, then find out. Hints come before answers." },
  { title: "Teach it back", body: "Explain it in your own words. That is the real test." },
];

export default function Home() {
  const router = useRouter();
  const hydrated = useHydrated();
  const aiOn = useAiStatus();
  const courses = useStore((s) => s.courses);
  const list = Object.values(courses).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  function loadSample() {
    const d = buildDemoCourse();
    actions.addCourse(d.course, d.questions, d.lessons);
    router.push("/course");
  }

  if (!hydrated) return <Loading />;
  const fresh = list.length === 0;

  return (
    <div className="space-y-12">
      {fresh ? (
        <section className="mx-auto max-w-3xl pt-6 text-center sm:pt-10">
          <div className="mb-5 flex justify-center"><Logo size={44} /></div>
          <p className="eyebrow">Built for Georgia Tech courses</p>
          <h1 className="display mt-3">Study the course you’re actually taking</h1>
          <p className="lede mx-auto mt-5 max-w-xl">
            Pick your class. Honeycomb maps its topics and exams, teaches each one the way you choose, and brings it back before you forget.
          </p>
        </section>
      ) : (
        <section>
          <h1 className="title">Your courses</h1>
          <div className={`panel mt-5 grid max-w-full gap-3 sm:grid-cols-2 lg:grid-cols-3 ${list.length < 3 ? "sm:w-fit sm:grid-flow-col sm:auto-cols-[20rem] sm:grid-cols-none lg:grid-cols-none" : ""}`}>
            {list.map((c) => <CourseCard key={c.id} course={c} />)}
          </div>
        </section>
      )}

      <section className={`mx-auto space-y-4 ${fresh ? "max-w-2xl" : "max-w-3xl"}`}>
        <AddCourse aiOn={aiOn} onDone={() => router.push("/course")} />
        {!courses[DEMO_ID] && (
          <p className="text-center text-sm text-muted">
            Just looking? <button type="button" className="link" onClick={loadSample}>Load a sample CS 1332 course</button>, no key needed.
          </p>
        )}
      </section>

      {fresh && (
        <section aria-labelledby="how" className="mx-auto max-w-5xl">
          <h2 id="how" className="heading text-center">Every session, the same four moves</h2>
          <ol className="panel mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card p-4">
                <p className="eyebrow">Step {i + 1}</p>
                <p className="card-title mt-1">{s.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
