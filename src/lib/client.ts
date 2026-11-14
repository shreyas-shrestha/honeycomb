"use client";

import { useEffect, useState } from "react";
import { daysUntil, localISO } from "./mastery";
import { STREAM_ERROR, type Course, type Topic, type TopicContext, type TopicState } from "./types";

export function topicContext(course: Course, topic: Topic, state?: TopicState): TopicContext {
  return {
    courseCode: course.code,
    courseTitle: course.title,
    instructor: course.basis === "demo" ? undefined : course.instructor || undefined,
    topicTitle: topic.title,
    topicSummary: topic.summary,
    objectives: topic.objectives,
    prereqTitles: topic.prereqs.map((id) => course.topics.find((t) => t.id === id)?.title).filter((t): t is string => Boolean(t)),
    mastery: state?.attempts ? state.mastery : undefined,
  };
}

// Every call to our own API goes through here so failures surface the same way.
async function request(url: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (res.ok) return res;
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(j.error ?? `Request failed (${res.status})`);
}

export async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  return (await (await request(url, undefined, signal)).json()) as T;
}

export async function postJSON<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return (await (await request(url, body, signal)).json()) as T;
}

// Reads a streamed text reply, reporting it as it grows. Rejects if the server
// marks a failure or sends nothing, so callers never keep a broken reply.
export async function streamPost(url: string, body: unknown, onText: (soFar: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await request(url, body, signal);
  if (!res.body) throw new Error("No reply came back.");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let raw = "";
  const visible = () => raw.split(STREAM_ERROR)[0];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += dec.decode(value, { stream: true });
    onText(visible());
  }
  const [text, failure] = raw.split(STREAM_ERROR);
  if (failure !== undefined) throw new Error(failure || "The reply failed partway through.");
  if (!text.trim()) throw new Error("No reply came back. Try again.");
  return text;
}

export const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

// null while unknown, then whether the server has AI credentials.
export function useAiStatus(): boolean | null {
  const [ai, setAi] = useState<boolean | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    getJSON<{ ai: boolean }>("/api/status", ctrl.signal)
      .then((j) => setAi(Boolean(j.ai)))
      .catch(() => {
        if (!ctrl.signal.aborted) setAi(false);
      });
    return () => ctrl.abort();
  }, []);
  return ai;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

// "Sun, Oct 25" from a local ISO date.
export function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// When a review falls, in words: "later today", "tomorrow", "on Wednesday, Nov 18".
export function dueLabel(due: string | Date): string {
  const d = new Date(due);
  const days = daysUntil(localISO(d));
  if (days !== null && days <= 0) return "later today";
  if (days === 1) return "tomorrow";
  return `on ${d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`;
}
