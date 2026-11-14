import { randomInt } from "node:crypto";
import { DEFAULT_POLICY, type ClassBundle, type ClassInsights, type ClassSummary, type HelpLevel, type InstructorPolicy, type User } from "../types";
import { newId } from "./auth";
import { db } from "./db";

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

const byId = (id: string) => db().prepare("SELECT * FROM classes WHERE id = ?").get(id) as ClassRow | undefined;
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

function summary(row: ClassRow): ClassSummary {
  const { n } = db().prepare("SELECT COUNT(*) AS n FROM memberships WHERE class_id = ?").get(row.id) as { n: number };
  return { id: row.id, code: row.code, courseId: row.course_id, title: row.title, students: n, policy: JSON.parse(row.policy) as InstructorPolicy };
}

// Publishing the same course again updates the class in place and keeps its code.
// Returns null when the owner already has as many classes as allowed.
export function publishClass(owner: User, input: ClassBundle): ClassSummary | null {
  const bundle = ownContentOnly(input);
  const title = `${bundle.course.code} ${bundle.course.title}`;
  const code = normalCode(bundle.course.code);
  const existing = db().prepare("SELECT * FROM classes WHERE owner_id = ? AND course_id = ?").get(owner.id, bundle.course.id) as ClassRow | undefined;
  if (existing) {
    db().prepare("UPDATE classes SET title = ?, course_code = ?, data = ?, updated_at = ? WHERE id = ?").run(title, code, JSON.stringify(bundle), Date.now(), existing.id);
    return summary(byId(existing.id)!);
  }
  const { n } = db().prepare("SELECT COUNT(*) AS n FROM classes WHERE owner_id = ?").get(owner.id) as { n: number };
  if (n >= MAX_CLASSES_PER_OWNER) return null;
  const id = newId();
  for (let attempt = 0; ; attempt++) {
    try {
      db()
        .prepare("INSERT INTO classes (id, code, owner_id, course_id, course_code, title, policy, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, newCode(), owner.id, bundle.course.id, code, title, JSON.stringify(DEFAULT_POLICY), JSON.stringify(bundle), Date.now());
      break;
    } catch (e) {
      // A code collision is the only expected failure; anything else, or a run of them, is real.
      if (attempt >= 4 || !(e instanceof Error) || !e.message.includes("classes.code")) throw e;
    }
  }
  return summary(byId(id)!);
}

export function listClasses(ownerId: string): ClassSummary[] {
  return (db().prepare("SELECT * FROM classes WHERE owner_id = ? ORDER BY updated_at DESC").all(ownerId) as ClassRow[]).map(summary);
}

export type JoinResult = { ok: true; bundle: ClassBundle } | { ok: false; reason: "not-found" | "own-class" };

export function joinClass(user: User, code: string): JoinResult {
  const row = db().prepare("SELECT * FROM classes WHERE code = ?").get(code.trim().toUpperCase()) as ClassRow | undefined;
  if (!row) return { ok: false, reason: "not-found" };
  if (row.owner_id === user.id) return { ok: false, reason: "own-class" };
  db().prepare("INSERT OR IGNORE INTO memberships (class_id, user_id, joined_at) VALUES (?, ?, ?)").run(row.id, user.id, Date.now());
  return { ok: true, bundle: forMember(JSON.parse(row.data) as ClassBundle, row) };
}

export function leaveClass(user: User, classId: string): void {
  db().prepare("DELETE FROM memberships WHERE class_id = ? AND user_id = ?").run(classId, user.id);
}

const STRICTNESS: Record<HelpLevel, number> = { hints: 0, guided: 1, full: 2 };

// The tutor rules for this user studying this course. The class is found from
// the user's own memberships, by the class id the app sends or, failing that,
// by course code, so leaving the id off a request does not shed the rules. With
// two matching classes the stricter one applies. A request that names a
// different course altogether gets the defaults: the server cannot know what a
// student is really studying, only which classes they belong to.
export function policyFor(user: User, classId: string | undefined, courseCode: string): InstructorPolicy {
  const mine = db()
    .prepare("SELECT c.* FROM classes c WHERE c.owner_id = ? OR c.id IN (SELECT class_id FROM memberships WHERE user_id = ?)")
    .all(user.id, user.id) as ClassRow[];
  const code = normalCode(courseCode);
  const policies = mine
    .filter((c) => c.id === classId || (code !== "" && c.course_code === code))
    .map((c) => JSON.parse(c.policy) as InstructorPolicy)
    .sort((a, b) => STRICTNESS[a.helpLevel] - STRICTNESS[b.helpLevel]);
  return policies[0] ?? DEFAULT_POLICY;
}

export function setPolicy(owner: User, classId: string, policy: InstructorPolicy): boolean {
  return db().prepare("UPDATE classes SET policy = ?, updated_at = ? WHERE id = ? AND owner_id = ?").run(JSON.stringify(policy), Date.now(), classId, owner.id).changes > 0;
}

const count = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
const fraction = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

// Topic-level averages across everyone who joined. Saved state comes from
// students' browsers, so every number is checked before it is counted.
export function classInsights(owner: User, classId: string): ClassInsights | null {
  const row = byId(classId);
  if (!row || row.owner_id !== owner.id) return null;
  const bundle = JSON.parse(row.data) as ClassBundle;
  const prefix = memberPrefix(row.id);
  const members = db()
    .prepare("SELECT s.data FROM memberships m JOIN user_state s ON s.user_id = m.user_id WHERE m.class_id = ?")
    .all(classId) as { data: string }[];
  const { n } = db().prepare("SELECT COUNT(*) AS n FROM memberships WHERE class_id = ?").get(classId) as { n: number };

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
