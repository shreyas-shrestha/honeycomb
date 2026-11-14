"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth";
import { isDue } from "@/lib/mastery";
import { useSaveStatus, useStore } from "@/lib/store";

const NAV: { href: string; label: string; short?: string; instructorOnly?: boolean }[] = [
  { href: "/", label: "Courses" },
  { href: "/course", label: "Study plan", short: "Plan" },
  { href: "/review", label: "Review" },
  { href: "/studio", label: "Studio" },
  { href: "/teach", label: "Classes", instructorOnly: true },
];

// Three cells of comb, one already filled: the course map in miniature.
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" stroke="var(--ink)" strokeWidth="1.9" strokeLinejoin="round">
      <polygon points="9.77,4.2 15.31,7.4 15.31,13.8 9.77,17 4.23,13.8 4.23,7.4" fill="var(--honey)" />
      <polygon points="22.23,4.2 27.77,7.4 27.77,13.8 22.23,17 16.69,13.8 16.69,7.4" fill="var(--surface)" />
      <polygon points="16,15 21.54,18.2 21.54,24.6 16,27.8 10.46,24.6 10.46,18.2" fill="var(--surface)" />
    </svg>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const due = useStore((s) => Object.values(s.topicState).filter((t) => isDue(t)).length);
  const save = useSaveStatus();
  const items = NAV.filter((n) => !n.instructorOnly || user?.role === "instructor");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 px-4 sm:px-6">
          <Link href="/" className="flex min-h-[3.5rem] items-center gap-2 font-[family-name:var(--font-display)] text-xl">
            <Logo />
            Honeycomb
          </Link>
          {user && (
            <>
              <nav aria-label="Main" className="order-3 -mx-1 flex w-full justify-between overflow-x-auto sm:order-none sm:mx-0 sm:w-auto sm:justify-start sm:gap-1">
                {items.map((n) => {
                  const on = n.href === "/" ? path === "/" : path.startsWith(n.href) || (n.href === "/course" && path.startsWith("/learn"));
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      aria-current={on ? "page" : undefined}
                      className={`flex min-h-[2.75rem] items-center gap-1.5 whitespace-nowrap border-b-2 px-1.5 text-sm font-medium transition-colors sm:min-h-[3.5rem] sm:px-3 ${on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
                    >
                      {n.short ? <><span className="sm:hidden">{n.short}</span><span className="hidden sm:inline">{n.label}</span></> : n.label}
                      {n.href === "/review" && due > 0 && (
                        <span className="rounded-full bg-honey px-1.5 text-xs font-semibold leading-5 text-ink tabular-nums" aria-label={`${due} due`}>{due}</span>
                      )}
                    </Link>
                  );
                })}
              </nav>
              <div className="ml-auto flex items-center gap-3 text-sm">
                <span className="hidden text-muted md:inline">{user.name}{user.role === "instructor" ? " · Instructor" : ""}</span>
                <button type="button" className="link" onClick={async () => { await signOut(); router.push("/"); }}>Sign out</button>
              </div>
            </>
          )}
        </div>
      </header>
      {user && (save === "retrying" || save === "rejected" || save === "unloaded") && (
        <div className="border-b border-rose/30 bg-rose-soft px-4 py-2 text-center text-sm" role="status">
          {save === "retrying" && "Your latest progress has not been saved yet. Retrying…"}
          {save === "rejected" && "Your latest progress could not be saved. Reload the page and try again."}
          {save === "unloaded" && (
            <>Your saved progress could not be loaded. <button type="button" className="link" onClick={() => window.location.reload()}>Reload</button></>
          )}
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="px-4 py-6 text-center text-xs text-muted">
        Honeycomb is an independent student project. It is not affiliated with or endorsed by the Georgia Institute of Technology.
      </footer>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Frame>{children}</Frame>
    </AuthProvider>
  );
}
