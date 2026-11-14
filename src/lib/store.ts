"use client";

import { useSyncExternalStore } from "react";
import { getJSON, sendJSON } from "./client";
import { recordAttempt } from "./mastery";
import type { ClassBundle, Course, Experience, ModeId, Question, TopicState } from "./types";

export interface State {
  courses: Record<string, Course>;
  activeCourseId: string | null;
  activeTopicId: string | null;
  topicState: Record<string, TopicState>;
  questions: Record<string, Question[]>;
  lessons: Record<string, string>; // `${topicId}:${mode}`
  experiences: Record<string, Experience>; // by topic id
  mode: ModeId;
}

const EMPTY: State = {
  courses: {},
  activeCourseId: null,
  activeTopicId: null,
  topicState: {},
  questions: {},
  lessons: {},
  experiences: {},
  mode: "walkthrough",
};

// What the header shows about saving. "unloaded" means the saved copy could not
// be fetched at sign-in; "rejected" means the server will never accept this save.
export type SaveStatus = "saved" | "pending" | "retrying" | "rejected" | "unloaded";

// The signed-in learner's state lives on the server. This module keeps a copy
// in memory, hands it to React, and saves changes back shortly after they happen.
const SAVE_DELAY_MS = 600;
const RETRY_DELAY_MS = 5000;
const MAX_QUESTIONS_PER_TOPIC = 30;

let state: State = EMPTY;
let owner: string | null = null; // the account this copy belongs to
let rev = 0;
let status: SaveStatus = "saved";
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let dirty = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const setStatus = (s: SaveStatus) => {
  if (status === s) return;
  status = s;
  notify();
};

async function fetchSaved(): Promise<{ rev: number; data: State }> {
  const res = await getJSON<{ rev: number; data: Partial<State> | null }>("/api/state");
  return { rev: res.rev, data: { ...EMPTY, ...(res.data ?? {}) } };
}

export async function loadStore(userId: string): Promise<void> {
  owner = userId;
  dirty = false;
  try {
    const saved = await fetchSaved();
    state = saved.data;
    rev = saved.rev;
    status = "saved";
  } catch {
    // Saving over a copy we never loaded would wipe it, so saving stays off.
    state = EMPTY;
    status = "unloaded";
  }
  notify();
}

export function resetStore() {
  if (timer) clearTimeout(timer);
  timer = null;
  owner = null;
  state = EMPTY;
  rev = 0;
  dirty = false;
  status = "saved";
  notify();
}

// When another tab or device saved first, keep both sides' work: the topic
// record with more answers wins, and everything else is the union with this
// tab's version preferred.
function merge(server: State, local: State): State {
  const topicState = { ...server.topicState };
  for (const [id, mine] of Object.entries(local.topicState)) {
    if (!topicState[id] || mine.attempts >= topicState[id].attempts) topicState[id] = mine;
  }
  const questions = { ...server.questions };
  for (const [id, mine] of Object.entries(local.questions)) {
    const seen = new Set((questions[id] ?? []).map((q) => q.id));
    questions[id] = [...(questions[id] ?? []), ...mine.filter((q) => !seen.has(q.id))].slice(-MAX_QUESTIONS_PER_TOPIC);
  }
  return {
    ...local,
    courses: { ...server.courses, ...local.courses },
    topicState,
    questions,
    lessons: { ...server.lessons, ...local.lessons },
    experiences: { ...server.experiences, ...local.experiences },
  };
}

async function push(): Promise<void> {
  if (!owner || status === "unloaded") return;
  dirty = false;
  let retry = false;
  try {
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: owner, baseRev: rev, data: state }),
    });
    if (res.ok) {
      rev = ((await res.json()) as { rev: number }).rev;
    } else if (res.status === 409) {
      const saved = await fetchSaved();
      state = merge(saved.data, state);
      rev = saved.rev;
      dirty = true;
      notify();
    } else if (res.status === 401) {
      // Signed out, or signed in as someone else, in another tab. Start over from the real session.
      window.location.reload();
      return;
    } else if (res.status === 400 || res.status === 413) {
      setStatus("rejected");
      return;
    } else {
      retry = true;
    }
  } catch {
    retry = true; // offline or the server is down
  }
  if (retry) {
    dirty = true;
    setStatus("retrying");
    schedule(RETRY_DELAY_MS);
  } else if (dirty) {
    schedule(0);
  } else {
    setStatus("saved");
  }
}

function save(): Promise<void> {
  inFlight ??= push().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function schedule(delay = SAVE_DELAY_MS) {
  dirty = true;
  if (status === "saved") setStatus("pending");
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void save();
  }, delay);
}

// Saves anything outstanding and waits for it. Used before signing out.
export async function flushStore(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  await inFlight;
  if (dirty) await save();
}

if (typeof window !== "undefined") {
  // Best effort when the tab is hidden or closed: start the save now instead of
  // waiting out the delay. A browser may still cancel it mid-flight.
  window.addEventListener("pagehide", () => {
    if (!dirty || !timer) return;
    clearTimeout(timer);
    timer = null;
    void save();
  });
}

export function getState(): State {
  return state;
}

function setState(update: (s: State) => State) {
  state = update(state);
  notify();
  schedule();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(select: (s: State) => T): T {
  const s = useSyncExternalStore(subscribe, getState, () => EMPTY);
  return select(s);
}

export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(subscribe, () => status, () => "saved" as const);
}

const without = <T,>(rec: Record<string, T>, drop: (key: string) => boolean) =>
  Object.fromEntries(Object.entries(rec).filter(([k]) => !drop(k)));

export const actions = {
  // Adds a course with whatever content comes with it (the sample, or a joined class).
  addCourse(bundle: Pick<ClassBundle, "course"> & Partial<ClassBundle>) {
    setState((s) => ({
      ...s,
      courses: { ...s.courses, [bundle.course.id]: bundle.course },
      activeCourseId: bundle.course.id,
      activeTopicId: null,
      questions: { ...s.questions, ...bundle.questions },
      lessons: { ...s.lessons, ...bundle.lessons },
      experiences: { ...s.experiences, ...bundle.experiences },
    }));
  },
  removeCourse(id: string) {
    const classId = state.courses[id]?.classId;
    if (classId) {
      // Leaving the class too, so the instructor's numbers stop counting this account.
      sendJSON("DELETE", "/api/classes/join", { classId }).catch(() => {});
    }
    setState((s) => {
      const topicIds = new Set(s.courses[id]?.topics.map((t) => t.id));
      const ofCourse = (key: string) => topicIds.has(key.split(":")[0]);
      const wasActive = s.activeCourseId === id;
      return {
        ...s,
        courses: without(s.courses, (k) => k === id),
        activeCourseId: wasActive ? null : s.activeCourseId,
        activeTopicId: wasActive ? null : s.activeTopicId,
        topicState: without(s.topicState, ofCourse),
        questions: without(s.questions, ofCourse),
        lessons: without(s.lessons, ofCourse),
        experiences: without(s.experiences, ofCourse),
      };
    });
  },
  open(courseId: string, topicId: string | null = null) {
    setState((s) => ({ ...s, activeCourseId: courseId, activeTopicId: topicId }));
  },
  setMode(mode: ModeId) {
    setState((s) => ({ ...s, mode }));
  },
  saveLesson(topicId: string, mode: ModeId, text: string) {
    setState((s) => ({ ...s, lessons: { ...s.lessons, [`${topicId}:${mode}`]: text } }));
  },
  saveExperience(topicId: string, blocks: Experience["blocks"]) {
    setState((s) => ({ ...s, experiences: { ...s.experiences, [topicId]: { topicId, blocks, createdAt: new Date().toISOString() } } }));
  },
  // The newest questions are kept; the oldest drop off so the saved state stays bounded.
  saveQuestions(topicId: string, qs: Question[]) {
    setState((s) => ({ ...s, questions: { ...s.questions, [topicId]: [...(s.questions[topicId] ?? []), ...qs].slice(-MAX_QUESTIONS_PER_TOPIC) } }));
  },
  // confidence null records a teach-back.
  attempt(topicId: string, score: number, confidence: number | null) {
    setState((s) => ({ ...s, topicState: { ...s.topicState, [topicId]: recordAttempt(s.topicState[topicId], score, confidence) } }));
  },
};

// Everything a course needs to be handed to someone else.
export function bundleOf(s: State, courseId: string): ClassBundle | null {
  const course = s.courses[courseId];
  if (!course) return null;
  const topicIds = new Set(course.topics.map((t) => t.id));
  const pick = <T,>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([k]) => topicIds.has(k.split(":")[0])));
  const plain: Course = { ...course };
  delete plain.classId;
  delete plain.classCode;
  return { course: plain, questions: pick(s.questions), lessons: pick(s.lessons), experiences: pick(s.experiences) };
}
