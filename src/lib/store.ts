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

const KEY = "hive:v1";
let state: State = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...EMPTY, ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    // Private windows can refuse storage; the app still works for the session.
  }
}

export function getState(): State {
  load();
  return state;
}

export function setState(update: (s: State) => State) {
  state = update(getState());
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // See load().
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

export const actions = {
  addCourse(course: Course, questions: Record<string, Question[]> = {}, lessons: Record<string, string> = {}) {
    setState((s) => ({
      ...s,
      courses: { ...s.courses, [course.id]: course },
      activeCourseId: course.id,
      questions: { ...s.questions, ...questions },
      lessons: { ...s.lessons, ...lessons },
    }));
  },
  removeCourse(id: string) {
    setState((s) => {
      const courses = { ...s.courses };
      const topicIds = new Set(courses[id]?.topics.map((t) => t.id));
      delete courses[id];
      const keep = <T,>(rec: Record<string, T>) =>
        Object.fromEntries(Object.entries(rec).filter(([k]) => !topicIds.has(k.split(":")[0])));
      return {
        ...s,
        courses,
        activeCourseId: s.activeCourseId === id ? null : s.activeCourseId,
        topicState: keep(s.topicState),
        questions: keep(s.questions),
        lessons: keep(s.lessons),
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
  attempt(topicId: string, score: number, confidence: number) {
    setState((s) => ({ ...s, topicState: { ...s.topicState, [topicId]: recordAttempt(s.topicState[topicId], score, confidence) } }));
  },
  taughtBack(topicId: string, score: number) {
    setState((s) => {
      const next = recordAttempt(s.topicState[topicId], score, 2);
      return { ...s, topicState: { ...s.topicState, [topicId]: { ...next, taughtBack: score >= 0.7 || next.taughtBack } } };
    });
  },
  setPolicy(courseId: string, policy: InstructorPolicy) {
    setState((s) => ({ ...s, policies: { ...s.policies, [courseId]: policy } }));
  },
};

export const policyFor = (s: State, courseId: string | null): InstructorPolicy =>
  (courseId && s.policies[courseId]) || DEFAULT_POLICY;
