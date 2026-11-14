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

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const due = useStore((s) => Object.values(s.topicState).filter((t) => isDue(t)).length);
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" fill="var(--honey)" />
              <path d="M12 7.5l4 2.3v4.4l-4 2.3-4-2.3V9.8z" fill="var(--ink)" />
            </svg>
            Hive
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
            {NAV.map((n) => {
              const on = n.href === "/" ? path === "/" : path.startsWith(n.href) || (n.href === "/course" && path.startsWith("/learn"));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${on ? "bg-honey-soft text-ink" : "text-muted hover:text-ink"}`}
                >
                  {n.label}
                  {n.href === "/review" && due > 0 && (
                    <span className="ml-1.5 rounded-full bg-honey px-1.5 py-0.5 text-xs font-bold text-ink">{due}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      <footer className="border-t border-line px-4 py-4 text-center text-xs text-muted">
        Hive is an independent student project. It is not affiliated with or endorsed by the Georgia Institute of Technology.
      </footer>
    </>
  );
}
