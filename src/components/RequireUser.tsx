"use client";

import { useAuth } from "@/lib/auth";
import { AuthCard } from "./AuthCard";
import { Loading } from "./ui";

// Wraps a signed-in screen: waits for the session check, and offers sign-in when there is none.
export function RequireUser({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user === undefined) return <Loading />;
  if (user === null) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <p className="text-center text-sm text-muted">Sign in to see this page.</p>
        <AuthCard initial="signin" />
      </div>
    );
  }
  return children;
}
