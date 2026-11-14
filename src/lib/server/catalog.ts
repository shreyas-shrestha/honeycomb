// Georgia Tech course data from the GT Scheduler project's public crawler output
// (https://github.com/gt-scheduler/crawler). One JSON file per term, about 2.5 MB,
// kept in memory and refreshed twice a day.
const BASE = "https://gt-scheduler.github.io/crawler-v2";
const TTL_MS = 12 * 60 * 60 * 1000;

export interface CatalogCourse {
  code: string;
  title: string;
  description: string;
  credits: number | null;
  prereqs: string;
  instructors: string[];
  term: string;
}

interface PrereqLeaf {
  id: string;
}
// A tree is ["and" | "or", ...children].
type PrereqNode = PrereqLeaf | (string | PrereqNode)[];
type Meeting = [unknown, unknown, unknown, unknown, instructors: string[], ...unknown[]];
type Section = [crn: string, meetings: Meeting[], credits: number, ...unknown[]];
type RawCourse = [title: string, sections: Record<string, Section>, prereqs: PrereqNode | [], description: string | null, ...unknown[]];

interface Catalog {
  term: string;
  courses: CatalogCourse[];
}

let cache: { at: number; data: Promise<Catalog> } | null = null;

const SEASONS: Record<string, string> = { "02": "Spring", "05": "Summer", "08": "Fall" };
const termLabel = (t: string) => `${SEASONS[t.slice(4)] ?? "Term"} ${t.slice(0, 4)}`;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m]);

function prereqText(node: PrereqNode | [], nested = false): string {
  if (!Array.isArray(node)) return node.id;
  const [op, ...rest] = node;
  const parts = (rest as PrereqNode[]).map((r) => prereqText(r, true)).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  const joined = parts.join(` ${op} `);
  return nested ? `(${joined})` : joined;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Course catalog request failed (${res.status})`);
  return (await res.json()) as T;
}

async function load(): Promise<Catalog> {
  const index = await getJSON<{ terms: { term: string }[] }>(`${BASE}/index.json`);
  const term = index.terms.at(-1)?.term;
  if (!term) throw new Error("The course catalog lists no terms.");
  const raw = await getJSON<{ courses: Record<string, RawCourse> }>(`${BASE}/${term}.json`);
  const courses = Object.entries(raw.courses).map(([code, [title, sections, prereqs, description]]) => {
    const all = Object.values(sections);
    const instructors = new Set<string>();
    for (const s of all) for (const m of s[1] ?? []) for (const name of m[4] ?? []) instructors.add(name.replace(/\s*\(P\)$/, ""));
    return {
      code,
      title: unescape(title),
      description: unescape(description ?? ""),
      credits: typeof all[0]?.[2] === "number" ? all[0][2] : null,
      prereqs: prereqText(prereqs),
      instructors: [...instructors].sort().slice(0, 8),
      term: termLabel(term),
    };
  });
  return { term: termLabel(term), courses };
}

function catalog(): Promise<Catalog> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const data = load();
    cache = { at: Date.now(), data };
    // A failed load must not be served for the next twelve hours.
    data.catch(() => {
      if (cache?.data === data) cache = null;
    });
  }
  return cache.data;
}

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function searchCatalog(query: string, limit = 8): Promise<Catalog> {
  const { term, courses } = await catalog();
  const q = squash(query);
  if (q.length < 2) return { term, courses: [] };
  const byCode = courses.filter((c) => squash(c.code).startsWith(q));
  const byTitle = courses.filter((c) => !squash(c.code).startsWith(q) && squash(c.title).includes(q));
  const sorted = [...byCode.sort((a, b) => a.code.localeCompare(b.code)), ...byTitle];
  return { term, courses: sorted.slice(0, limit) };
}

export async function findCourse(code: string): Promise<CatalogCourse | undefined> {
  const { courses } = await catalog();
  const q = squash(code);
  return courses.find((c) => squash(c.code) === q);
}
