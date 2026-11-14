import { z } from "zod";
import { hashPassword, newId, publicRouteBlocked, startSession } from "@/lib/server/auth";
import { parseBody } from "@/lib/server/body";
import { one, run } from "@/lib/server/db";
import type { User } from "@/lib/types";

const Body = z.object({
  name: z.string().trim().min(1, "is required").max(80),
  email: z.string().trim().toLowerCase().max(200).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "is not a valid email address"),
  password: z.string().min(8, "must be at least 8 characters").max(200),
  role: z.enum(["student", "instructor"]),
});

const TAKEN = "An account with that email already exists. Sign in instead.";

export async function POST(req: Request) {
  const blocked = publicRouteBlocked(req, "signup", 30, 10 * 60_000);
  if (blocked) return blocked;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { name, email, password, role } = body.data;

  if (await one("SELECT 1 FROM users WHERE email = ?", email)) {
    return Response.json({ error: TAKEN }, { status: 409 });
  }
  const user: User = { id: newId(), email, name, role };
  const hash = await hashPassword(password);
  try {
    await run("INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)", user.id, email, name, role, hash, Date.now());
  } catch (e) {
    // Two requests for the same email can both pass the check above; the second insert fails here.
    if (e instanceof Error && e.message.includes("users.email")) return Response.json({ error: TAKEN }, { status: 409 });
    throw e;
  }
  await startSession(user.id);
  return Response.json({ user });
}
