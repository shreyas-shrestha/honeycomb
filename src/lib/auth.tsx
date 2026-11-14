"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getJSON, postJSON } from "./client";
import { flushStore, loadStore, resetStore } from "./store";
import type { User } from "./types";

interface Auth {
  // undefined while the session is being checked, null when signed out.
  user: User | null | undefined;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { name: string; email: string; password: string; role: User["role"] }) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const enter = useCallback(async (u: User | null) => {
    if (u) await loadStore(u.id);
    else resetStore();
    setUser(u);
  }, []);

  useEffect(() => {
    let live = true;
    getJSON<{ user: User | null }>("/api/auth/me")
      .then(({ user: u }) => {
        if (live) return enter(u);
      })
      .catch(() => {
        if (live) setUser(null);
      });
    return () => {
      live = false;
    };
  }, [enter]);

  const value = useMemo<Auth>(
    () => ({
      user,
      signIn: async (email, password) => enter((await postJSON<{ user: User }>("/api/auth/login", { email, password })).user),
      signUp: async (input) => enter((await postJSON<{ user: User }>("/api/auth/signup", input)).user),
      signOut: async () => {
        await flushStore();
        await postJSON("/api/auth/logout", {});
        await enter(null);
      },
    }),
    [user, enter],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(Ctx);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
}

// For screens that only render once someone is signed in.
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("useUser needs a signed-in user");
  return user;
}
