"use client";

import { useEffect, useState } from "react";
import { daysUntil, localISO } from "./mastery";
import { DEFAULT_POLICY, STREAM_ERROR, type InstructorPolicy } from "./types";

export { topicContext } from "./course";

// Every call to our own API goes through here so failures surface the same way.
type Method = "GET" | "POST" | "PUT" | "DELETE";

export async function request(url: string, body?: unknown, signal?: AbortSignal, method: Method = body === undefined ? "GET" : "POST"): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (res.ok) return res;
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  throw new HttpError(res.status, j.error ?? `Request failed (${res.status})`);
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const sendJSON = async <T,>(method: "PUT" | "DELETE", url: string, body: unknown) => (await (await request(url, body, undefined, method)).json()) as T;

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

// The tutor rules for a course: the class's when it was joined with a code, the defaults otherwise.
export function usePolicy(classId: string | undefined): InstructorPolicy {
  const [loaded, setLoaded] = useState<{ id: string; policy: InstructorPolicy } | null>(null);
  useEffect(() => {
    if (!classId) return;
    const ctrl = new AbortController();
    getJSON<{ policy: InstructorPolicy }>(`/api/classes/policy?id=${encodeURIComponent(classId)}`, ctrl.signal)
      .then(({ policy }) => setLoaded({ id: classId, policy }))
      .catch(() => {
        // Fall back to the defaults; the server applies the real rules either way.
      });
    return () => ctrl.abort();
  }, [classId]);
  return classId && loaded?.id === classId ? loaded.policy : DEFAULT_POLICY;
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
