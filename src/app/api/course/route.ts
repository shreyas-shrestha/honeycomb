import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { aiAvailable, errorMessage, NO_AI, structured } from "@/lib/server/ai";
import type { Course } from "@/lib/types";

const CourseMap = z.object({
  title: z.string().describe("Full course title"),
  instructor: z.string().describe("Instructor name, or empty string if not stated"),
  term: z.string().describe("Term such as 'Fall 2026', or empty string"),
  aiPolicy: z.string().describe("One or two sentences summarising what the syllabus says about AI tools and collaboration, or empty string if it says nothing"),
  grading: z.array(z.object({ name: z.string(), pct: z.number() })),
  exams: z.array(
    z.object({
      key: z.string().describe("Short slug such as 'exam1' or 'final'"),
      title: z.string(),
      date: z.string().describe("ISO date YYYY-MM-DD, or empty string if the syllabus gives no date"),
      weightPct: z.number().describe("Percent of the course grade, or 0 if not stated"),
    }),
  ),
  units: z.array(
    z.object({
      title: z.string(),
      when: z.string().describe("When it is taught as written, such as 'Weeks 3-4', or empty string"),
      topics: z.array(
        z.object({
          key: z.string().describe("Unique lowercase slug"),
          title: z.string(),
          summary: z.string().describe("One sentence on what the topic is"),
          objectives: z.array(z.string()).describe("Two to four things a student should be able to do, each starting with a verb"),
          prereqs: z.array(z.string()).describe("Keys of earlier topics in this course that this one directly depends on"),
          exams: z.array(z.string()).describe("Keys of the exams that cover this topic"),
          weight: z.number().describe("1 minor, 2 normal, 3 heavily tested"),
        }),
      ),
    }),
  ),
});

const SYSTEM = `You turn a university course syllabus into a study map for a learning app used by Georgia Tech students. The map drives what the student studies and when, so it has to reflect this syllabus, not a generic version of the course.

Break the course into its units in the order taught, and each unit into topics. A topic is one idea a student can learn in a 15 to 20 minute session, so "Trees" is a unit and "AVL rotations" is a topic. Aim for 15 to 40 topics for a full course. Where the syllabus only lists broad weeks, use your knowledge of how this course is normally taught at Georgia Tech to fill in the standard topics for each week, and keep to what the listed weeks cover.

Prerequisite links are between topics inside this course. Add one only where a student cannot follow the later topic without the earlier one.

For exams, use the dates in the syllabus. Assign each topic to the exams that cover it using the schedule; a cumulative final covers every topic. Resolve dates that lack a year using the term. If something is not in the syllabus, leave it empty; do not invent dates, names or percentages.`;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function POST(req: Request) {
  if (!aiAvailable()) return NO_AI();
  const { code, title, syllabus, pdfBase64 } = (await req.json()) as {
    code: string;
    title?: string;
    syllabus?: string;
    pdfBase64?: string;
  };
  if (!code?.trim()) return Response.json({ error: "Choose a course first." }, { status: 400 });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (pdfBase64) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } });
  }
  const intro = `Course code: ${code}${title ? ` (${title})` : ""}. Today's date is ${new Date().toISOString().slice(0, 10)}.`;
  const body = syllabus?.trim()
    ? `Syllabus text:\n\n${syllabus}`
    : pdfBase64
      ? "The syllabus is the attached PDF."
      : "No syllabus was provided. Build the map from how this course is normally taught at Georgia Tech, and leave exam dates empty.";
  content.push({ type: "text", text: `${intro}\n\n${body}` });

  try {
    const map = await structured({ schema: CourseMap, system: SYSTEM, content, effort: "medium" });
    const id = `${slug(code)}-${Date.now().toString(36)}`;
    const topicId = (key: string) => `${id}.${slug(key)}`;
    const examId = (key: string) => `${id}.exam.${slug(key)}`;
    const topicKeys = new Set(map.units.flatMap((u) => u.topics.map((t) => slug(t.key))));
    const examKeys = new Set(map.exams.map((e) => slug(e.key)));
    const course: Course = {
      id,
      code: code.trim(),
      title: map.title || title || code,
      instructor: map.instructor,
      term: map.term,
      aiPolicy: map.aiPolicy,
      grading: map.grading,
      exams: map.exams.map((e) => ({
        id: examId(e.key),
        title: e.title,
        date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null,
        weightPct: e.weightPct > 0 ? e.weightPct : null,
      })),
      units: map.units.map((u, i) => ({ id: `${id}.u${i}`, title: u.title, when: u.when || undefined })),
      topics: map.units.flatMap((u, i) =>
        u.topics.map((t) => ({
          id: topicId(t.key),
          unitId: `${id}.u${i}`,
          title: t.title,
          summary: t.summary,
          objectives: t.objectives,
          prereqs: t.prereqs.map(slug).filter((k) => topicKeys.has(k) && k !== slug(t.key)).map(topicId),
          examIds: t.exams.map(slug).filter((k) => examKeys.has(k)).map(examId),
          weight: Math.min(3, Math.max(1, Math.round(t.weight) || 2)),
        })),
      ),
      source: "ai",
      createdAt: new Date().toISOString(),
    };
    if (!course.topics.length) return Response.json({ error: "No topics could be extracted from that syllabus." }, { status: 422 });
    return Response.json({ course });
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 502 });
  }
}
