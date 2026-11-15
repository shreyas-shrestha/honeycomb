"use client";

import { useEffect, useRef, useState } from "react";
import { errorText, streamPost } from "@/lib/client";
import { HELP_LEVELS, type ChatMessage, type InstructorPolicy, type TopicContext } from "@/lib/types";
import { Markdown } from "./Markdown";
import { Notice } from "./ui";

interface Props {
  context: TopicContext;
  policy: InstructorPolicy; // shown to the learner; the server applies the real rules from classId
  classId?: string;
  aiPolicy: string;
  aiOn: boolean;
  material: string; // the student's uploaded material for this topic, as text
  question?: { prompt: string; solution: string; choices?: string[]; answered: boolean };
}

const MIN_ATTEMPT = 15;
const MAX_HINTS = 3;
const SENT = 40; // messages sent with each request
const STARTERS = ["I don’t get why this works", "Quiz me on this"];

export function TutorPanel({ context, policy, classId, aiPolicy, aiOn, material, question }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState<string | null>(null); // the answer being written
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  // Per question: whether the student has put an attempt in words, and how many hints they have used.
  const [gate, setGate] = useState<{ prompt: string; attempted: boolean; hints: number }>({ prompt: "", attempted: false, hints: 0 });
  const scroller = useRef<HTMLDivElement>(null);
  const busy = reply !== null;
  const level = HELP_LEVELS.find((l) => l.id === policy.helpLevel)?.name ?? "";

  // While a scored question is open the tutor is guarded: attempt first, then counted hints.
  const guarded = question !== undefined && !question.answered;
  const here = guarded && gate.prompt === question.prompt ? gate : { prompt: question?.prompt ?? "", attempted: false, hints: 0 };
  const needsAttempt = guarded && !here.attempted;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, reply]);

  async function send(textIn: string, hint?: number) {
    const text = textIn.trim();
    if (!text || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setDraft("");
    setError("");
    setReply("");
    if (guarded) setGate({ ...here, attempted: true });
    // Send the recent conversation, always with the attempt that opened the gate.
    const recent = history.slice(-SENT);
    const opener = history.find((m) => m.role === "user" && m.content.startsWith("My attempt:"));
    const sent = guarded && opener && !recent.includes(opener) ? [opener, ...recent] : recent;
    try {
      const full = await streamPost("/api/tutor", { context, classId, aiPolicy, question, material: material || undefined, hint, messages: sent }, setReply);
      setMessages([...history, { role: "assistant", content: full }]);
      // A hint is used up only once it has arrived.
      if (guarded && hint) setGate({ ...here, attempted: true, hints: hint });
    } catch (e) {
      // A failed reply is shown as an error and kept out of the conversation sent to the model.
      setError(errorText(e, "Could not reach the tutor."));
    } finally {
      setReply(null);
    }
  }

  return (
    <aside className={`card flex max-h-[70dvh] flex-col self-start lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] ${messages.length > 0 ? "min-h-[20rem]" : ""}`} aria-label="Tutor">
      <div className="border-b border-line px-4 py-3">
        <h2 className="card-title">Tutor</h2>
        <p className="text-sm text-muted">{level} · never the answer</p>
      </div>
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && !busy && (
          <div className="text-sm leading-relaxed text-muted">
            {!aiOn ? (
              <p>The tutor needs AI, which is off on this site. Lessons and questions in the sample course work without it.</p>
            ) : guarded ? (
              <p>Say what you have tried, then ask for up to {MAX_HINTS} hints.</p>
            ) : (
              <>
                <p>Ask about {context.topicTitle}. The tutor explains and asks you questions back; it does not do graded work.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-6 whitespace-pre-wrap rounded-[10px] bg-panel px-3 py-2 text-sm">{m.content}</div>
          ) : (
            <Markdown key={i} className="prose-sm mr-2">{m.content}</Markdown>
          ),
        )}
        {busy && (reply ? <Markdown className="prose-sm mr-2">{reply}</Markdown> : <p className="text-sm text-muted">{guarded ? "Writing a hint and checking it does not give the answer away…" : "Thinking…"}</p>)}
        {error && <Notice tone="rose">{error}</Notice>}
      </div>

      {aiOn && (
        <form
          className="space-y-2 border-t border-line px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(needsAttempt ? `My attempt: ${draft}` : draft);
          }}
        >
          <label htmlFor="tutor-input" className={needsAttempt ? "label !mb-0" : "sr-only"}>
            {needsAttempt ? "First, what have you tried? A best guess counts." : "Message the tutor"}
          </label>
          {needsAttempt ? (
            <>
              <textarea id="tutor-input" className="field min-h-20" placeholder="I think it is … because …" value={draft} onChange={(e) => setDraft(e.target.value)} aria-describedby="tutor-input-hint" />
              <p id="tutor-input-hint" className="hint">One sentence is enough.</p>
            </>
          ) : (
            <input id="tutor-input" className="field min-h-[2.75rem] py-[0.55rem]" placeholder="Ask, or say where you are stuck" value={draft} onChange={(e) => setDraft(e.target.value)} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {guarded && !needsAttempt ? (
              here.hints < MAX_HINTS ? (
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => send(`Hint ${here.hints + 1}, please.`, here.hints + 1)}>
                  Hint {here.hints + 1} of {MAX_HINTS}
                </button>
              ) : (
                <span className="hint">All {MAX_HINTS} hints used. Give it your best answer.</span>
              )
            ) : (
              <span />
            )}
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy || draft.trim().length < (needsAttempt ? MIN_ATTEMPT : 1)}>
              {needsAttempt ? "Share my attempt" : "Send"}
            </button>
          </div>
        </form>
      )}
    </aside>
  );
}
