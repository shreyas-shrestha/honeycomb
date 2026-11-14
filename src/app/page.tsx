"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthCard } from "@/components/AuthCard";
import { ExperiencePlayer } from "@/components/ExperiencePlayer";
import { Bar, Loading, Notice } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { errorText, getJSON, pct, postJSON, useAiStatus } from "@/lib/client";
import { buildDemoCourse, DEMO_ID } from "@/lib/demo-course";
import { demoExperiences } from "@/lib/demo-experiences";
import { courseReadiness, daysUntil, examReadiness, inDays, isDue, nextExam } from "@/lib/mastery";
import type { CatalogCourse } from "@/lib/server/catalog";
import { actions, useStore } from "@/lib/store";
import type { ClassBundle, Course } from "@/lib/types";

const MAX_PDF = 10 * 1024 * 1024;
const POPULAR = ["CS 1332", "MATH 1554", "PHYS 2212", "CS 2110", "CHEM 1310"];
const LANDING_LESSON = demoExperiences((k) => k, "")["heaps"].blocks;

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
      <div className="rounded-[10px] border border-line bg-paper p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">{picked.code} · {picked.term}{picked.credits ? ` · ${picked.credits} credits` : ""}</p>
            <p className="card-title mt-1">{picked.title}</p>
          </div>
          <button type="button" className="link shrink-0" onClick={() => onPick(null)}>Change</button>
        </div>
        {picked.description && <p className="mt-2 text-sm leading-relaxed text-muted">{picked.description}</p>}
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {picked.prereqs && (<><dt className="text-muted">Prerequisites</dt><dd>{picked.prereqs}</dd></>)}
          {picked.instructors.length > 0 && (<><dt className="text-muted">Taught by</dt><dd>{picked.instructors.join(", ")}</dd></>)}
        </dl>
      </div>
    );
  }

  return (
    <div>
      <label className="label" htmlFor="course-search">Find your course</label>
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
              <button type="button" className="flex min-h-[2.75rem] w-full items-baseline gap-3 rounded-[10px] px-3 py-2.5 text-left hover:bg-panel focus-visible:bg-panel" onClick={() => onPick(c)}>
                <span className="w-24 shrink-0 text-sm font-semibold">{c.code}</span>
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
      actions.addCourse({ course });
      onDone();
    } catch (err) {
      setError(errorText(err, "Could not build the study plan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="heading">Build a course from your syllabus</h2>
        <p className="mt-1 text-sm text-muted">Honeycomb lists the topics and exam dates, then writes a lesson and practice questions for each topic.</p>
      </div>
      <CoursePicker picked={picked} onPick={setPicked} />
      {picked && (
        <>
          <div>
            <label className="label" htmlFor="syllabus">Syllabus <span className="font-normal text-muted">· optional, but it gets you the real exam dates</span></label>
            <textarea id="syllabus" className="field min-h-32" placeholder="Paste the syllabus from Canvas, including the schedule." value={syllabus} onChange={(e) => setSyllabus(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pdf">Or upload the PDF</label>
            <input id="pdf" type="file" accept="application/pdf" className="block w-full text-sm text-muted file:mr-3 file:min-h-[2.75rem] file:rounded-full file:border file:border-line-strong file:bg-surface file:px-4 file:text-sm file:font-semibold file:text-ink" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <p className="hint">
            {hasSyllabus
              ? "Your syllabus is sent to the AI model to build the study plan and is saved to your account."
              : "With no syllabus, Honeycomb searches the web for this course's public syllabus and builds the study plan from what it finds. Exam dates may be missing."}
          </p>
          {aiOn === false && <Notice>Building a study plan from a syllabus needs AI, which is off on this site. The sample course works without it.</Notice>}
          {error && <Notice tone="rose">{error}</Notice>}
          <button type="submit" className={`btn w-full sm:w-auto ${aiOn ? "btn-primary" : ""}`} disabled={busy || aiOn !== true}>
            {busy ? (hasSyllabus ? "Reading the syllabus…" : "Searching the web…") : "Build my study plan"}
          </button>
        </>
      )}
    </form>
  );
}

function JoinClass({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { bundle } = await postJSON<{ bundle: ClassBundle }>("/api/classes/join", { code });
      actions.addCourse(bundle);
      onDone();
    } catch (err) {
      setError(errorText(err, "Could not join that class."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5 sm:p-6">
      <div>
        <h2 className="heading">Join your instructor’s class</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">You get their course and lessons. They see class averages by topic, never your individual answers.</p>
      </div>
      <label className="sr-only" htmlFor="class-code">Class code</label>
      <div className="flex gap-2">
        <input id="class-code" className="field font-mono uppercase" placeholder="HC-7Q2KXM" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
        <button type="submit" className="btn" disabled={busy || code.trim().length < 4}>Join</button>
      </div>
      {error && <Notice tone="rose">{error}</Notice>}
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
        <p className="eyebrow">{course.code}{course.basis === "demo" ? " · sample" : ""}{course.classCode ? ` · class ${course.classCode}` : ""}</p>
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
        <button type="button" className="btn btn-primary" onClick={() => { actions.open(course.id); router.push("/course"); }}>Open study plan</button>
        <button type="button" className="link" onClick={() => { if (window.confirm(`Remove ${course.code} and your progress in it?`)) actions.removeCourse(course.id); }}>Remove<span className="sr-only"> {course.code}</span></button>
      </div>
    </div>
  );
}

function Landing() {
  const [played, setPlayed] = useState(0);
  return (
    <div className="space-y-16 pt-4 sm:pt-8">
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <div>
          <h1 className="display">Study for your Georgia Tech exams from your own syllabus</h1>
          <p className="lede mt-5 max-w-xl">
            Paste your syllabus and Honeycomb lists the topics and exam dates, then gives you a lesson and practice questions for each topic. The tutor gives hints before it gives answers.
          </p>
          <a href="#try" className="link mt-4">Or try a lesson first ↓</a>
        </div>
        <AuthCard />
      </section>

      <section aria-labelledby="try" className="mx-auto max-w-2xl scroll-mt-6">
        <h2 id="try" className="title">Try a lesson: binary heaps</h2>
        <p className="mt-2 text-muted">This is the binary heaps lesson from the sample CS 1332 course. You can do it without an account.</p>
        <div className="mt-6">
          <ExperiencePlayer
            key={played}
            blocks={LANDING_LESSON}
            finishLabel="Create your account"
            onFinish={() => {
              const name = document.getElementById("auth-name");
              name?.scrollIntoView({ block: "center", behavior: "smooth" });
              name?.focus({ preventScroll: true });
            }}
            onRestart={() => setPlayed((n) => n + 1)}
          />
        </div>
        <p className="mt-8 leading-relaxed text-muted">
          The sample course has four lessons like this one. When you add your own course, Honeycomb reads the syllabus, lists the topics and exam dates, and writes a lesson and practice questions for each topic. Topics you’ve studied come back in Review.
        </p>
      </section>

    </div>
  );
}

function Dashboard() {
  const router = useRouter();
  const aiOn = useAiStatus();
  const { user } = useAuth();
  const courses = useStore((s) => s.courses);
  const list = Object.values(courses).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const toPlan = () => router.push("/course");

  return (
    <div className="space-y-10">
      <section>
        <h1 className="title">{list.length ? "Your courses" : `Welcome, ${user?.name.split(" ")[0] ?? "there"}`}</h1>
        {list.length === 0 ? (
          <p className="lede mt-2 max-w-2xl">Add your first course below. To look around first, load the sample.</p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => <CourseCard key={c.id} course={c} />)}
          </div>
        )}
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <AddCourse aiOn={aiOn} onDone={toPlan} />
        <div className={`flex flex-col gap-4 ${list.length === 0 ? "max-lg:order-first" : ""}`}>
          {!courses[DEMO_ID] && (
            <div className={`card space-y-3 p-5 sm:p-6 ${list.length === 0 ? "" : "order-last"}`}>
              <div>
                <h2 className="heading">Sample course</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">CS 1332 with four finished topics: interactive lessons, practice and review.</p>
              </div>
              {/* With no courses yet, this is the quickest way in, so it is the primary action. */}
              <button type="button" className={`btn w-full ${list.length === 0 ? "btn-primary" : ""}`} onClick={() => { actions.addCourse(buildDemoCourse()); toPlan(); }}>Load the sample</button>
            </div>
          )}
          <JoinClass onDone={toPlan} />
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  if (user === undefined) return <Loading />;
  return user ? <Dashboard /> : <Landing />;
}
