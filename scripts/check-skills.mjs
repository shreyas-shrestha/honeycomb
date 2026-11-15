#!/usr/bin/env node
// Checks every skill in skills/ is well formed. Run: node scripts/check-skills.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills");
const REQUIRED = ["name", "description", "version"];
const TYPES = ["trace", "proof", "derivation", "explanation", "calculation"];
const TUTOR_SECTIONS = ["Help level: hints", "Help level: guided", "Attempt first", "Syllabus AI policy", "Open question", "Answered question", "Hint 1", "Hint 2", "Hint 3", "Between hints", "Redraft", "Fallback"];

function read(dir) {
  const lines = readFileSync(path.join(ROOT, dir, "SKILL.md"), "utf8").replace(/\r\n/g, "\n").split("\n");
  const end = lines[0]?.trim() === "---" ? lines.indexOf("---", 1) : -1;
  if (end < 0) return { meta: {}, sections: [], problems: ["no frontmatter block"] };
  const meta = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (m) meta[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  const rest = lines.slice(end + 1);
  const sections = rest.filter((l) => /^## +\S/.test(l)).map((l) => l.replace(/^## +/, "").trim());
  const problems = REQUIRED.filter((k) => !meta[k]).map((k) => `missing ${k}`);
  if (meta.name && meta.name !== dir) problems.push(`name "${meta.name}" does not match directory`);
  if (!/^[a-z][a-z0-9-]*$/.test(dir)) problems.push("directory name must match /^[a-z][a-z0-9-]*$/");
  if (meta.version && !/^\d+\.\d+\.\d+$/.test(meta.version)) problems.push(`version "${meta.version}" is not semver`);
  if (!rest.join("\n").trim()) problems.push("empty body");
  return { meta, sections, problems };
}

let failed = false;
const fail = (line) => {
  failed = true;
  console.log(line);
};

const dirs = existsSync(ROOT) ? readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
if (!dirs.length) fail("FAIL  no skills found in skills/");

for (const dir of dirs) {
  if (!existsSync(path.join(ROOT, dir, "SKILL.md"))) {
    fail(`FAIL  ${dir}: no SKILL.md`);
    continue;
  }
  const { meta, sections, problems } = read(dir);
  if (dir === "tutor") for (const s of TUTOR_SECTIONS) if (!sections.includes(s)) problems.push(`missing section "## ${s}"`);
  const type = /^reviewer-(.+)$/.exec(dir)?.[1];
  if (type && meta.applies_to !== type) problems.push(`applies_to should be "${type}"`);
  if (problems.length) fail(`FAIL  ${dir}: ${problems.join("; ")}`);
  else console.log(`ok    ${dir}@${meta.version}${sections.length ? ` (${sections.length} sections)` : ""}`);
}

for (const name of ["tutor", "leak-check", "reviewer", ...TYPES.map((t) => `reviewer-${t}`)]) {
  if (!dirs.includes(name)) fail(`FAIL  ${name}: skill does not exist`);
}

process.exit(failed ? 1 : 0);
