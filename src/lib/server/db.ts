import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

// One SQLite file holds accounts, sessions, each learner's saved state and the
// classes instructors publish. HONEYCOMB_DB moves it (":memory:" works for tests).
const file = process.env.HONEYCOMB_DB ?? path.join(process.cwd(), "data", "honeycomb.db");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'instructor')),
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS user_state (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    rev INTEGER NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    course_code TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    policy TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (owner_id, course_id)
  );
  CREATE TABLE IF NOT EXISTS memberships (
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (class_id, user_id)
  );
`;

// Next's dev server reloads modules; keep one connection across reloads.
const holder = globalThis as unknown as { __honeycombDb?: Database.Database };

export function db(): Database.Database {
  if (!holder.__honeycombDb) {
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
    const conn = new Database(file);
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");
    conn.exec(SCHEMA);
    // Added after the first version; existing databases get the column on start.
    const columns = conn.prepare("PRAGMA table_info(classes)").all() as { name: string }[];
    if (!columns.some((c) => c.name === "course_code")) conn.exec("ALTER TABLE classes ADD COLUMN course_code TEXT NOT NULL DEFAULT ''");
    holder.__honeycombDb = conn;
  }
  return holder.__honeycombDb;
}
