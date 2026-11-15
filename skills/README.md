# Skills

A skill is one brief a model works from: the tutor's policy, the leak check, the
grading brief. Each lives in `skills/<name>/SKILL.md` instead of a string in the
code, so changing how a model behaves is a versioned edit to a text file.

## File format

```markdown
---
name: reviewer-proof
description: One line saying what the brief is for.
version: "1.0.0"
applies_to: proof
---

The brief, written as instructions to the model.

## Optional section

Text the code picks out by heading.
```

- `name`: must equal the directory name; lowercase letters, digits and hyphens.
- `description`: one line.
- `version`: semver string. See "Versions" below.
- `applies_to`: on a type addendum, the question type it is for.

Frontmatter is flat `key: value` lines only; no nesting or lists.

## Loading

`src/lib/server/skills.ts` reads these files on the server.

- `loadSkill(name)` returns `{ name, description, version, body, sections }`.
  `body` is the text before the first `## ` heading; `sections` maps each
  `## Heading` to the text under it, e.g. `loadSkill("tutor").sections["Hint 2"]`.
  Only `## ` splits a skill, so use `###` or lists inside a section.
- Skills are cached per process: restart the dev server after editing one.
- Skills hold fixed policy only. Per-request data (the course, the question, the
  student's material) is added by the route that calls the model.

## Routing by question type

Blind-practice questions have a type: `trace`, `proof`, `derivation`,
`explanation` or `calculation`. `reviewerBrief(type)` returns the `reviewer`
body followed by the body of `reviewer-<type>`, so every answer is marked by the
same base rules plus the guidance for its kind of question. With no type it
returns the base brief alone.

## Adding a skill

1. Create `skills/<name>/SKILL.md` with the three required fields.
2. For a new question type, also add it to `QUESTION_TYPES` in
   `src/lib/server/skills.ts` and to `TYPES` in `scripts/check-skills.mjs`,
   and name the skill `reviewer-<type>` with `applies_to: <type>`.
3. Run `node scripts/check-skills.mjs`.

## Versions

Bump `version` whenever the wording of a skill changes: patch for a
clarification, minor for a new or changed rule, major for a rewrite.
`skillVersions()` reports name to version for every skill, and eval reports
record it, so a change in results can be traced to the brief that caused it.
