import { createClient, type Client, type InValue } from "@libsql/client";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Accounts, sessions, each learner's saved state and published classes live in
// one SQLite-compatible database. Locally that is a file; when deployed it is a
// hosted libSQL database (Turso), because serverless hosts have no lasting disk.
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

async function open(): Promise<Client> {
  const remote = process.env.TURSO_DATABASE_URL;
  if (!remote && process.env.VERCEL) {
    throw new Error("No database is configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for this deployment.");
  }
  let client: Client;
  if (remote) {
    client = createClient({ url: remote, authToken: process.env.TURSO_AUTH_TOKEN });
  } else {
    const file = process.env.HONEYCOMB_DB ?? path.join(process.cwd(), "data", "honeycomb.db");
    mkdirSync(path.dirname(file), { recursive: true });
    client = createClient({ url: `file:${file}` });
  }
  await client.executeMultiple(SCHEMA);
  return client;
}

// One connection per server process, kept across the dev server's module reloads.
const holder = globalThis as unknown as { __honeycombDb?: Promise<Client> };

function db(): Promise<Client> {
  if (!holder.__honeycombDb) {
    const opening = open();
    holder.__honeycombDb = opening;
    // A failed start should be retried on the next request, not remembered.
    opening.catch(() => {
      if (holder.__honeycombDb === opening) holder.__honeycombDb = undefined;
    });
  }
  return holder.__honeycombDb;
}

export async function all<T>(sql: string, ...args: InValue[]): Promise<T[]> {
  return (await (await db()).execute({ sql, args })).rows as unknown as T[];
}

export async function one<T>(sql: string, ...args: InValue[]): Promise<T | undefined> {
  return (await all<T>(sql, ...args))[0];
}

// Runs a write and returns how many rows it changed.
export async function run(sql: string, ...args: InValue[]): Promise<number> {
  return (await (await db()).execute({ sql, args })).rowsAffected;
}
