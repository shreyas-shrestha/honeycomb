# Honeycomb

A study app for Georgia Tech courses. Give it your syllabus and it lists the topics and exam dates, then writes a lesson and practice questions for each topic. Topics you have studied come back for spaced review. Instructors can publish a course to their students and set how the AI tutor is allowed to help.

Independent student project, not affiliated with or endorsed by Georgia Tech. The product plan, research and roadmap are in [docs/PLAN.md](docs/PLAN.md).

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. The landing page has a playable lesson. Create an account, then choose **Load the sample** for a CS 1332 course with four finished topics. None of that needs an API key.

To build courses from your own syllabus and turn on the tutor, AI-written lessons and AI grading:

```bash
cp .env.example .env.local
```

Put your OpenAI API key in `.env.local` and restart the dev server. The default model is `gpt-6-luna`; set `HONEYCOMB_MODEL` to change it.

Accounts, sessions, saved progress and classes live in a SQLite file at `data/honeycomb.db`, created on first run. Set `HONEYCOMB_DB` to move it.

## Deploy on Vercel

Vercel's servers have no lasting disk, so a deployment needs a hosted database. The app uses libSQL, which is SQLite-compatible, so the hosted version is a Turso database and no SQL changes.

1. Create a database at https://turso.tech and copy its URL and an auth token.
2. Import this repository at https://vercel.com/new.
3. In the Vercel project's environment variables set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `OPENAI_API_KEY`, and `TRUST_PROXY=1`.
4. Deploy. The tables are created on the first request.

Without `OPENAI_API_KEY` the deployed site still runs: accounts, the sample course, the Studio's hand-written steps and classes all work, and the AI features say they are off.

## What is in it

| Part | What it does |
|---|---|
| Interactive lessons | A lesson is a sequence of steps: quick checks, step-through traces, put-in-order, fill-the-blanks, matching, and an explain-it-yourself step at the end |
| Studio | Write a lesson's steps by hand or have AI draft them, reorder and trim, and preview |
| Sessions | One question first, then the lesson, practice with confidence ratings, and explaining the topic back |
| Study plan | What to study next, exam countdowns, and a honeycomb map of the topics |
| Review | Spaced repetition (FSRS) across all your courses |
| Classes | An instructor publishes a course and shares a class code; students join with it, and the instructor sets the tutor's rules and sees class averages by topic |

## Layout

| Path | What it is |
|---|---|
| `src/app/page.tsx` | Landing page when signed out, your courses when signed in |
| `src/app/course` | Study plan |
| `src/app/learn` | A study session |
| `src/app/review` | Spaced review queue |
| `src/app/studio` | Lesson builder |
| `src/app/teach` | Classes (instructor accounts) |
| `src/app/api/auth`, `state`, `classes` | Accounts, saved progress, classes |
| `src/app/api/{course,lesson,experience,questions,grade,tutor}` | Model calls |
| `src/components/ExperiencePlayer.tsx` | The interactive lesson player |
| `src/lib/server/` | Database, auth, classes, OpenAI client, request validation, course catalog |
| `src/lib/mastery.ts` | Mastery, FSRS scheduling, exam readiness, what to study next |
| `src/lib/store.ts` | The signed-in learner's state, synced to the server |
| `src/lib/demo-course.ts`, `demo-experiences.ts` | Hand-written sample content |

## Not done yet

- No email verification or password reset, and instructor accounts are self-declared.
- Rate limits are kept in memory, so they assume a single server process.
- Students who already joined a class get later updates only by entering the code again.
- The tutor rules follow a student's class membership on the server, but a student who edits their requests to name a different course gets the default rules. No setting can stop a student from using another AI tool.
- Signing in does not end sessions on other devices, and sign-up reveals whether an email already has an account.
