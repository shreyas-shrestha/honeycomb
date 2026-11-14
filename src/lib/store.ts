"use client";

import { useSyncExternalStore } from "react";
import { recordAttempt } from "./mastery";
import { DEFAULT_POLICY, type Course, type InstructorPolicy, type ModeId, type Question, type TopicState } from "./types";

export interface State {
  courses: Record<string, Course>;
  activeCourseId: string | null;
  activeTopicId: string | null;
  topicState: Record<string, TopicState>;
  questions: Record<string, Question[]>;
  lessons: Record<string, string>; // `${topicId}:${mode}`
  policies: Record<string, InstructorPolicy>;
  mode: ModeId;
}

const EMPTY: State = {
  courses: {},
  activeCourseId: null,
  activeTopicId: null,
  topicState: {},
  questions: {},
  lessons: {},
  policies: {},
  mode: "walkthrough",
};

const KEY = "honeycomb:v1";
let state: State = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    state = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<State>) } : EMPTY;
  } catch {
    // Private windows can refuse storage; the app still works for the session.
  }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  read();
  // Another tab wrote: take its state so this tab does not overwrite it later.
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    read();
    listeners.forEach((l) => l());
  });
}

export function getState(): State {
  load();
  return state;
}

function setState(update: (s: State) => State) {
  state = update(getState());
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    console.warn("Honeycomb could not save progress to this browser's storage.");
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(select: (s: State) => T): T {
  const s = useSyncExternalStore(subscribe, getState, () => EMPTY);
  return select(s);
}

const noop = () => () => {};
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

const without = <T,>(rec: Record<string, T>, drop: (key: string) => boolean) =>
  Object.fromEntries(Object.entries(rec).filter(([k]) => !drop(k)));

export const actions = {
  addCourse(course: Course, questions: Record<string, Question[]> = {}, lessons: Record<string, string> = {}) {
    setState((s) => ({
      ...s,
      courses: { ...s.courses, [course.id]: course },
      activeCourseId: course.id,
      activeTopicId: null,
      questions: { ...s.questions, ...questions },
      lessons: { ...s.lessons, ...lessons },
    }));
  },
  removeCourse(id: string) {
    setState((s) => {
      const topicIds = new Set(s.courses[id]?.topics.map((t) => t.id));
      const ofCourse = (key: string) => topicIds.has(key.split(":")[0]);
      const wasActive = s.activeCourseId === id;
      return {
        ...s,
        courses: without(s.courses, (k) => k === id),
        policies: without(s.policies, (k) => k === id),
        activeCourseId: wasActive ? null : s.activeCourseId,
        activeTopicId: wasActive ? null : s.activeTopicId,
        topicState: without(s.topicState, ofCourse),
        questions: without(s.questions, ofCourse),
        lessons: without(s.lessons, ofCourse),
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
  saveQuestions(topicId: string, qs: Question[]) {
    setState((s) => ({ ...s, questions: { ...s.questions, [topicId]: [...(s.questions[topicId] ?? []), ...qs] } }));
  },
  // confidence null records a teach-back.
  attempt(topicId: string, score: number, confidence: number | null) {
    setState((s) => ({ ...s, topicState: { ...s.topicState, [topicId]: recordAttempt(s.topicState[topicId], score, confidence) } }));
  },
  setPolicy(courseId: string, policy: InstructorPolicy) {
    setState((s) => ({ ...s, policies: { ...s.policies, [courseId]: policy } }));
  },
};

export const policyFor = (s: State, courseId: string | null): InstructorPolicy =>
  (courseId && s.policies[courseId]) || DEFAULT_POLICY;
