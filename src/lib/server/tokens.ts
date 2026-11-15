import type { User } from "../types";
import { newId, sha256 } from "./auth";
import { all, one, run } from "./db";

const MAX_TOKENS = 5;
const PREFIX = "hc_";

export interface TokenInfo {
  id: string; // the first characters of the hash: enough to name a token, useless for signing in
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

// A personal access token lets an AI assistant act as this student through the
// MCP server. Like a session, only its hash is stored. Returns null at the limit.
export async function createToken(userId: string, name: string): Promise<string | null> {
  const held = (await one<{ n: number }>("SELECT COUNT(*) AS n FROM tokens WHERE user_id = ?", userId))?.n ?? 0;
  if (held >= MAX_TOKENS) return null;
  const token = PREFIX + newId(32);
  await run("INSERT INTO tokens (hash, user_id, name, created_at) VALUES (?, ?, ?, ?)", sha256(token), userId, name, Date.now());
  return token;
}

export async function listTokens(userId: string): Promise<TokenInfo[]> {
  const rows = await all<{ hash: string; name: string; created_at: number; last_used_at: number | null }>("SELECT hash, name, created_at, last_used_at FROM tokens WHERE user_id = ? ORDER BY created_at DESC", userId);
  return rows.map((r) => ({ id: r.hash.slice(0, 12), name: r.name, createdAt: r.created_at, lastUsedAt: r.last_used_at }));
}

export async function revokeToken(userId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f]{12}$/.test(id)) return false;
  return (await run("DELETE FROM tokens WHERE user_id = ? AND hash LIKE ?", userId, `${id}%`)) > 0;
}

// The account a bearer token belongs to, from an Authorization header.
export async function userForToken(header: string | null): Promise<User | null> {
  const token = header?.match(/^Bearer\s+(hc_[A-Za-z0-9_-]{20,})$/)?.[1];
  if (!token) return null;
  const hash = sha256(token);
  const row = await one<User>("SELECT u.id, u.email, u.name, u.role FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.hash = ?", hash);
  if (!row) return null;
  await run("UPDATE tokens SET last_used_at = ? WHERE hash = ?", Date.now(), hash);
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}
