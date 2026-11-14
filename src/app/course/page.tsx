"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, Empty, Loading, Notice } from "@/components/ui";
import { formatDay, pct, useAiStatus } from "@/lib/client";
import { CALIBRATION_NOTICE, calibrationGap, daysUntil, examReadiness, inDays, isDue, readiness, upNext, weakPrereqs } from "@/lib/mastery";
import { actions, useHydrated, useStore } from "@/lib/store";
import type { Topic, TopicState } from "@/lib/types";

function status(s: TopicState | undefined): { label: string; cls: string } {
  if (!s || s.attempts === 0) return { label: "New", cls: "bg-line text-muted" };
  if (isDue(s)) return { label: "Review due", cls: "bg-honey text-ink" };
  if (s.mastery >= 0.8) return { label: "Strong", cls: "bg-leaf-soft text-leaf" };
  return { label: "Learning", cls: "bg-honey-soft text-honey-deep" };
}

export default function CoursePage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const aiOn = useAiStatus();
  const course = useStore((s) => (s.activeCourseId ? s.courses[s.activeCourseId] : undefined) ?? Object.values(s.courses)[0]);
  const states = useStore((s) => s.topicState);
  const pools = useStore((s) => s.questions);

  if (!hydrated) return <Loading />;
  if (!course) {
    return (
      <Empty title="No course yet">
        <p>Add a course, or load the sample.</p>
        <Link href="/" className="btn btn-honey mt-4">Go to courses</Link>
      </Empty>
    );
  }

  const start = (t: Topic) => {
    actions.open(course.id, t.id);
    router.push("/learn");
  };
  // A topic can be studied when the AI can write for it or it has ready-made questions.
  const usable = (t: Topic) => aiOn === true || Boolean(pools[t.id]?.length);
  const startLabel = (t: Topic) => (states[t.id]?.attempts ? "Continue" : "Start");
  const suggestions = upNext(course, states, 3);
  const gap = calibrationGap(course.topics.map((t) => states[t.id]).filter((s): s is TopicState => Boolean(s)));
  const locked = <span className="tag justify-self-start bg-line text-muted">Locked</span>;

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow">{course.code}{course.basis === "demo" ? " · sample" : ""}</p>
        <h1 className="title mt-1">{course.title}</h1>
        <p className="mt-1.5 text-sm text-muted">{[course.instructor, course.term, `${course.topics.length} topics`].filter(Boolean).join(" · ")}</p>
      </header>

      {aiOn === false && course.basis === "demo" && (
        <Notice>Four sample topics have ready-made lessons and questions: Big-O, binary search trees, heaps and HashMaps. The rest are locked, and the tutor is off, until an OpenAI API key is set.</Notice>
      )}

      {course.basis === "web" && (
        <Notice>
          Built from public web pages, not your syllabus, so topics and dates may be from an earlier term.
          {course.sources.length > 0 && (
            <> Sources: {course.sources.map((s, i) => (
              <span key={s.url}>{i > 0 && ", "}<a className="underline underline-offset-2" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></span>
            ))}.</>
          )}
        </Notice>
      )}

      {course.exams.length > 0 && (
        <section aria-labelledby="exams">
          <h2 id="exams" className="eyebrow">Exams</h2>
          <div className="panel mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {course.exams.map((e) => {
              const d = daysUntil(e.date);
              const past = d !== null && d < 0;
              const r = examReadiness(course, e, states);
              return (
                <div key={e.id} className="card p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="card-title">{e.title}</h3>
                    <span className="text-sm tabular-nums text-muted">{d === null ? "No date" : past ? "Done" : inDays(d)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {e.date ? formatDay(e.date) : "Date not in syllabus"}{e.weightPct ? ` · ${e.weightPct}% of grade` : ""}
                  </p>
                  {!past && (
                    <div className="mt-3">
                      <div className="mb-1.5 flex justify-between text-sm"><span className="text-muted">Readiness</span><span className="font-medium tabular-nums">{pct(r)}</span></div>
                      <Bar value={r} label={`${e.title} readiness`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="next">
        <h2 id="next" className="eyebrow">Up next</h2>
        {suggestions.length === 0 ? (
          <p className="mt-3 text-sm">Everything is strong and nothing is due. Come back when reviews come up.</p>
        ) : (
          <div className="panel mt-3 grid gap-3 lg:grid-cols-3">
            {suggestions.map(({ topic, reason }, i) => (
              <div key={topic.id} className={`card flex flex-col gap-2 p-4 ${i === 0 ? "border-honey-edge ring-1 ring-honey-ledge" : ""}`}>
                <p className="eyebrow">{reason}</p>
                <h3 className="card-title">{topic.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{topic.summary}</p>
                <div className="mt-auto pt-2">
                  {usable(topic) ? (
                    <button type="button" className={`btn w-full ${i === 0 ? "btn-honey" : ""}`} onClick={() => start(topic)}>{startLabel(topic)}</button>
                  ) : locked}
                </div>
              </div>
            ))}
          </div>
        )}
        {gap !== null && Math.abs(gap) >= CALIBRATION_NOTICE && (
          <p className="mt-3 text-sm text-muted">
            {gap > 0
              ? `Calibration: you rate yourself about ${Math.round(gap * 100)} points more confident than your results. Trust the review queue over the feeling of knowing it.`
              : `Calibration: your results are about ${Math.round(-gap * 100)} points better than your confidence suggests.`}
          </p>
        )}
      </section>

      <section aria-labelledby="map">
        <h2 id="map" className="eyebrow">All topics</h2>
        <div className="panel mt-3 space-y-3">
          {course.units.map((u) => {
            const topics = course.topics.filter((t) => t.unitId === u.id);
            if (!topics.length) return null;
            return (
              <div key={u.id} className="card overflow-hidden">
                <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
                  <h3 className="card-title">{u.title}</h3>
                  {u.when && <span className="text-sm text-muted">{u.when}</span>}
                </div>
                <ul>
                  {topics.map((t) => {
                    const s = states[t.id];
                    const st = status(s);
                    const weak = weakPrereqs(course, t, states);
                    const r = readiness(s);
                    return (
                      <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-b-0">
                        <div className="min-w-0 flex-1 basis-64">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{t.title}</span>
                            <span className={`tag ${st.cls}`}>{st.label}</span>
                            {t.weight >= 3 && <span className="text-xs text-muted">Heavily tested</span>}
                          </div>
                          {weak.length > 0 && <p className="mt-0.5 text-sm text-muted">Builds on: {weak.map((p) => p.title).join(", ")}</p>}
                        </div>
                        <div className="grid w-full grid-cols-[1fr_2.5rem_5.5rem] items-center gap-3 sm:w-64">
                          <Bar value={r} label={`${t.title} mastery`} />
                          <span className="text-right text-sm tabular-nums text-muted">{pct(r)}</span>
                          {usable(t) ? (
                            <button type="button" className="btn btn-sm w-full translate-y-0.5" onClick={() => start(t)} aria-label={`${startLabel(t)} ${t.title}`}>{startLabel(t)}</button>
                          ) : locked}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {(course.aiPolicy || course.grading.length > 0) && (
        <section aria-labelledby="syllabus">
          <h2 id="syllabus" className="eyebrow">From the syllabus</h2>
          <div className="panel mt-3 grid gap-3 md:grid-cols-2">
            {course.aiPolicy && (
              <div className="card p-4 text-sm leading-relaxed">
                <h3 className="card-title">What it says about AI</h3>
                <p className="mt-1 text-muted">{course.aiPolicy}</p>
                <p className="hint mt-2">A summary. Check the original before relying on it.</p>
              </div>
            )}
            {course.grading.length > 0 && (
              <div className="card p-4 text-sm">
                <h3 className="card-title">Grade breakdown</h3>
                <ul className="mt-1 text-muted">
                  {course.grading.map((g, i) => <li key={i} className="flex justify-between py-0.5"><span>{g.name}</span><span className="tabular-nums">{g.pct}%</span></li>)}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
