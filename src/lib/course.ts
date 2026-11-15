import type { Course, Material, Topic, TopicContext, TopicState } from "./types";

// What a prompt needs to know about the topic being studied. Shared by the browser and the server.
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

// What a student's uploads say about one topic, as text for a prompt. Empty when there is nothing.
export function materialText(materials: Material[], topicId: string): string {
  const parts: string[] = [];
  for (const m of materials) {
    const t = m.byTopic[topicId];
    if (!t) continue;
    parts.push(`From "${m.name}" (${m.kind}). How this course asks questions: ${m.style}`);
    if (t.notes) parts.push(t.notes);
    if (t.examples.length) parts.push(`Example questions from it:\n${t.examples.map((e) => `- ${e}`).join("\n")}`);
  }
  return parts.join("\n\n").slice(0, 10_000);
}
