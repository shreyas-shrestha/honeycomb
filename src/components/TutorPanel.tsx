"use client";

import { useEffect, useRef, useState } from "react";
import { streamPost } from "@/lib/client";
import type { TopicContext } from "@/lib/server/ai";
import type { ChatMessage, InstructorPolicy } from "@/lib/types";
import { Markdown } from "./Markdown";

interface Props {
  context: TopicContext;
  policy: InstructorPolicy;
  aiPolicy: string;
  aiOn: boolean;
  question?: { prompt: string; solution: string; answered: boolean };
}

const HELP_LABEL: Record<InstructorPolicy["helpLevel"], string> = {
  hints: "Hints only",
  guided: "Guided help",
  full: "Full solutions after you try",
};

const STARTERS = ["Give me a hint", "I don't get why this works", "Quiz me on this"];

export function TutorPanel({ context, policy, aiPolicy, aiOn, question }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  async function send(textIn: string) {
    const text = textIn.trim();
    if (!text || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setBusy(true);
    const show = (content: string) => setMessages([...history, { role: "assistant", content }]);
    try {
      const full = await streamPost("/api/tutor", { context, policy, aiPolicy, question, messages: history }, show);
      if (!full.trim()) show("No reply came back. Try asking again.");
    } catch (e) {
      show(`**Could not reach the tutor.** ${e instanceof Error ? e.message : ""}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="card flex h-[32rem] flex-col lg:sticky lg:top-4 lg:h-[calc(100vh-7rem)]" aria-label="Tutor">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-bold">Tutor</h2>
        <p className="text-xs text-muted">{HELP_LABEL[policy.helpLevel]} · set by your course</p>
      </div>
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.length === 0 && (
          <div className="text-sm text-muted">
            {aiOn ? (
              <>
                <p>Stuck on {context.topicTitle}? Say what you tried and where it stopped making sense.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" className="btn !py-1 !text-xs" onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              </>
            ) : (
              <p>The tutor needs an Anthropic API key. Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart to turn it on. Lessons and questions in the demo course work without it.</p>
            )}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-6 rounded-xl bg-honey-soft px-3 py-2 text-sm whitespace-pre-wrap">{m.content}</div>
          ) : (
            <div key={i} className="mr-2 text-sm">
              {m.content ? <Markdown>{m.content}</Markdown> : <span className="text-muted">Thinking…</span>}
            </div>
          ),
        )}
      </div>
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <label htmlFor="tutor-input" className="sr-only">Message the tutor</label>
        <input
          id="tutor-input"
          className="field"
          placeholder={aiOn ? "Ask, or say what you tried" : "Tutor is off"}
          value={draft}
          disabled={!aiOn}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={!aiOn || busy || !draft.trim()}>Send</button>
      </form>
    </aside>
  );
}
