// Shared plumbing for the eval suites: accounts, requests with backoff, a
// small concurrency pool, and result files. No dependencies.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const BASE = (process.env.HONEYCOMB_URL ?? "http://localhost:3000").replace(/\/+$/, "");
export const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "results");

const HEADERS = { "content-type": "application/json", origin: BASE };
const BACKOFF_MS = [15_000, 30_000, 60_000]; // waits before tries 2, 3 and 4
const REQUEST_TIMEOUT_MS = 240_000;
const stamp = Date.now();
let accounts = 0;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const truncate = (s, n = 300) => {
  const flat = String(s ?? "").replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n)}...` : flat;
};

async function request(path, init) {
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // plain-text reply (the tutor) or an HTML error page
    }
    return { status: res.status, ok: res.ok, text, json, headers: res.headers };
  } catch (e) {
    // Network failure or timeout: status 0, so callers can record it and move on.
    return { status: 0, ok: false, text: `request failed: ${e?.cause?.code ?? e?.message ?? e}`, json: null, headers: null };
  }
}

const rateLimited = (r) => r.status === 429 || (r.status === 502 && /rate limited/i.test(r.text));

// Creates a throwaway student account and returns the session to send with later requests.
export async function signup(name = "Eval") {
  const email = `eval-${stamp}-${++accounts}@example.test`;
  const password = `eval-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const res = await request("/api/auth/signup", { method: "POST", headers: HEADERS, body: JSON.stringify({ name, email, password, role: "student" }) });
  if (!res.ok) throw new Error(`signup failed (${res.status}): ${truncate(res.text, 200)}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("signup returned no session cookie");
  return { email, cookie, questions: new Map() };
}

// POST as a signed-in account. A 429, or a 502 that says the model is rate
// limited, is retried after 15s, 30s and 60s. Never throws.
export async function post(session, path, body) {
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await request(path, { method: "POST", headers: { ...HEADERS, cookie: session.cookie }, body: JSON.stringify(body) });
    if (!rateLimited(res) || attempt >= BACKOFF_MS.length) break;
    await sleep(BACKOFF_MS[attempt]);
  }
  return { status: res.status, ok: res.ok, text: res.text, json: res.json };
}

// One account per `perAccount` cases, created the first time a case needs it.
export function accountPool(label, perAccount) {
  const sessions = new Map();
  return (index) => {
    const slot = Math.floor(index / perAccount);
    if (!sessions.has(slot)) sessions.set(slot, signup(`${label} ${slot + 1}`));
    return sessions.get(slot);
  };
}

// Stores a question on the server for this account (once) and returns its id.
export function importQuestion(session, key, topicId, question) {
  if (!session.questions.has(key)) {
    session.questions.set(
      key,
      post(session, "/api/questions/import", { topicId, question }).then((res) => {
        const id = res.json?.question?.id;
        if (!res.ok || typeof id !== "string") throw new Error(`question import failed (${res.status}): ${truncate(res.text, 200)}`);
        return id;
      }),
    );
  }
  return session.questions.get(key);
}

// Runs fn over items, at most `limit` at a time, keeping the order of results.
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

export async function serverStatus() {
  const res = await request("/api/status", { method: "GET" });
  return { reachable: res.status !== 0, ai: res.json?.ai ?? null, model: res.json?.model ?? "unknown" };
}

export async function writeResult(name, content) {
  await mkdir(RESULTS_DIR, { recursive: true });
  const file = join(RESULTS_DIR, name);
  await writeFile(file, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
  return file;
}

export const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "n/a");

// Markdown table; cells are escaped so a pipe in a reply cannot break the row.
export function mdTable(headers, rows) {
  const cell = (v) => String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

// Fixed-width table for the terminal.
export function textTable(headers, rows) {
  const all = [headers, ...rows].map((r) => r.map(String));
  const widths = headers.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  return all.map((r) => r.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd()).join("\n");
}
