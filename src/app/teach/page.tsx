"use client";

import Link from "next/link";
import { RequireUser } from "@/components/RequireUser";
import { useEffect, useState } from "react";
import { Bar, Empty, Loading, Notice } from "@/components/ui";
import { useUser } from "@/lib/auth";
import { errorText, getJSON, HttpError, pct, postJSON, sendJSON } from "@/lib/client";
import { MODES } from "@/lib/modes";
import { bundleOf, getState, useStore } from "@/lib/store";
import { HELP_LEVELS, type ClassInsights, type ClassSummary, type InstructorPolicy } from "@/lib/types";

const fetchClasses = () => getJSON<{ classes: ClassSummary[] }>("/api/classes").then((r) => r.classes);

function PolicyForm({ cls, onSaved }: { cls: ClassSummary; onSaved: () => void }) {
  const [p, setP] = useState<InstructorPolicy>(cls.policy);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof InstructorPolicy>(k: K, v: InstructorPolicy[K]) => {
    setP((x) => ({ ...x, [k]: v }));
    setStatus("");
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!p.allowedModes.length) return setStatus("Allow at least one explanation format.");
    setBusy(true);
    try {
      await sendJSON("PUT", "/api/classes/policy", { id: cls.id, policy: p });
      setStatus("Saved. It applies to every student in the class from their next message.");
      onSaved();
    } catch (err) {
      setStatus(errorText(err, "Could not save."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card space-y-7 p-5 sm:p-6" onSubmit={save}>
      <fieldset>
        <legend className="card-title">How much help may the tutor give?</legend>
        <div className="mt-3 grid gap-2">
          {HELP_LEVELS.map((l) => (
            <label key={l.id} className={`flex cursor-pointer items-start gap-3 rounded-[10px] border p-3 ${p.helpLevel === l.id ? "border-ink bg-honey-soft" : "border-line-strong"}`}>
              <input type="radio" name="help" className="check mt-0.5" checked={p.helpLevel === l.id} onChange={() => set("helpLevel", l.id)} />
              <span>
                <span className="block text-sm font-semibold">{l.name}</span>
                <span className="block text-sm leading-relaxed text-muted">{l.detail}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="mt-2 flex cursor-pointer items-start gap-3 py-2 text-sm">
          <input type="checkbox" className="check" checked={p.attemptFirst} onChange={(e) => set("attemptFirst", e.target.checked)} />
          <span>Ask students what they tried before helping</span>
        </label>
      </fieldset>

      <div>
        <label className="label" htmlFor="off">Graded work the tutor must not help solve</label>
        <textarea id="off" className="field min-h-20" placeholder="Homework 1 through 10, the LinkedList and AVL coding assignments" value={p.offLimits} onChange={(e) => set("offLimits", e.target.value)} />
        <p className="hint mt-1.5">The tutor will explain the concept with a different example and say it cannot work on the graded item.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="emph">What you emphasize</label>
          <textarea id="emph" className="field min-h-24" placeholder="Tracing by hand, edge cases, justifying Big-O" value={p.emphasis} onChange={(e) => set("emphasis", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="not">Notation and conventions</label>
          <textarea id="not" className="field min-h-24" placeholder="Heaps are 1-indexed. Remove from a BST uses the successor." value={p.notation} onChange={(e) => set("notation", e.target.value)} />
        </div>
      </div>

      <fieldset>
        <legend className="card-title">Explanation formats students can choose</legend>
        <div className="mt-2 grid sm:grid-cols-2 sm:gap-x-4">
          {MODES.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-start gap-3 py-2 text-sm">
              <input type="checkbox" className="check" checked={p.allowedModes.includes(m.id)} onChange={(e) => set("allowedModes", e.target.checked ? [...p.allowedModes, m.id] : p.allowedModes.filter((x) => x !== m.id))} />
              <span><span className="font-semibold">{m.name}</span><span className="block leading-relaxed text-muted">{m.blurb}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>Save tutor rules</button>
        <span className="text-sm text-muted" role="status">{status}</span>
      </div>
    </form>
  );
}

function Insights({ classId }: { classId: string }) {
  const [data, setData] = useState<ClassInsights | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const ctrl = new AbortController();
    getJSON<ClassInsights>(`/api/classes/insights?id=${encodeURIComponent(classId)}`, ctrl.signal)
      .then(setData)
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(errorText(e, "Could not load class progress."));
      });
    return () => ctrl.abort();
  }, [classId]);

  return (
    <div className="card min-w-0 p-5 sm:p-6">
      <h2 className="card-title">Where the class is struggling</h2>
      <p className="hint mt-1">Class averages by topic. A topic appears once {data?.minStudents ?? 3} students have practiced it, so no number points to one person.</p>
      {error ? (
        <div className="mt-3"><Notice tone="rose">{error}</Notice></div>
      ) : !data ? (
        <div className="mt-3"><Loading /></div>
      ) : data.topics.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {data.students === 0
            ? "No students have joined yet. Share the class code."
            : `${data.active} of ${data.students} student${data.students === 1 ? " has" : "s have"} practiced. No topic has reached ${data.minStudents} students yet.`}
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm"><span className="font-semibold tabular-nums">{data.active}</span> of <span className="tabular-nums">{data.students}</span> students have practiced.</p>
          <ul className="mt-4 space-y-4">
            {data.topics.slice(0, 8).map((t) => {
              const weak = t.mastery < 0.5;
              return (
                <li key={t.topicId}>
                  <div className="mb-1.5 flex justify-between gap-2 text-sm">
                    <span className="truncate">{t.title}</span>
                    <span className="shrink-0 tabular-nums text-muted">{weak ? "Needs work · " : ""}{pct(t.mastery)} · {t.students} students</span>
                  </div>
                  <Bar value={t.mastery} label={`${t.title} average mastery`} />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function Classes() {
  const courses = useStore((s) => s.courses);
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  // Courses joined from someone else's class are theirs to publish, not this account's.
  const own = Object.values(courses).filter((c) => !c.classId);

  useEffect(() => {
    let live = true;
    fetchClasses()
      .then((list) => live && setClasses(list))
      .catch((e) => {
        if (!live) return;
        setError(errorText(e, "Could not load your classes."));
        setClasses([]);
      });
    return () => {
      live = false;
    };
  }, []);
  const refresh = async () => setClasses(await fetchClasses());

  async function publish(courseId: string) {
    const bundle = bundleOf(getState(), courseId);
    if (!bundle) return;
    setError("");
    setBusy(courseId);
    try {
      const { class: cls } = await postJSON<{ class: ClassSummary }>("/api/classes", bundle);
      setPicked(cls.id);
      await refresh();
    } catch (e) {
      // A validation message is worth showing; a bare status code is not.
      setError(e instanceof HttpError && e.status < 500 ? e.message : "Could not publish this course. Try again.");
    } finally {
      setBusy("");
    }
  }

  if (classes === null) return <Loading />;
  const current = classes.find((c) => c.id === picked) ?? classes[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="title">Classes</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">Publishing gives you a class code. Students who join get your course, its lessons and questions, and the tutor follows the rules you set here.</p>
      </header>
      {error && <Notice tone="rose">{error}</Notice>}

      <section className="card divide-y divide-line">
        {own.length === 0 ? (
          <div className="p-5 text-sm text-muted">
            You have no courses yet. <Link href="/" className="underline underline-offset-2">Add one</Link>, shape its lessons in the <Link href="/studio" className="underline underline-offset-2">Studio</Link>, then publish it here.
          </div>
        ) : (
          own.map((c) => {
            const cls = classes.find((x) => x.courseId === c.id);
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-5">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-medium">{c.code} {c.title}</p>
                  <p className="text-sm text-muted">
                    {cls ? <>Class code <span className="font-mono font-semibold text-ink">{cls.code}</span> · <span className="tabular-nums">{cls.students}</span> student{cls.students === 1 ? "" : "s"}</> : "Not published"}
                  </p>
                </div>
                {cls && <button type="button" className="btn btn-sm" aria-pressed={current?.id === cls.id} onClick={() => setPicked(cls.id)}>Manage</button>}
                <button type="button" className={`btn btn-sm ${cls ? "" : "btn-primary"}`} disabled={busy === c.id} onClick={() => void publish(c.id)}>
                  {busy === c.id ? "Publishing…" : cls ? "Update for students" : "Publish"}
                </button>
              </div>
            );
          })
        )}
      </section>

      {current && (
        <section className="space-y-4" aria-labelledby="manage">
          <h2 id="manage" className="heading">{current.title}</h2>
          <Notice>New students joining with <span className="font-mono font-semibold">{current.code}</span> get the latest published version. Students who already joined keep their version until they enter the code again.</Notice>
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <PolicyForm key={current.id} cls={current} onSaved={() => void refresh()} />
            <Insights key={current.id} classId={current.id} />
          </div>
        </section>
      )}
    </div>
  );
}

function TeachScreen() {
  const user = useUser();
  if (user.role !== "instructor") {
    return (
      <Empty title="Classes are for instructor accounts">
        <p>Instructors publish a course and share a class code. To join a class, enter its code on the Courses page.</p>
        <Link href="/" className="btn btn-primary mt-4">Go to courses</Link>
      </Empty>
    );
  }
  return <Classes />;
}

export default function TeachPage() {
  return (
    <RequireUser>
      <TeachScreen />
    </RequireUser>
  );
}
