"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isDue } from "@/lib/mastery";
import { useStore } from "@/lib/store";

const NAV = [
  { href: "/", label: "Courses" },
  { href: "/course", label: "Study plan" },
  { href: "/review", label: "Review" },
  { href: "/teach", label: "Instructors" },
];

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.6l9 5.2v10.4l-9 5.2-9-5.2V6.8z" fill="var(--honey)" stroke="var(--honey-edge)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M12 7.6l3.8 2.2v4.4L12 16.4l-3.8-2.2V9.8z" fill="var(--ink)" />
    </svg>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const due = useStore((s) => Object.values(s.topicState).filter((t) => isDue(t)).length);
  return (
    <div className="glow flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4 sm:px-6">
        <Link href="/" className="flex min-h-[2.75rem] items-center gap-2 rounded-xl border border-line bg-surface px-3 font-medium tracking-tight">
          <Logo />
          Honeycomb
        </Link>
        <nav aria-label="Main" className="grid w-full grid-cols-4 gap-0.5 rounded-xl border border-line bg-surface p-1 sm:flex sm:w-auto">
          {NAV.map((n) => {
            const on = n.href === "/" ? path === "/" : path.startsWith(n.href) || (n.href === "/course" && path.startsWith("/learn"));
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-[2.125rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1 text-[0.8125rem] font-medium transition-colors sm:px-3 sm:text-sm ${on ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
              >
                {n.label}
                {n.href === "/review" && due > 0 && (
                  <span className="rounded-full bg-honey px-1.5 text-xs font-semibold leading-5 text-ink tabular-nums" aria-label={`${due} due`}>{due}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <footer className="px-4 py-6 text-center text-xs text-faint">
        Honeycomb is an independent student project. It is not affiliated with or endorsed by the Georgia Institute of Technology.
      </footer>
    </div>
  );
}
