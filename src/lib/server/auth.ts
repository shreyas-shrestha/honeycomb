import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import type { User } from "../types";
import { db } from "./db";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const COOKIE = "hc_session";
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 86_400_000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newId = (bytes = 12) => randomBytes(bytes).toString("base64url");

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// The cookie holds a random token; only its hash is stored, so a copy of the
// database cannot be used to sign in.
export async function startSession(userId: string): Promise<void> {
  const token = newId(32);
  const expires = Date.now() + SESSION_MS;
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, expires);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expires),
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      "SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    )
    .get(sha256(token), Date.now()) as User | undefined;
  return row ?? null;
}

const fail = (error: string, status: number) => Response.json({ error }, { status });

// A browser sends Origin on cross-site POSTs; refusing a mismatch stops another
// site from acting with the visitor's session cookie.
export function crossSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return true;
  }
}

interface Bucket {
  times: number[];
  windowMs: number;
}
const buckets = new Map<string, Bucket>();

// Sliding-window limit kept in memory: enough for one server process.
export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const times = (buckets.get(key)?.times ?? []).filter((t) => now - t < windowMs);
  const limited = times.length >= max;
  if (!limited) times.push(now);
  buckets.set(key, { times, windowMs });
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.times.every((t) => now - t >= b.windowMs)) buckets.delete(k);
  }
  return limited;
}

// The caller's address is only believable behind a proxy we run. Without one,
// every visitor shares a bucket, so address-based limits are set loosely and
// the tight limits are keyed on something else (the account being tried).
function clientKey(req: Request): string {
  if (process.env.TRUST_PROXY !== "1") return "direct";
  return req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "direct";
}

type Guard = { ok: true; user: User } | { ok: false; response: Response };

// Every signed-in route starts here. `ai` adds the per-user limit that protects the model budget.
export async function requireUser(req: Request, opts: { role?: User["role"]; ai?: boolean } = {}): Promise<Guard> {
  if (req.method !== "GET" && crossSite(req)) return { ok: false, response: fail("Cross-site request refused.", 403) };
  const user = await currentUser();
  if (!user) return { ok: false, response: fail("Sign in to continue.", 401) };
  if (opts.role && user.role !== opts.role) return { ok: false, response: fail("This is for instructor accounts.", 403) };
  if (opts.ai && rateLimited(`ai:${user.id}`, 40, 60_000)) {
    return { ok: false, response: fail("Too many requests. Wait a minute and try again.", 429) };
  }
  return { ok: true, user };
}

export function publicRouteBlocked(req: Request, bucket: string, max: number, windowMs: number): Response | null {
  if (crossSite(req)) return fail("Cross-site request refused.", 403);
  if (rateLimited(`${bucket}:${clientKey(req)}`, max, windowMs)) return fail("Too many attempts. Wait a few minutes and try again.", 429);
  return null;
}
