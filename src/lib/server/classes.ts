import { randomInt } from "node:crypto";
import { fileQuestions, publicView, withKeys } from "./vault";
import { DEFAULT_POLICY, type ClassBundle, type ClassInsights, type ClassSummary, type HelpLevel, type InstructorPolicy, type User } from "../types";
import { newId } from "./auth";
import { all, one, run } from "./db";

// Letters and digits that are hard to misread aloud or on a whiteboard.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => `HC-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;
const MAX_CLASSES_PER_OWNER = 30;
// A topic's average is only reported once this many students have practiced it,
// so a number can never be traced back to one person.
const MIN_STUDENTS_SHOWN = 3;

interface ClassRow {
  id: string;
  code: string;
  owner_id: string;
  course_id: string;
  course_code: string;
  title: string;
  policy: string;
  data: string;
}

const byId = (id: string) => one<ClassRow>("SELECT * FROM classes WHERE id = ?", id);
const studentCount = async (classId: string) => (await one<{ n: number }>("SELECT COUNT(*) AS n FROM memberships WHERE class_id = ?", classId))?.n ?? 0;
const normalCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

// Keeps only content that belongs to the bundle's own topics, so a published
// class cannot carry entries for anything else.
function ownContentOnly(bundle: ClassBundle): ClassBundle {
  const topics = new Set(bundle.course.topics.map((t) => t.id));
  const own = <T,>(rec: Record<string, T>) => Object.entries(rec).filter(([k]) => topics.has(k.split(":")[0]));
  return {
    course: bundle.course,
    questions: Object.fromEntries(own(bundle.questions).map(([k, qs]) => [k, qs.map((q) => ({ ...q, topicId: k }))])),
    lessons: Object.fromEntries(own(bundle.lessons)),
    experiences: Object.fromEntries(own(bundle.experiences).map(([k, e]) => [k, { ...e, topicId: k }])),
  };
}

// Every id in a class is prefixed for the people who join it. Two classes built
// from the same course, or a class and a student's own copy, then never collide.
const memberPrefix = (classId: string) => `cls-${classId}.`;

function forMember(bundle: ClassBundle, row: ClassRow): ClassBundle {
  const p = memberPrefix(row.id);
  const id = (s: string) => p + s;
  const c = bundle.course;
  return {
    course: {
      ...c,
      id: id(c.id),
      units: c.units.map((u) => ({ ...u, id: id(u.id) })),
      exams: c.exams.map((e) => ({ ...e, id: id(e.id) })),
      topics: c.topics.map((t) => ({ ...t, id: id(t.id), unitId: id(t.unitId), prereqs: t.prereqs.map(id), examIds: t.examIds.map(id) })),
      classId: row.id,
      classCode: row.code,
    },
    questions: Object.fromEntries(Object.entries(bundle.questions).map(([k, qs]) => [id(k), qs.map((q) => ({ ...q, id: id(q.id), topicId: id(k) }))])),
    lessons: Object.fromEntries(Object.entries(bundle.lessons).map(([k, v]) => [id(k), v])),
    experiences: Object.fromEntries(Object.entries(bundle.experiences).map(([k, e]) => [id(k), { ...e, topicId: id(k) }])),
  };
}

async function summary(row: ClassRow): Promise<ClassSummary> {
  return { id: row.id, code: row.code, courseId: row.course_id, title: row.title, students: await studentCount(row.id), policy: JSON.parse(row.policy) as InstructorPolicy };
}

// Publishing the same course again updates the class in place and keeps its code.
// Returns null when the owner already has as many classes as allowed.
export async function publishClass(owner: User, input: ClassBundle): Promise<ClassSummary | null> {
  const own = ownContentOnly(input);
  // The browser's copies of vaulted questions have no keys; the class needs the real ones.
  const questions: ClassBundle["questions"] = {};
  for (const [topicId, list] of Object.entries(own.questions)) questions[topicId] = await withKeys(owner.id, list);
  const bundle: ClassBundle = { ...own, questions };
  const title = `${bundle.course.code} ${bundle.course.title}`;
  const code = normalCode(bundle.course.code);
  const existing = await one<ClassRow>("SELECT * FROM classes WHERE owner_id = ? AND course_id = ?", owner.id, bundle.course.id);
  if (existing) {
    await run("UPDATE classes SET title = ?, course_code = ?, data = ?, updated_at = ? WHERE id = ?", title, code, JSON.stringify(bundle), Date.now(), existing.id);
    return summary((await byId(existing.id))!);
  }
  const owned = (await one<{ n: number }>("SELECT COUNT(*) AS n FROM classes WHERE owner_id = ?", owner.id))?.n ?? 0;
  if (owned >= MAX_CLASSES_PER_OWNER) return null;
  const id = newId();
  for (let attempt = 0; ; attempt++) {
    try {
      await run(
        "INSERT INTO classes (id, code, owner_id, course_id, course_code, title, policy, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        id, newCode(), owner.id, bundle.course.id, code, title, JSON.stringify(DEFAULT_POLICY), JSON.stringify(bundle), Date.now(),
      );
      break;
    } catch (e) {
      // A code collision is the only expected failure; anything else, or a run of them, is real.
      if (attempt >= 4 || !(e instanceof Error) || !e.message.includes("classes.code")) throw e;
    }
  }
  return summary((await byId(id))!);
}

export async function listClasses(ownerId: string): Promise<ClassSummary[]> {
  return Promise.all((await all<ClassRow>("SELECT * FROM classes WHERE owner_id = ? ORDER BY updated_at DESC", ownerId)).map(summary));
}

export type JoinResult = { ok: true; bundle: ClassBundle } | { ok: false; reason: "not-found" | "own-class" };

export async function joinClass(user: User, code: string): Promise<JoinResult> {
  const row = await one<ClassRow>("SELECT * FROM classes WHERE code = ?", code.trim().toUpperCase());
  if (!row) return { ok: false, reason: "not-found" };
  if (row.owner_id === user.id) return { ok: false, reason: "own-class" };
  // The class's questions go into this student's vault first, so a join that cannot hold them fails before the student counts as a member.
  const bundle = forMember(JSON.parse(row.data) as ClassBundle, row);
  await fileQuestions(user.id, Object.values(bundle.questions).flat());
  await run("INSERT OR IGNORE INTO memberships (class_id, user_id, joined_at) VALUES (?, ?, ?)", row.id, user.id, Date.now());
  return { ok: true, bundle: { ...bundle, questions: Object.fromEntries(Object.entries(bundle.questions).map(([k, qs]) => [k, qs.map(publicView)])) } };
}

export async function leaveClass(user: User, classId: string): Promise<void> {
  await run("DELETE FROM memberships WHERE class_id = ? AND user_id = ?", classId, user.id);
}

const STRICTNESS: Record<HelpLevel, number> = { hints: 0, guided: 1 };

// The tutor rules for this user studying this course. The class is found from
// the user's own memberships, by the class id the app sends or, failing that,
// by course code, so leaving the id off a request does not shed the rules. With
// two matching classes the stricter one applies. A request that names a
// different course altogether gets the defaults: the server cannot know what a
// student is really studying, only which classes they belong to.
export async function policyFor(user: User, classId: string | undefined, courseCode: string): Promise<InstructorPolicy> {
  const mine = await all<ClassRow>("SELECT c.* FROM classes c WHERE c.owner_id = ? OR c.id IN (SELECT class_id FROM memberships WHERE user_id = ?)", user.id, user.id);
  const code = normalCode(courseCode);
  const policies = mine
    .filter((c) => c.id === classId || (code !== "" && c.course_code === code))
    .map((c) => JSON.parse(c.policy) as InstructorPolicy)
    .sort((a, b) => STRICTNESS[a.helpLevel] - STRICTNESS[b.helpLevel]);
  return policies[0] ?? DEFAULT_POLICY;
}

export async function setPolicy(owner: User, classId: string, policy: InstructorPolicy): Promise<boolean> {
  return (await run("UPDATE classes SET policy = ?, updated_at = ? WHERE id = ? AND owner_id = ?", JSON.stringify(policy), Date.now(), classId, owner.id)) > 0;
}

const count = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
const fraction = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

// Topic-level averages across everyone who joined. Saved state comes from
// students' browsers, so every number is checked before it is counted.
export async function classInsights(owner: User, classId: string): Promise<ClassInsights | null> {
  const row = await byId(classId);
  if (!row || row.owner_id !== owner.id) return null;
  const bundle = JSON.parse(row.data) as ClassBundle;
  const prefix = memberPrefix(row.id);
  const members = await all<{ data: string }>("SELECT s.data FROM memberships m JOIN user_state s ON s.user_id = m.user_id WHERE m.class_id = ?", classId);
  const n = await studentCount(classId);

  const totals = new Map(bundle.course.topics.map((t) => [prefix + t.id, { topicId: t.id, title: t.title, students: 0, mastery: 0 }]));
  let active = 0;
  for (const m of members) {
    let states: Record<string, { mastery?: unknown; attempts?: unknown } | null> = {};
    try {
      const parsed = (JSON.parse(m.data) as { topicState?: unknown }).topicState;
      if (parsed && typeof parsed === "object") states = parsed as typeof states;
    } catch {
      continue;
    }
    let any = false;
    for (const [topicId, s] of Object.entries(states)) {
      const t = totals.get(topicId);
      if (!t || !s || count(s.attempts) === 0) continue;
      any = true;
      t.students += 1;
      t.mastery += fraction(s.mastery);
    }
    if (any) active += 1;
  }
  const topics = [...totals.values()]
    .filter((t) => t.students >= MIN_STUDENTS_SHOWN)
    .map((t) => ({ ...t, mastery: t.mastery / t.students }))
    .sort((a, b) => a.mastery - b.mastery);
  return { students: n, active, minStudents: MIN_STUDENTS_SHOWN, topics };
}
