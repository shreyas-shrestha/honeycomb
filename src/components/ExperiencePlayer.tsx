"use client";

import { useEffect, useRef, useState } from "react";
import type { Block, BlockKind } from "@/lib/types";
import { Markdown } from "./Markdown";
import { Mark } from "./ui";

type Of<K extends BlockKind> = Extract<Block, { kind: K }>;
interface BlockProps<K extends BlockKind> {
  block: Of<K>;
  onDone: () => void;
}

export const BLOCK_LABEL: Record<BlockKind, string> = {
  text: "Read",
  check: "Quick check",
  trace: "Step through",
  order: "Put in order",
  fill: "Fill the blanks",
  match: "Match",
  reveal: "Explain it",
};

// A repeatable shuffle: the same items always come out in the same order, so
// rendering stays pure and a re-render never reshuffles under the learner.
function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const out = items.map((item, i) => ({ item, i, key: next() })).sort((a, b) => a.key - b.key);
  // Never hand back the original order: that would be the answer.
  if (out.length > 1 && out.every((x, i) => x.i === i)) out.push(out.shift()!);
  return out.map((x) => x.item);
}

// The hexagon used for progress here and for the session stages.
export function Hex({ state }: { state: "done" | "now" | "todo" }) {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true">
      <path d="M9 1l7.8 4.5v9L9 19l-7.8-4.5v-9z" fill={state === "done" ? "var(--honey)" : "var(--surface)"} stroke={state === "todo" ? "var(--line-ui)" : "var(--ink)"} strokeWidth={state === "now" ? 2 : 1.25} />
    </svg>
  );
}

// A small round marker: a number while building, a tick or cross once judged.
function Badge({ state, children }: { state?: "right" | "wrong"; children: React.ReactNode }) {
  const cls = state === "right" ? "bg-leaf" : state === "wrong" ? "bg-rose" : "bg-ink";
  return (
    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-surface ${cls}`}>
      {state === "right" ? <Mark kind="check" /> : state === "wrong" ? <Mark kind="cross" /> : children}
    </span>
  );
}

type Outcome = "correct" | "shown" | "wrong";

function Why({ outcome, children }: { outcome: Outcome; children: string }) {
  const ok = outcome !== "wrong";
  const label = outcome === "correct" ? "Correct" : outcome === "shown" ? "Here is the answer" : "Not yet";
  return (
    <div className={`mt-4 rounded-[10px] border px-4 py-3 ${ok ? "border-leaf/30 bg-leaf-soft" : "border-rose/30 bg-rose-soft"}`} role="status">
      <p className={`text-sm font-semibold ${ok ? "text-leaf" : "text-rose"}`}>{outcome !== "shown" && <Mark kind={ok ? "check" : "cross"} />} {label}</p>
      {children && <Markdown className="prose-sm mt-1">{children}</Markdown>}
    </div>
  );
}

// Shared by the activities that are built up and then checked.
function CheckRow({ ready, wrong, wrongText, onCheck, onRetry, onShow }: { ready: boolean; wrong: boolean; wrongText: string; onCheck: () => void; onRetry: () => void; onShow: () => void }) {
  return wrong ? (
    <div className="mt-4 flex flex-wrap items-center gap-3" role="status">
      <span className="text-sm font-semibold text-rose"><Mark kind="cross" /> Not yet. {wrongText}</span>
      <button type="button" className="btn btn-sm" onClick={onRetry}>Try again</button>
      <button type="button" className="link" onClick={onShow}>Show the answer</button>
    </div>
  ) : (
    <button type="button" className="btn btn-sm mt-4" disabled={!ready} onClick={onCheck}>Check</button>
  );
}

function TextBlock({ block }: BlockProps<"text">) {
  return (
    <>
      {block.title && <h3 className="card-title mb-2">{block.title}</h3>}
      <Markdown>{block.body}</Markdown>
    </>
  );
}

function CheckBlock({ block, onDone }: BlockProps<"check">) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <>
      <Markdown>{block.prompt}</Markdown>
      <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Options">
        {block.options.map((o, i) => {
          const state = picked === null ? undefined : i === block.answer ? "right" : i === picked ? "wrong" : undefined;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={picked === i}
              disabled={picked !== null}
              data-state={state}
              className="choice"
              onClick={() => {
                setPicked(i);
                onDone();
              }}
            >
              {state ? <Badge state={state}>{null}</Badge> : (
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-ui text-xs font-semibold">{String.fromCharCode(65 + i)}</span>
              )}
              <Markdown className="min-w-0 flex-1">{o}</Markdown>
            </button>
          );
        })}
      </div>
      {picked !== null && <Why outcome={picked === block.answer ? "correct" : "wrong"}>{block.why}</Why>}
    </>
  );
}

const EMPTY_CELL = "·";
const TREE_W = 320;
const LEVEL_H = 58;
const NODE_R = 19;

// The cells drawn as a binary tree in level order. A leading "_" means the
// array is 1-indexed and its first slot is unused, as in a CS 1332 heap.
function TraceTree({ cells, active, changed, frame }: { cells: string[]; active: number[]; changed: boolean[]; frame: number }) {
  const offset = cells[0] === "_" ? 1 : 0;
  const place = (i: number) => {
    const k = i - offset + 1; // 1-based position in the tree
    const level = Math.floor(Math.log2(k));
    return { x: ((k - 2 ** level + 0.5) / 2 ** level) * TREE_W, y: NODE_R + 6 + level * LEVEL_H };
  };
  const shown = cells.map((value, i) => ({ value, i })).filter((n) => n.i >= offset && n.value !== EMPTY_CELL && n.value !== "");
  const has = new Set(shown.map((n) => n.i));
  const height = Math.max(...shown.map((n) => place(n.i).y), NODE_R) + NODE_R + 8;
  return (
    <svg viewBox={`0 0 ${TREE_W} ${height}`} className="mx-auto w-full max-w-sm" role="img" aria-label={`Tree with values ${shown.map((n) => n.value).join(", ")}`}>
      {shown.map((n) => {
        const parent = offset + Math.floor((n.i - offset - 1) / 2);
        if (n.i === offset || !has.has(parent)) return null;
        const from = place(parent);
        const to = place(n.i);
        return <line key={`e${n.i}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--line-ui)" strokeWidth="1.5" />;
      })}
      {shown.map((n) => {
        const { x, y } = place(n.i);
        const on = active.includes(n.i);
        return (
          // The key changes with the frame for a node whose value changed, which replays its animation.
          <g key={changed[n.i] ? `n${n.i}:${frame}` : `n${n.i}`} transform={`translate(${x} ${y})`} className={changed[n.i] ? "node-pop" : undefined}>
            <circle r={NODE_R} fill={on ? "var(--honey)" : "var(--surface)"} stroke={on ? "var(--ink)" : "var(--line-ui)"} strokeWidth={on ? 2 : 1.5} style={{ transition: "fill 0.25s ease" }} />
            <text textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight={on ? 700 : 500} fill="var(--ink)" style={{ fontFamily: "var(--font-code), monospace" }}>{n.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

const FRAME_MS = 2800;

function TraceBlock({ block, onDone }: BlockProps<"trace">) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frame = block.frames[i];
  const last = block.frames.length - 1;
  const before = i > 0 ? block.frames[i - 1].cells : frame.cells;
  const changed = frame.cells.map((c, k) => i > 0 && c !== before[k]);

  const go = (n: number) => {
    setI(n);
    if (n === last) {
      setPlaying(false);
      onDone();
    }
  };
  // Autoplay advances one frame at a time until the end or until paused.
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => go(i + 1), FRAME_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, i]);

  return (
    <>
      {block.title && <h3 className="card-title mb-3">{block.title}</h3>}
      {block.shape === "tree" && (
        <div className="mb-3 rounded-[10px] bg-paper px-3 py-3">
          <TraceTree cells={frame.cells} active={frame.active} changed={changed} frame={i} />
        </div>
      )}
      <div className="overflow-x-auto rounded-[10px] bg-paper px-3 pb-3 pt-4">
        <div className="flex w-max min-w-full gap-1 sm:gap-1.5">
          {frame.cells.map((c, k) => (
            <div key={k} className="flex flex-col items-center gap-1">
              <div key={changed[k] ? `${k}:${i}` : k} className="cell" data-on={frame.active.includes(k)} data-changed={changed[k]}>{c}</div>
              <span className="font-mono text-xs text-muted">{k}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 min-h-[4.5rem]" aria-live={playing ? "off" : "polite"}>
        <Markdown>{frame.caption}</Markdown>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => { setPlaying(false); go(i - 1); }}>Back</button>
        <button type="button" className={`btn btn-sm ${i === last ? "" : "btn-primary"}`} disabled={i === last} onClick={() => { setPlaying(false); go(i + 1); }}>Next frame</button>
        <button type="button" className="btn btn-sm" aria-pressed={playing} onClick={() => (i === last ? (setI(0), setPlaying(true)) : setPlaying(!playing))}>
          {playing ? "Pause" : i === last ? "Replay" : "Play"}
        </button>
        <span className="text-sm tabular-nums text-muted">Frame {i + 1} of {block.frames.length}</span>
      </div>
    </>
  );
}

function OrderBlock({ block, onDone }: BlockProps<"order">) {
  const [pool] = useState(() => shuffled(block.steps.map((_, i) => i), block.steps.join("|")));
  const [placed, setPlaced] = useState<number[]>([]);
  const [status, setStatus] = useState<"building" | "wrong" | Exclude<Outcome, "wrong">>("building");
  const left = pool.filter((i) => !placed.includes(i));
  const done = status === "correct" || status === "shown";
  const finish = (how: "correct" | "shown") => {
    setStatus(how);
    onDone();
  };

  return (
    <>
      <Markdown>{block.prompt}</Markdown>
      <ol className="mt-4 grid gap-2" aria-label="Your order">
        {placed.map((i, pos) => {
          const state = done ? "right" : status === "wrong" ? (block.steps[i] === block.steps[pos] ? "right" : "wrong") : undefined;
          return (
            <li key={i}>
              <button type="button" className="choice" data-state={state} disabled={status !== "building"} aria-label={`Step ${pos + 1}: take it back`} onClick={() => setPlaced(placed.filter((x) => x !== i))}>
                <Badge state={state}>{pos + 1}</Badge>
                <Markdown className="min-w-0 flex-1">{block.steps[i]}</Markdown>
              </button>
            </li>
          );
        })}
      </ol>
      {left.length > 0 && (
        <>
          <p className="hint mb-2 mt-4">{placed.length === 0 ? "Tap the step that comes first." : "Tap what comes next. Tap a placed step to take it back."}</p>
          <div className="grid gap-2">
            {left.map((i) => (
              <button key={i} type="button" className="choice border-dashed" onClick={() => setPlaced([...placed, i])}>
                <Markdown className="min-w-0 flex-1">{block.steps[i]}</Markdown>
              </button>
            ))}
          </div>
        </>
      )}
      {done ? (
        <Why outcome={status}>{block.why}</Why>
      ) : (
        <CheckRow
          ready={left.length === 0}
          wrong={status === "wrong"}
          wrongText="The steps marked with a cross are out of place."
          onCheck={() => (placed.every((i, pos) => block.steps[i] === block.steps[pos]) ? finish("correct") : setStatus("wrong"))}
          onRetry={() => {
            setPlaced([]);
            setStatus("building");
          }}
          onShow={() => {
            setPlaced(block.steps.map((_, i) => i));
            finish("shown");
          }}
        />
      )}
    </>
  );
}

function FillBlock({ block, onDone }: BlockProps<"fill">) {
  const [bank] = useState(() => shuffled(block.bank, block.bank.join("|")));
  const [filled, setFilled] = useState<(string | null)[]>(() => block.blanks.map(() => null));
  const [status, setStatus] = useState<"building" | "wrong" | Exclude<Outcome, "wrong">>("building");
  const done = status === "correct" || status === "shown";
  const nextEmpty = filled.indexOf(null);
  // A word goes into the first empty blank, or replaces the last one when all are full.
  const target = nextEmpty === -1 ? filled.length - 1 : nextEmpty;
  const finish = (how: "correct" | "shown") => {
    setStatus(how);
    onDone();
  };

  return (
    <>
      <Markdown>{block.prompt}</Markdown>
      {!done && <p className="hint mb-1 mt-4">Tap a word to fill the outlined blank. Tap a filled blank to clear it.</p>}
      <p className="mt-2 text-lg leading-[3]">
        {block.parts.map((part, i) => {
          const bad = status === "wrong" && filled[i] !== block.blanks[i];
          return (
            <span key={i}>
              {part}
              {i < block.blanks.length && (
                <button
                  type="button"
                  disabled={status !== "building" || filled[i] === null}
                  aria-label={filled[i] ? `Blank ${i + 1}: ${filled[i]}${bad ? ", wrong" : ""}. Tap to clear` : `Blank ${i + 1}, empty`}
                  className={`mx-1 inline-flex min-h-[2.75rem] min-w-[5.5rem] items-center justify-center rounded-[10px] border-2 px-3 align-middle text-base font-semibold ${
                    done ? "border-leaf bg-leaf-soft" : bad ? "border-rose bg-rose-soft" : filled[i] ? "border-ink bg-honey-soft" : `border-dashed ${i === target ? "border-ink" : "border-muted"}`
                  }`}
                  onClick={() => setFilled(filled.map((f, k) => (k === i ? null : f)))}
                >
                  {bad && <Mark kind="cross" />}{bad && " "}
                  {filled[i] ?? ""}
                </button>
              )}
            </span>
          );
        })}
      </p>
      {!done && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Word bank">
          {bank.map((w) => (
            <button key={w} type="button" className="chip" disabled={status !== "building" || filled.includes(w)} onClick={() => setFilled(filled.map((f, k) => (k === target ? w : f)))}>
              {w}
            </button>
          ))}
        </div>
      )}
      {done ? (
        <Why outcome={status}>{block.why}</Why>
      ) : (
        <CheckRow
          ready={nextEmpty === -1}
          wrong={status === "wrong"}
          wrongText="The blanks marked with a cross are wrong."
          onCheck={() => (filled.every((f, i) => f === block.blanks[i]) ? finish("correct") : setStatus("wrong"))}
          onRetry={() => {
            setFilled(filled.map((f, i) => (f === block.blanks[i] ? f : null)));
            setStatus("building");
          }}
          onShow={() => {
            setFilled([...block.blanks]);
            finish("shown");
          }}
        />
      )}
    </>
  );
}

function MatchBlock({ block, onDone }: BlockProps<"match">) {
  const [order] = useState(() => shuffled(block.pairs.map((_, i) => i), block.pairs.map((p) => p.right).join("|")));
  const [left, setLeft] = useState<number | null>(null);
  const [matched, setMatched] = useState<number[]>([]);
  const [miss, setMiss] = useState<{ left: number; right: number } | null>(null);
  const done = matched.length === block.pairs.length;
  // Once everything is matched the right column lines up with its partners, so the pairs can be read across.
  const rights = done ? block.pairs.map((_, i) => i) : order;

  function pickRight(r: number) {
    if (left === null) return;
    // Compared by text, so two rows that read the same can never be marked wrong.
    if (block.pairs[r].right === block.pairs[left].right) {
      const next = [...matched, left];
      setMatched(next);
      setMiss(null);
      if (next.length === block.pairs.length) onDone();
    } else setMiss({ left, right: r });
    setLeft(null);
  }
  const state = (side: "left" | "right", i: number) => (matched.includes(i) ? "right" : miss?.[side] === i ? "wrong" : undefined);
  // Matched tiles carry the same number on both sides.
  const tile = (side: "left" | "right", i: number, text: string) => (
    <>
      {matched.includes(i) ? <Badge>{i + 1}</Badge> : miss?.[side] === i ? <Badge state="wrong">{null}</Badge> : null}
      <Markdown className="prose-sm min-w-0 flex-1">{text}</Markdown>
    </>
  );

  return (
    <>
      <Markdown>{block.prompt}</Markdown>
      <p className="hint mb-2 mt-4" aria-live="polite">
        {done ? "All matched. Each number marks a pair." : left === null ? "Tap an item on the left." : "Now tap its match on the right."}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:gap-x-3">
        {block.pairs.map((p, row) => {
          const r = rights[row];
          return (
            <div key={row} className="contents">
              <button type="button" className="choice h-full items-center" aria-pressed={left === row} data-state={state("left", row)} disabled={matched.includes(row)} onClick={() => { setLeft(row); setMiss(null); }}>
                {tile("left", row, p.left)}
              </button>
              <button type="button" className="choice h-full items-center" data-state={state("right", r)} disabled={matched.includes(r) || left === null} onClick={() => pickRight(r)}>
                {tile("right", r, block.pairs[r].right)}
              </button>
            </div>
          );
        })}
      </div>
      {miss && <p className="mt-3 text-sm font-semibold text-rose" role="status"><Mark kind="cross" /> Those two do not go together. Try another.</p>}
    </>
  );
}

function RevealBlock({ block, onDone }: BlockProps<"reveal">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Markdown>{block.prompt}</Markdown>
      {open ? (
        <div className="mt-4 rounded-[10px] border border-line bg-paper px-4 py-3">
          <p className="card-title mb-1">Compare with yours</p>
          <Markdown>{block.answer}</Markdown>
        </div>
      ) : (
        <button type="button" className="btn btn-sm mt-4" onClick={() => { setOpen(true); onDone(); }}>
          Show the answer
        </button>
      )}
    </>
  );
}

function BlockView({ block, onDone }: { block: Block; onDone: () => void }) {
  switch (block.kind) {
    case "text": return <TextBlock block={block} onDone={onDone} />;
    case "check": return <CheckBlock block={block} onDone={onDone} />;
    case "trace": return <TraceBlock block={block} onDone={onDone} />;
    case "order": return <OrderBlock block={block} onDone={onDone} />;
    case "fill": return <FillBlock block={block} onDone={onDone} />;
    case "match": return <MatchBlock block={block} onDone={onDone} />;
    case "reveal": return <RevealBlock block={block} onDone={onDone} />;
  }
}

interface PlayerProps {
  blocks: Block[];
  finishLabel: string;
  onFinish: () => void;
  onRestart?: () => void; // shown beside the finish button when given
}

// Plays an interactive lesson one step at a time; each step unlocks the next.
// Give it a key that changes with the lesson so a new lesson starts fresh.
export function ExperiencePlayer({ blocks, finishLabel, onFinish, onRestart }: PlayerProps) {
  const [at, setAt] = useState(0);
  const [solved, setSolved] = useState<number[]>([]);
  const newest = useRef<HTMLElement>(null);
  const index = Math.min(at, blocks.length - 1);
  const ready = blocks[index].kind === "text" || solved.includes(index);
  const isLast = index === blocks.length - 1;

  // Bring each newly unlocked step to the top of the screen.
  useEffect(() => {
    if (at > 0) newest.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [at]);

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-3 bg-paper/95 px-1 py-2 backdrop-blur">
        <div className="flex gap-0.5" role="img" aria-label={`Step ${index + 1} of ${blocks.length}`}>
          {blocks.map((_, i) => <Hex key={i} state={i < index ? "done" : i === index ? "now" : "todo"} />)}
        </div>
        <span className="text-sm tabular-nums text-muted">{index + 1} of {blocks.length}</span>
      </div>
      <div className="space-y-4">
        {blocks.slice(0, index + 1).map((b, i) => (
          <section
            key={i}
            ref={i === index ? newest : undefined}
            // Finished steps stay readable but can no longer be operated.
            inert={i < index}
            className={`card scroll-mt-14 p-5 sm:p-6 ${i < index ? "bg-paper shadow-none" : ""}`}
            aria-label={`${BLOCK_LABEL[b.kind]}, step ${i + 1}`}
          >
            <p className="eyebrow mb-3">{BLOCK_LABEL[b.kind]}</p>
            <BlockView block={b} onDone={() => setSolved((s) => (s.includes(i) ? s : [...s, i]))} />
          </section>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        {!ready && <span className="text-sm text-muted">Finish this step to continue</span>}
        {isLast && ready && onRestart && <button type="button" className="link" onClick={onRestart}>Start over</button>}
        <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={!ready} onClick={() => (isLast ? onFinish() : setAt(index + 1))}>
          {isLast ? finishLabel : "Continue"}
        </button>
      </div>
    </div>
  );
}
