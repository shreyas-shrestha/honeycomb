"use client";

import { useState } from "react";
import { errorText, postJSON } from "@/lib/client";
import { actions, useStore } from "@/lib/store";
import type { Course, Material } from "@/lib/types";
import { Notice } from "./ui";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const NONE: Material[] = [];

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });
}

// The student's own course files. Each is read once and filed under the
// course's topics; lessons, questions and the tutor then draw on that.
export function Materials({ course, aiOn }: { course: Course; aiOn: boolean | null }) {
  const materials = useStore((s) => s.materials[course.id] ?? NONE);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (file && file.size > MAX_FILE_BYTES) return setError("That file is over 10 MB. Split it, or paste the text.");
    setBusy(true);
    try {
      const { material } = await postJSON<{ material: Material }>("/api/materials", {
        course: `${course.code} ${course.title}`,
        topics: course.topics.map((t) => ({ id: t.id, title: t.title })),
        name: name.trim() || file?.name || "Pasted notes",
        text: text.trim() || undefined,
        file: file ? await readDataUrl(file) : undefined,
      });
      actions.addMaterial(course.id, material);
      setFile(null);
      setText("");
      setName("");
      setOpen(false);
    } catch (err) {
      setError(errorText(err, "Could not read that material."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="materials" className="ruled">
      <h2 id="materials" className="heading">Your material</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
        Add notes, slides, past homework or practice exams. Lessons and questions then use your course’s notation and exam style. Only a summary by topic is kept, not the file.
      </p>

      {materials.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {materials.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="font-semibold">{m.name}</span>
                <span className="text-sm text-muted"> · {m.kind} · {Object.keys(m.byTopic).length} topic{Object.keys(m.byTopic).length === 1 ? "" : "s"}</span>
              </span>
              <button type="button" className="link shrink-0" onClick={() => actions.removeMaterial(course.id, m.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}

      {materials.length === 0 && <p className="mt-3 text-sm text-muted">Nothing added yet.</p>}

      {aiOn === false ? (
        <p className="hint mt-3">Reading material needs AI, which is off on this site.</p>
      ) : !open ? (
        <button type="button" className="btn mt-3" onClick={() => setOpen(true)}>Add material</button>
      ) : (
        <form onSubmit={submit} className="card mt-3 max-w-2xl space-y-4 p-5">
          <div>
            <label className="label" htmlFor="material-file">A PDF or a photo <span className="font-normal text-muted">· up to 10 MB</span></label>
            <input id="material-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="block w-full text-sm text-muted file:mr-3 file:min-h-[2.75rem] file:rounded-full file:border file:border-line-ui file:bg-surface file:px-4 file:text-sm file:font-semibold file:text-ink" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <label className="label" htmlFor="material-text">Or paste text</label>
            <textarea id="material-text" className="field min-h-28" value={text} onChange={(e) => setText(e.target.value)} placeholder="Lecture notes, a homework sheet, a practice exam…" />
          </div>
          <div>
            <label className="label" htmlFor="material-name">What to call it <span className="font-normal text-muted">· optional</span></label>
            <input id="material-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Practice exam 2" maxLength={120} />
          </div>
          <p className="hint">Leave out anything you are not allowed to share, such as a current graded assignment. Solutions in a file are not kept.</p>
          {error && <Notice tone="rose">{error}</Notice>}
          <div className="flex items-center gap-4">
            <button type="submit" className="btn btn-primary" disabled={busy || aiOn !== true || (!file && !text.trim())}>{busy ? "Reading it…" : "Add"}</button>
            <button type="button" className="link px-2" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
