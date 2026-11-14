"use client";

import { useEffect, useRef, useState } from "react";
import { errorText, streamPost } from "@/lib/client";
import { HELP_LEVELS, type ChatMessage, type InstructorPolicy, type TopicContext } from "@/lib/types";
import { Markdown } from "./Markdown";
import { KeyHelp, Notice } from "./ui";

interface Props {
  context: TopicContext;
  policy: InstructorPolicy;
  aiPolicy: string;
  aiOn: boolean;
  question?: { prompt: string; solution: string; answered: boolean };
}

const STARTERS = ["Give me a hint", "I don't get why this works", "Quiz me on this"];

export function TutorPanel({ context, policy, aiPolicy, aiOn, question }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState<string | null>(null); // the answer being streamed
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const busy = reply !== null;
  const level = HELP_LEVELS.find((l) => l.id === policy.helpLevel)?.name ?? "";

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, reply]);

  async function send(textIn: string) {
    const text = textIn.trim();
    if (!text || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setDraft("");
    setError("");
    setReply("");
    try {
      const full = await streamPost("/api/tutor", { context, policy, aiPolicy, question, messages: history }, setReply);
      setMessages([...history, { role: "assistant", content: full }]);
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
        <p className="text-sm text-muted">{level} · set by your course</p>
      </div>
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && !busy && (
          <div className="text-sm leading-relaxed text-muted">
            {aiOn ? (
              <>
                <p>Stuck on {context.topicTitle}? Say what you tried and where it stopped making sense.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              </>
            ) : (
              <p>The tutor needs an OpenAI API key. <KeyHelp /> Lessons and questions in the sample course work without it.</p>
            )}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-6 whitespace-pre-wrap rounded-xl bg-honey-soft px-3 py-2 text-sm">{m.content}</div>
          ) : (
            <Markdown key={i} className="prose-sm mr-2">{m.content}</Markdown>
          ),
        )}
        {busy && (reply ? <Markdown className="prose-sm mr-2">{reply}</Markdown> : <p className="text-sm text-muted">Thinking…</p>)}
        {error && <Notice tone="rose">{error}</Notice>}
      </div>
      {aiOn && (
        <form
          className="flex items-start gap-2 border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <label htmlFor="tutor-input" className="sr-only">Message the tutor</label>
          <input id="tutor-input" className="field min-h-[2.75rem] py-[0.55rem]" placeholder="Ask, or say what you tried" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>Send</button>
        </form>
      )}
    </aside>
  );
}
