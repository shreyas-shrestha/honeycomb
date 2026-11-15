"use client";

import { useEffect, useState } from "react";
import { RequireUser } from "@/components/RequireUser";
import { Notice } from "@/components/ui";
import { errorText, getJSON, postJSON, sendJSON } from "@/lib/client";

interface TokenInfo {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const TOOLS: [string, string][] = [
  ["get_study_plan", "What to study next, readiness by topic, upcoming exams"],
  ["get_question", "A practice question. The answer stays on the server"],
  ["request_hint", "One of three hints, only after your own attempt"],
  ["ask_tutor", "Explanations in your course's notation, never graded work"],
  ["submit_answer", "Checks your answer, then shows the solution"],
  ["start_blind_practice", "New exam-style questions with no help"],
  ["hand_in_blind", "Marked line by line, like a professor would"],
];

function ConnectScreen() {
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endpoint = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;

  useEffect(() => {
    getJSON<{ tokens: TokenInfo[] }>("/api/tokens")
      .then((r) => setTokens(r.tokens))
      .catch((e) => setError(errorText(e, "Could not load your tokens.")));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await postJSON<{ token: string; tokens: TokenInfo[] }>("/api/tokens", { name: name.trim() || "My assistant" });
      setFresh(r.token);
      setTokens(r.tokens);
      setName("");
    } catch (err) {
      setError(errorText(err, "Could not create a token."));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError("");
    try {
      setTokens((await sendJSON<{ tokens: TokenInfo[] }>("DELETE", "/api/tokens", { id })).tokens);
    } catch (err) {
      setError(errorText(err, "Could not revoke that token."));
    }
  }

  const config = JSON.stringify({ mcpServers: { honeycomb: { type: "http", url: endpoint, headers: { Authorization: `Bearer ${fresh || "hc_…"}` } } } }, null, 2);

  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <h1 className="title">Connect an AI assistant</h1>
        <p className="mt-2 leading-relaxed text-muted">
          Honeycomb is also an MCP server. Add it to Claude, ChatGPT or Cursor and the assistant you already use studies with you under the same rules as this app: hints after your attempt, no answers before you submit, and blind practice with no help.
        </p>
      </header>

      <section aria-labelledby="tools" className="ruled">
        <h2 id="tools" className="heading">What the assistant can do</h2>
        <ul className="mt-3 max-w-2xl divide-y divide-line">
          {TOOLS.map(([tool, what]) => (
            <li key={tool} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2">
              <code className="w-52 shrink-0">{tool}</code>
              <span className="text-sm text-muted">{what}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tokens" className="ruled">
        <h2 id="tokens" className="heading">Access tokens</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">A token lets one assistant act as you in Honeycomb. It is shown once, and you can revoke it here at any time.</p>
        {tokens && tokens.length > 0 && (
          <ul className="mt-3 max-w-2xl divide-y divide-line">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-sm text-muted"> · made {day(t.createdAt)} · {t.lastUsedAt ? `last used ${day(t.lastUsedAt)}` : "never used"}</span>
                </span>
                <button type="button" className="link shrink-0" onClick={() => void revoke(t.id)}>Revoke</button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={create} className="mt-4 flex max-w-2xl flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <label className="label" htmlFor="token-name">Name for the token</label>
            <input id="token-name" className="field" placeholder="Claude on my laptop" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create token"}</button>
        </form>
        {error && <div className="mt-3 max-w-2xl"><Notice tone="rose">{error}</Notice></div>}
        {fresh && (
          <div className="mt-4 max-w-2xl">
            <Notice tone="leaf">Copy this token now. It will not be shown again.</Notice>
            <pre className="mt-2 overflow-x-auto rounded-[10px] bg-panel p-3 text-sm"><code>{fresh}</code></pre>
          </div>
        )}
      </section>

      <section aria-labelledby="setup" className="ruled">
        <h2 id="setup" className="heading">Set it up</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">Add this server in your assistant’s MCP settings. The address is <code>{endpoint}</code>.</p>
        <pre className="mt-3 max-w-2xl overflow-x-auto rounded-[10px] bg-panel p-3 text-sm"><code>{config}</code></pre>
      </section>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <RequireUser>
      <ConnectScreen />
    </RequireUser>
  );
}
