import { recordAttempt } from "../mastery";
import type { Course, Material, Topic, TopicState } from "../types";
import { one, run } from "./db";

// The parts of a student's saved state the server reads and, for work done
// through the MCP server, writes.
export interface Saved {
  courses: Record<string, Course>;
  topicState: Record<string, TopicState>;
  materials: Record<string, Material[]>;
  [other: string]: unknown;
}

interface Row {
  rev: number;
  data: string;
}

const parse = (row: Row | undefined): Saved => {
  const data = (row ? JSON.parse(row.data) : {}) as Partial<Saved>;
  return { ...data, courses: data.courses ?? {}, topicState: data.topicState ?? {}, materials: data.materials ?? {} };
};

export async function loadProgress(userId: string): Promise<Saved> {
  return parse(await one<Row>("SELECT rev, data FROM user_state WHERE user_id = ?", userId));
}

// Finds a topic among the student's courses.
export function locate(saved: Saved, topicId: string): { course: Course; topic: Topic } | undefined {
  for (const course of Object.values(saved.courses)) {
    const topic = course.topics.find((t) => t.id === topicId);
    if (topic) return { course, topic };
  }
  return undefined;
}

// Records answers in the student's saved state, the same way the app does, so
// work done through an assistant counts toward readiness. The save names the
// revision it read, and is retried if a browser tab saved in between.
export async function recordAttempts(userId: string, attempts: { topicId: string; score: number; blind: boolean }[]): Promise<void> {
  for (let tries = 0; tries < 4; tries++) {
    const row = await one<Row>("SELECT rev, data FROM user_state WHERE user_id = ?", userId);
    if (!row) return; // nothing saved yet, so there is no course to record against
    const saved = parse(row);
    for (const a of attempts) saved.topicState[a.topicId] = recordAttempt(saved.topicState[a.topicId], a.score, a.blind ? null : 2, new Date(), a.blind);
    if ((await run("UPDATE user_state SET rev = rev + 1, data = ? WHERE user_id = ? AND rev = ?", JSON.stringify(saved), userId, row.rev)) > 0) return;
  }
  throw new Error("Could not save the result because progress kept changing. Try again.");
}
