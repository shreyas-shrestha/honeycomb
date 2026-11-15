import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// The briefs the models work from live in skills/<name>/SKILL.md rather than in
// code, so a change to one is a versioned edit to a text file that eval reports
// can name. See skills/README.md. Server only: this reads from disk.

export const QUESTION_TYPES = ["trace", "proof", "derivation", "explanation", "calculation"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface Skill {
  name: string;
  description: string;
  version: string;
  /** The text before the first `## ` heading, or the whole text if there are none. */
  body: string;
  /** The text under each `## Heading`, keyed by the heading. */
  sections: Record<string, string>;
}

const NAME = /^[a-z][a-z0-9-]*$/;
const REQUIRED = ["name", "description", "version"] as const;
const cache = new Map<string, Skill>();

const skillsDir = () => path.join(process.cwd(), "skills");
const skillFile = (name: string) => path.join(skillsDir(), name, "SKILL.md");

// Frontmatter is flat `key: value` lines between two `---` lines; values may be quoted.
function parse(name: string, raw: string): Skill {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const end = lines[0]?.trim() === "---" ? lines.indexOf("---", 1) : -1;
  if (end < 0) throw new Error(`Skill "${name}" has no frontmatter block.`);

  const meta: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (m) meta[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  const missing = REQUIRED.filter((k) => !meta[k]);
  if (missing.length) throw new Error(`Skill "${name}" is missing frontmatter: ${missing.join(", ")}.`);
  if (meta.name !== name) throw new Error(`Skill directory "${name}" holds a skill named "${meta.name}".`);

  // parts is [body, heading, text, heading, text, ...]
  const parts = lines.slice(end + 1).join("\n").split(/^## +(.+)$/m);
  const sections: Record<string, string> = {};
  for (let i = 1; i < parts.length; i += 2) sections[parts[i].trim()] = parts[i + 1].trim();
  return { name, description: meta.description, version: meta.version, body: parts[0].trim(), sections };
}

export function loadSkill(name: string): Skill {
  if (!NAME.test(name)) throw new Error(`Invalid skill name: ${JSON.stringify(name)}.`);
  const cached = cache.get(name);
  if (cached) return cached;
  let raw: string;
  try {
    raw = readFileSync(skillFile(name), "utf8");
  } catch {
    throw new Error(`Skill "${name}" not found: expected ${path.join("skills", name, "SKILL.md")}.`);
  }
  const skill = parse(name, raw);
  cache.set(name, skill);
  return skill;
}

// One named section of a skill. A renamed or missing heading is an error, not a silent gap in a prompt.
export function section(skill: Skill, name: string): string {
  const text = skill.sections[name];
  if (!text?.trim()) throw new Error(`The ${skill.name} skill has no "${name}" section.`);
  return text;
}

/** The base grading brief, with the marking guidance for one question type appended when it is known. */
export function reviewerBrief(type?: QuestionType): string {
  const base = loadSkill("reviewer").body;
  return type ? `${base}\n\n${loadSkill(`reviewer-${type}`).body}` : base;
}

/** Name to version for every skill on disk, for eval reports. */
export function skillVersions(): Record<string, string> {
  const names = readdirSync(skillsDir(), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(skillFile(d.name)))
    .map((d) => d.name)
    .sort();
  return Object.fromEntries(names.map((n) => [n, loadSkill(n).version]));
}
