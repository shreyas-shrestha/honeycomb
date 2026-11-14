import { z } from "zod";
import { hashPassword, publicRouteBlocked, rateLimited, startSession, verifyPassword } from "@/lib/server/auth";
import { parseBody } from "@/lib/server/body";
import { one } from "@/lib/server/db";
import type { User } from "@/lib/types";

const Body = z.object({
  email: z.string().trim().toLowerCase().max(200),
  password: z.string().max(200),
});

// Verified against when the email is unknown, so both failures take the same time.
const decoy = hashPassword("not-a-real-password");

export async function POST(req: Request) {
  const blocked = publicRouteBlocked(req, "login", 60, 5 * 60_000);
  if (blocked) return blocked;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const { email, password } = body.data;
  // The tight limit is per account, so guessing one password does not lock anyone else out.
  if (rateLimited(`login:${email}`, 8, 5 * 60_000)) {
    return Response.json({ error: "Too many attempts for that account. Wait a few minutes and try again." }, { status: 429 });
  }

  const row = await one<User & { password_hash: string }>("SELECT id, email, name, role, password_hash FROM users WHERE email = ?", email);
  const ok = await verifyPassword(password, row?.password_hash ?? (await decoy));
  if (!row || !ok) return Response.json({ error: "That email and password do not match an account." }, { status: 401 });

  await startSession(row.id);
  const user: User = { id: row.id, email: row.email, name: row.name, role: row.role };
  return Response.json({ user });
}
