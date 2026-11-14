"use client";

import { useEffect, useState } from "react";
import type { TopicContext } from "./server/ai";
import type { Course, Topic, TopicState } from "./types";

export function topicContext(course: Course, topic: Topic, state?: TopicState): TopicContext {
  return {
    courseCode: course.code,
    courseTitle: course.title,
    instructor: course.source === "demo" ? undefined : course.instructor || undefined,
    topicTitle: topic.title,
    topicSummary: topic.summary,
    objectives: topic.objectives,
    prereqTitles: topic.prereqs.map((id) => course.topics.find((t) => t.id === id)?.title).filter((t): t is string => Boolean(t)),
    mastery: state?.attempts ? state.mastery : undefined,
  };
}

async function failure(res: Response): Promise<Error> {
  try {
    const j = (await res.json()) as { error?: string };
    return new Error(j.error ?? `Request failed (${res.status})`);
  } catch {
    return new Error(`Request failed (${res.status})`);
  }
}

export async function postJSON<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
}

export async function streamPost(url: string, body: unknown, onText: (soFar: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) throw await failure(res);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    onText(text);
  }
  return text;
}

// null while unknown, then whether the server has AI credentials.
export function useAiStatus(): boolean | null {
  const [ai, setAi] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/status")
      .then((r) => r.json())
      .then((j: { ai: boolean }) => live && setAi(Boolean(j.ai)))
      .catch(() => live && setAi(false));
    return () => {
      live = false;
    };
  }, []);
  return ai;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
