"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HexMap } from "@/components/HexMap";
import { RequireUser } from "@/components/RequireUser";
import { Bar, Empty, Notice } from "@/components/ui";
import { formatDay, pct, useAiStatus } from "@/lib/client";
import { CALIBRATION_NOTICE, calibrationGap, daysUntil, examReadiness, inDays, isDue, readiness, upNext, weakPrereqs } from "@/lib/mastery";
import { actions, useStore } from "@/lib/store";
import type { Topic, TopicState } from "@/lib/types";

function status(s: TopicState | undefined): { label: string; cls: string } {
  if (!s || s.attempts === 0) return { label: "New", cls: "text-muted" };
  if (isDue(s)) return { label: "Review due", cls: "text-honey-deep" };
  if (s.mastery >= 0.8) return { label: "Strong", cls: "text-leaf" };
  return { label: "Learning", cls: "text-honey-deep" };
}

function CourseScreen() {
  const router = useRouter();
  const aiOn = useAiStatus();
  const course = useStore((s) => (s.activeCourseId ? s.courses[s.activeCourseId] : undefined) ?? Object.values(s.courses)[0]);
  const states = useStore((s) => s.topicState);
  const pools = useStore((s) => s.questions);
  const [picked, setPicked] = useState<string | null>(null);

  if (!course) {
    return (
      <Empty title="No course yet">
        <p>Add a course, join a class, or load the sample.</p>
        <Link href="/" className="btn btn-primary mt-4">Go to courses</Link>
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
  const next = upNext(course, states, course.topics.length).find((s) => usable(s.topic));
  const selected = course.topics.find((t) => t.id === picked) ?? next?.topic ?? course.topics[0];
  const gap = calibrationGap(course.topics.map((t) => states[t.id]).filter((s): s is TopicState => Boolean(s)));
  const number = (t: Topic) => course.topics.indexOf(t) + 1;
  const selState = states[selected.id];
  const selWeak = weakPrereqs(course, selected, states);

  return (
    <div className="space-y-12">
      <header>
        <p className="eyebrow">{course.code}{course.basis === "demo" ? " · sample" : ""}{course.classCode ? ` · class ${course.classCode}` : ""}</p>
        <h1 className="title mt-1">{course.title}</h1>
        <p className="mt-1.5 text-sm text-muted">{[course.instructor, course.term, `${course.topics.length} topics`].filter(Boolean).join(" · ")}</p>

        {next ? (
          <div className="mt-7 max-w-2xl">
            <p className="text-sm text-muted">Up next{next.reason === "Heavily tested" || next.reason === "Next in the syllabus" ? "" : ` · ${next.reason.toLowerCase()}`}</p>
            <h2 className="mt-1 text-2xl font-semibold leading-tight">{next.topic.title}</h2>
            <p className="mt-1.5 leading-relaxed text-muted">{next.topic.summary}</p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => start(next.topic)}>{startLabel(next.topic)} this topic</button>
          </div>
        ) : (
          <p className="mt-6 text-muted">Everything available is strong and nothing is due. Come back when reviews come up.</p>
        )}
      </header>

      {aiOn === false && course.basis === "demo" && (
        <Notice>Four sample topics are ready: Big-O, binary search trees, heaps and HashMaps. The other topics and the tutor need AI, which is off on this site.</Notice>
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

      <div className="grid items-start gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="map" className="card p-5 sm:p-6">
          <h2 id="map" className="heading">Course map</h2>
          <p className="mt-1 text-sm text-muted">One cell per topic, in syllabus order. A cell fills with honey as you learn the topic.</p>
          <div className="mt-5">
            <HexMap
              selectedId={selected.id}
              onSelect={setPicked}
              topics={course.topics.map((t) => ({ id: t.id, title: t.title, mastery: readiness(states[t.id]), due: isDue(states[t.id]), locked: !usable(t) }))}
            />
          </div>
          <div className="mt-5 border-t border-line pt-5" aria-live="polite">
            <p className="text-sm text-muted">
              Topic {number(selected)} · <span className={`tag ${status(selState).cls}`}>{status(selState).label}</span>
              {selected.weight >= 3 && " · heavily tested"}
            </p>
            <h3 className="heading mt-1">{selected.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{selected.summary}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {selected.objectives.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
            {selWeak.length > 0 && <p className="mt-3 text-sm text-muted">Builds on: {selWeak.map((p) => p.title).join(", ")}</p>}
            <div className="mt-4 flex items-center gap-3">
              <Bar value={readiness(selState)} label="Readiness" />
              <span className="w-10 text-right text-sm font-semibold tabular-nums">{pct(readiness(selState))}</span>
            </div>
            <div className="mt-4">
              {usable(selected) ? (
                selected.id !== next?.topic.id && <button type="button" className="btn" onClick={() => start(selected)}>{startLabel(selected)} this topic</button>
              ) : (
                <p className="text-sm text-muted">Locked: this topic needs AI, which is off on this site.</p>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="exams" className="ruled">
          <h2 id="exams" className="heading">Exams</h2>
          {course.exams.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No exams on file for this course.</p>
          ) : (
            <ul className="mt-1 divide-y divide-line">
              {course.exams.map((e) => {
                const d = daysUntil(e.date);
                const past = d !== null && d < 0;
                const r = examReadiness(course, e, states);
                return (
                  <li key={e.id} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">{e.title}</span>
                      <span className="text-sm tabular-nums text-muted">{d === null ? "No date" : past ? "Done" : inDays(d)}</span>
                    </div>
                    <p className="text-sm text-muted">{e.date ? formatDay(e.date) : "Date not in syllabus"}{e.weightPct ? ` · ${e.weightPct}% of grade` : ""}</p>
                    {!past && (
                      <div className="mt-2 flex items-center gap-3">
                        <Bar value={r} label={`${e.title} readiness`} />
                        <span className="w-10 text-right text-sm font-semibold tabular-nums">{pct(r)}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {gap !== null && Math.abs(gap) >= CALIBRATION_NOTICE && (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {gap > 0
                ? `Your confidence ratings run about ${Math.round(gap * 100)} points above your results, so do the reviews even when a topic feels finished.`
                : `Your results run about ${Math.round(-gap * 100)} points above your confidence ratings.`}
            </p>
          )}
        </section>
      </div>

      <section aria-labelledby="all" className="ruled">
        <h2 id="all" className="heading">All topics</h2>
        <div className="mt-3 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {course.units.map((u) => {
            const topics = course.topics.filter((t) => t.unitId === u.id);
            if (!topics.length) return null;
            return (
              <div key={u.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="card-title">{u.title}</h3>
                  {u.when && <span className="text-sm text-muted">{u.when}</span>}
                </div>
                <ul className="mt-1">
                  {topics.map((t) => {
                    const st = status(states[t.id]);
                    const on = usable(t);
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          disabled={!on}
                          onClick={() => start(t)}
                          aria-label={on ? undefined : `${t.title}, locked`}
                          className="-mx-2 flex min-h-[2.75rem] w-[calc(100%+1rem)] items-start gap-3 rounded-[10px] px-2 py-2.5 text-left enabled:hover:bg-panel disabled:text-muted sm:items-center"
                        >
                          <span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted">{number(t)}</span>
                          <span className="min-w-0 flex-1 sm:truncate">{t.title}</span>
                          {/* Locked rows are dimmed; the notice at the top says why. */}
                          {on && <span className={`tag ${st.cls}`}>{st.label}</span>}
                          {on && <span className="hidden w-10 text-right text-sm tabular-nums text-muted sm:inline">{pct(readiness(states[t.id]))}</span>}
                        </button>
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
        <section aria-labelledby="syllabus" className="ruled grid gap-x-10 gap-y-6 md:grid-cols-2">
          <h2 id="syllabus" className="sr-only">From the syllabus</h2>
          {course.aiPolicy && (
            <div className="text-sm leading-relaxed">
              <h3 className="card-title">What the syllabus says about AI</h3>
              <p className="mt-1 text-muted">{course.aiPolicy}</p>
              <p className="hint mt-2">This is a summary. Check the original before relying on it.</p>
            </div>
          )}
          {course.grading.length > 0 && (
            <div className="text-sm">
              <h3 className="card-title">Grade breakdown</h3>
              <ul className="mt-1 text-muted">
                {course.grading.map((g, i) => <li key={i} className="flex justify-between py-0.5"><span>{g.name}</span><span className="tabular-nums">{g.pct}%</span></li>)}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function CoursePage() {
  return (
    <RequireUser>
      <CourseScreen />
    </RequireUser>
  );
}
