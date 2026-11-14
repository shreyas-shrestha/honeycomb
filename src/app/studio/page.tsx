"use client";

import Link from "next/link";
import { RequireUser } from "@/components/RequireUser";
import { useEffect, useRef, useState } from "react";
import { BLOCK_LABEL, ExperiencePlayer } from "@/components/ExperiencePlayer";
import { blockProblem, MAX_BLOCKS } from "@/lib/blocks";
import { Empty, Mark, Notice } from "@/components/ui";
import { errorText, postJSON, topicContext, useAiStatus } from "@/lib/client";
import { actions, useStore } from "@/lib/store";
import type { Block, BlockKind, Course, Topic } from "@/lib/types";

const KINDS: { id: BlockKind; what: string }[] = [
  { id: "check", what: "A question answered on the spot" },
  { id: "trace", what: "A process shown one state at a time" },
  { id: "order", what: "Steps to arrange in sequence" },
  { id: "fill", what: "A rule with blanks and a word bank" },
  { id: "match", what: "Pairs to connect" },
  { id: "text", what: "A short explanation" },
  { id: "reveal", what: "Answer in your head, then compare" },
];

const plain = (s: string) => s.replace(/```\w*/g, "").replace(/[`*_$#>\\]/g, "").replace(/\s+/g, " ").trim();
const summary = (b: Block) => plain(b.kind === "text" ? b.title || b.body : b.kind === "trace" ? b.title : b.prompt).slice(0, 90);

// The step kinds simple enough to write by hand in three fields.
type Manual = "text" | "check" | "order" | "match" | "reveal";
const MANUAL: Record<Manual, { first: string; second: string; secondHint: string; third?: string }> = {
  text: { first: "Heading", second: "Explanation", secondHint: "Markdown and $math$ work." },
  check: { first: "Question", second: "Options", secondHint: "One per line. Start the correct one with an asterisk and a space, like: * 42", third: "Shown after answering" },
  order: { first: "Instruction", second: "Steps", secondHint: "Three to eight, one per line, in the correct order. They are shuffled when played.", third: "Shown once it is solved" },
  match: { first: "Instruction", second: "Pairs", secondHint: "Three to six, one per line, written as left = right with spaces around the equals sign.", third: undefined },
  reveal: { first: "Question", second: "Answer to compare with", secondHint: "Shown when the learner asks to see it." },
};

function buildManual(kind: Manual, first: string, second: string, third: string): Block | string {
  const lines = second.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!first.trim() && kind !== "text") return "Fill in the first field.";
  switch (kind) {
    case "text":
      return second.trim() ? { kind, title: first.trim(), body: second.trim() } : "Write the explanation.";
    case "check": {
      // "* " marks the answer; a bare leading asterisk is left alone because it can be Markdown emphasis.
      const answer = lines.findIndex((l) => l.startsWith("* "));
      if (lines.length < 2 || answer < 0) return "Give at least two options and start the correct one with an asterisk and a space.";
      return { kind, prompt: first.trim(), options: lines.map((l, i) => (i === answer ? l.slice(2).trim() : l)), answer, why: third.trim() };
    }
    case "order":
      return { kind, prompt: first.trim(), steps: lines, why: third.trim() };
    case "match": {
      // Split at the first " = " so an equals sign inside a formula on the right is kept.
      const pairs = lines.map((l) => [l.slice(0, l.indexOf(" = ")), l.slice(l.indexOf(" = ") + 3)]).filter(([left], i) => lines[i].includes(" = ") && left.trim());
      if (pairs.length !== lines.length) return "Write each pair on its own line as left = right.";
      return { kind, prompt: first.trim(), pairs: pairs.map(([left, right]) => ({ left: left.trim(), right: right.trim() })) };
    }
    case "reveal":
      return second.trim() ? { kind, prompt: first.trim(), answer: second.trim() } : "Write the answer.";
  }
}

function AddStep({ onAdd, onCancel }: { onAdd: (b: Block) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<Manual>("check");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [third, setThird] = useState("");
  const [error, setError] = useState("");
  const f = MANUAL[kind];

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const built = buildManual(kind, first, second, third);
        if (typeof built === "string") return setError(built);
        // The same check the server applies when a class is published.
        const problem = blockProblem(built);
        if (problem) return setError(problem);
        onAdd(built);
        setFirst("");
        setSecond("");
        setThird("");
        setError("");
      }}
    >
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind of step">
        {(Object.keys(MANUAL) as Manual[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className="chip" onClick={() => { setKind(k); setError(""); }}>{BLOCK_LABEL[k]}</button>
        ))}
      </div>
      <div>
        <label className="label" htmlFor="step-first">{f.first}</label>
        <input id="step-first" className="field" value={first} onChange={(e) => setFirst(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="step-second">{f.second}</label>
        <textarea id="step-second" className="field min-h-24" value={second} onChange={(e) => setSecond(e.target.value)} />
        <p className="hint mt-1">{f.secondHint}</p>
      </div>
      {f.third && (
        <div>
          <label className="label" htmlFor="step-third">{f.third}</label>
          <input id="step-third" className="field" value={third} onChange={(e) => setThird(e.target.value)} />
        </div>
      )}
      {error && <Notice tone="rose">{error}</Notice>}
      <div className="flex items-center gap-4">
        <button type="submit" className="btn btn-sm">Add this step</button>
        <button type="button" className="link" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function Editor({ course, topic, aiOn }: { course: Course; topic: Topic; aiOn: boolean | null }) {
  const saved = useStore((s) => s.experiences[topic.id]);
  const [blocks, setBlocks] = useState<Block[]>(() => saved?.blocks ?? []);
  const [kinds, setKinds] = useState<BlockKind[]>(KINDS.map((k) => k.id));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState(0); // 0 hidden, otherwise a key that restarts the player
  const [adding, setAdding] = useState(false);
  const changed = JSON.stringify(blocks) !== JSON.stringify(saved?.blocks ?? []);
  const previewRef = useRef<HTMLDivElement>(null);
  // The preview opens below the fold, so bring it into view when it is switched on.
  useEffect(() => {
    if (preview === 1) previewRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [preview]);

  const edit = (next: Block[]) => {
    setBlocks(next);
    setStatus("");
    setPreview(0);
  };
  const move = (i: number, by: number) => {
    const next = [...blocks];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    edit(next);
  };

  async function generate() {
    setError("");
    setBusy(true);
    try {
      const res = await postJSON<{ blocks: Block[] }>("/api/experience", { context: topicContext(course, topic), classId: course.classId, kinds, note });
      edit(res.blocks);
    } catch (e) {
      setError(errorText(e, "Could not write the lesson."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="card space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="card-title">Write it with AI</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">Choose the kinds of step to include. The draft appears under Steps for you to reorder, trim and add to.</p>
        </div>
        <div className="grid gap-1.5">
          {KINDS.map((k) => {
            const on = kinds.includes(k.id);
            return (
              <label key={k.id} className="flex cursor-pointer items-start gap-3 py-1 text-sm">
                <input type="checkbox" className="check" checked={on} onChange={() => setKinds(on ? kinds.filter((x) => x !== k.id) : [...kinds, k.id])} />
                <span><span className="font-semibold">{BLOCK_LABEL[k.id]}</span><span className="block text-muted">{k.what}</span></span>
              </label>
            );
          })}
        </div>
        <div>
          <label className="label" htmlFor="note">Anything it should focus on?</label>
          <textarea id="note" className="field min-h-20" placeholder="Use the example from lecture 9. Spend the most time on the resize step." value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {aiOn === false && <Notice>Drafting needs AI, which is off on this site. You can still add steps by hand.</Notice>}
        {error && <Notice tone="rose">{error}</Notice>}
        <button type="button" className="btn w-full" disabled={busy || aiOn !== true || kinds.length === 0} onClick={generate}>
          {busy ? "Writing the lesson…" : blocks.length ? "Write a new draft" : "Write the lesson"}
        </button>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="card-title">Steps{blocks.length > 0 && <span className="ml-2 font-normal tabular-nums text-muted">{blocks.length}</span>}</h2>
            {saved && !changed && <span className="text-sm text-muted">Saved to this topic</span>}
          </div>
          {blocks.length === 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-muted">No steps yet. Write a draft with AI, or add steps yourself below.</p>
          ) : (
            <ol className="mt-3 divide-y divide-line">
              {blocks.map((b, i) => (
                <li key={i} className="flex items-center gap-3 py-2">
                  <span className="w-5 shrink-0 text-right text-sm tabular-nums text-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow">{BLOCK_LABEL[b.kind]}</p>
                    <p className="truncate text-sm">{summary(b) || "Untitled"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" className="btn btn-sm !px-2.5" disabled={i === 0} aria-label={`Move step ${i + 1} up`} onClick={() => move(i, -1)}><Mark kind="up" /></button>
                    <button type="button" className="btn btn-sm !px-2.5" disabled={i === blocks.length - 1} aria-label={`Move step ${i + 1} down`} onClick={() => move(i, 1)}><Mark kind="down" /></button>
                    <button type="button" className="link ml-2" aria-label={`Remove step ${i + 1}`} onClick={() => edit(blocks.filter((_, k) => k !== i))}>Remove</button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-4 border-t border-line pt-4">
            {adding ? (
              <AddStep onAdd={(b) => { edit([...blocks, b]); setAdding(false); }} onCancel={() => setAdding(false)} />
            ) : blocks.length >= MAX_BLOCKS ? (
              <p className="hint">A lesson holds up to {MAX_BLOCKS} steps. Remove one to add another.</p>
            ) : (
              <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>Add a step yourself</button>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <button
              type="button"
              className="btn btn-primary"
              disabled={blocks.length === 0 || !changed}
              onClick={() => {
                actions.saveExperience(topic.id, blocks);
                setStatus("Saved. It is now the lesson for this topic.");
              }}
            >
              Save as this topic’s lesson
            </button>
            <button type="button" className="btn" disabled={blocks.length === 0} onClick={() => setPreview((n) => (n ? 0 : 1))}>{preview ? "Hide preview" : "Preview the lesson"}</button>
            <span className="text-sm text-muted" role="status">{status}</span>
          </div>
        </div>

        {preview > 0 && blocks.length > 0 && (
          <div ref={previewRef} className="scroll-mt-4">
            <p className="card-title mb-3">Preview</p>
            <ExperiencePlayer key={preview} blocks={blocks} finishLabel="Start over" onFinish={() => setPreview((n) => n + 1)} />
          </div>
        )}
      </div>
    </div>
  );
}

function StudioScreen() {
  const aiOn = useAiStatus();
  const courses = useStore((s) => s.courses);
  const active = useStore((s) => s.activeCourseId);
  const activeTopic = useStore((s) => s.activeTopicId);
  const list = Object.values(courses);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const course = courses[courseId ?? active ?? ""] ?? list[0];

  if (!course) {
    return (
      <Empty title="Studio">
        <p>Add a course first, then build interactive lessons for its topics here.</p>
        <Link href="/" className="btn btn-primary mt-4">Go to courses</Link>
      </Empty>
    );
  }
  const topic = course.topics.find((t) => t.id === (topicId ?? activeTopic)) ?? course.topics[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="title">Studio</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">Pick a topic, then write its steps yourself or have AI draft them. Preview plays the lesson the way a student gets it.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="studio-course">Course</label>
          <select id="studio-course" className="field" value={course.id} onChange={(e) => { setCourseId(e.target.value); setTopicId(null); }}>
            {list.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="studio-topic">Topic</label>
          <select id="studio-topic" className="field" value={topic.id} onChange={(e) => setTopicId(e.target.value)}>
            {course.topics.map((t, i) => <option key={t.id} value={t.id}>{i + 1}. {t.title}</option>)}
          </select>
        </div>
      </div>
      <Editor key={topic.id} course={course} topic={topic} aiOn={aiOn} />
    </div>
  );
}

export default function StudioPage() {
  return (
    <RequireUser>
      <StudioScreen />
    </RequireUser>
  );
}
