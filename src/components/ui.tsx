import { pct } from "@/lib/client";

export function Bar({ value, label, tone = "leaf" }: { value: number; label?: string; tone?: "leaf" | "honey" }) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-line"
    >
      <div className={`h-full rounded-full ${tone === "leaf" ? "bg-leaf" : "bg-honey"}`} style={{ width: pct(v) }} />
    </div>
  );
}

export function Notice({ children, tone = "honey" }: { children: React.ReactNode; tone?: "honey" | "rose" | "leaf" }) {
  const cls = tone === "rose" ? "bg-rose-soft border-rose/30" : tone === "leaf" ? "bg-leaf-soft border-leaf/30" : "bg-honey-soft border-honey/40";
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <h1 className="text-lg font-bold">{title}</h1>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </div>
  );
}
