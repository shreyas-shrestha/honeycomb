"use client";

export interface HexTopic {
  id: string;
  title: string;
  mastery: number; // 0..1 readiness: what the learner could do today
  due: boolean;
  locked: boolean;
}

const R = 30; // hexagon radius
const W = Math.sqrt(3) * R;
const COLS = 6;
const points = (r: number) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (60 * k - 90);
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
const CELL = points(R * 0.94);
const SWATCH = points(7);

type Look = "locked" | "new" | "learning" | "strong";
const lookOf = (t: HexTopic): Look => (t.locked ? "locked" : t.mastery >= 0.8 ? "strong" : t.mastery > 0 ? "learning" : "new");
const LOOKS: Record<Look, { label: string; fill: string; stroke: string }> = {
  new: { label: "Not started", fill: "var(--surface)", stroke: "var(--line-ui)" },
  learning: { label: "Learning", fill: "var(--honey-soft)", stroke: "var(--honey-edge)" },
  strong: { label: "Strong", fill: "var(--honey)", stroke: "var(--honey-edge)" },
  locked: { label: "Locked", fill: "var(--paper)", stroke: "var(--line)" },
};

const describe = (t: HexTopic) =>
  `${t.title}: ${t.locked ? "locked" : `${Math.round(t.mastery * 100)}% ready`}${t.due ? ", review due" : ""}`;

// The course as a honeycomb: one cell per topic in syllabus order, filling with
// honey as the topic is learned. The number in each cell matches the topic list.
export function HexMap({ topics, selectedId, onSelect }: { topics: HexTopic[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const rows = Math.ceil(topics.length / COLS);
  const width = COLS * W + W / 2 + 8;
  const height = rows * R * 1.5 + R * 0.5 + 8;
  const used = new Set(topics.map(lookOf));
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto w-full max-w-md" role="group" aria-label="Course map, one cell per topic">
        {topics.map((t, i) => {
          const row = Math.floor(i / COLS);
          const x = 4 + W / 2 + (i % COLS) * W + (row % 2 ? W / 2 : 0);
          const y = 4 + R + row * R * 1.5;
          const on = t.id === selectedId;
          const look = LOOKS[lookOf(t)];
          return (
            <g
              key={t.id}
              transform={`translate(${x} ${y})`}
              role="button"
              tabIndex={0}
              aria-label={describe(t)}
              aria-pressed={on}
              className="cursor-pointer outline-none [&:focus-visible>polygon]:stroke-[3]"
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(t.id);
                }
              }}
            >
              <polygon points={CELL} fill={look.fill} stroke={on ? "var(--ink)" : look.stroke} strokeWidth={on ? 2.5 : 1.25} />
              <text textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="600" fill={t.locked ? "var(--faint)" : "var(--ink)"}>
                {i + 1}
              </text>
              {t.due && <circle cx="0" cy={-R * 0.62} r="3.5" fill="var(--ink)" />}
            </g>
          );
        })}
      </svg>
      <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
        {(Object.keys(LOOKS) as Look[]).filter((k) => used.has(k)).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="-8 -8 16 16"><polygon points={SWATCH} fill={LOOKS[k].fill} stroke={LOOKS[k].stroke} strokeWidth="1.25" /></svg>
            {LOOKS[k].label}
          </li>
        ))}
        {topics.some((t) => t.due) && (
          <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-ink" />Review due</li>
        )}
      </ul>
    </div>
  );
}
