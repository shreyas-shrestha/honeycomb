"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { errorText } from "@/lib/client";
import type { User } from "@/lib/types";
import { Notice } from "./ui";

const ROLES: { id: User["role"]; name: string; detail: string }[] = [
  { id: "student", name: "I’m a student", detail: "Study your courses and join classes." },
  { id: "instructor", name: "I teach", detail: "Publish a course and set how the tutor helps." },
];

export function AuthCard({ initial = "signup" }: { initial?: "signup" | "signin" }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState(initial);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<User["role"]>("student");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const creating = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (creating) await signUp({ name, email, password, role });
      else await signIn(email, password);
    } catch (err) {
      setError(errorText(err, creating ? "Could not create the account. Check your connection and try again." : "Could not sign you in. Check your connection and try again."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6 text-left">
      <div className="flex border-b border-line" role="tablist" aria-label="Account">
        {(["signup", "signin"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className="tab" onClick={() => { setMode(m); setError(""); }}>
            {m === "signup" ? "Create account" : "Sign in"}
          </button>
        ))}
      </div>

      {creating && (
        <div>
          <label className="label" htmlFor="auth-name">Name</label>
          <input id="auth-name" className="field" autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="auth-email">Email</label>
        <input id="auth-email" type="email" className="field" autoComplete="email" required placeholder="you@gatech.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="auth-password">Password</label>
        <input id="auth-password" type="password" className="field" autoComplete={creating ? "new-password" : "current-password"} required minLength={creating ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} />
        {creating && <p className="hint mt-1.5">At least 8 characters.</p>}
      </div>

      {creating && (
        <fieldset>
          <legend className="label">How will you use Honeycomb?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLES.map((r) => (
              <label key={r.id} className={`flex cursor-pointer items-start gap-3 rounded-[10px] border p-3 ${role === r.id ? "border-ink bg-honey-soft" : "border-line-strong"}`}>
                <input type="radio" name="role" className="check mt-0.5" checked={role === r.id} onChange={() => setRole(r.id)} />
                <span>
                  <span className="block text-sm font-semibold">{r.name}</span>
                  <span className="block text-sm leading-snug text-muted">{r.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {error && <Notice tone="rose">{error}</Notice>}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "One moment…" : creating ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}
