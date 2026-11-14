# Hive

A learning harness for Georgia Tech courses: give it your syllabus and it builds a study plan that teaches each topic, makes you try before it explains, and schedules review before you forget. Independent student project, not affiliated with or endorsed by Georgia Tech.

The product plan, research and roadmap are in [docs/PLAN.md](docs/PLAN.md).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 and choose **Load the demo course** to try a sample CS 1332 course with no setup.

To build courses from your own syllabus and turn on the tutor, generated lessons and AI grading:

```bash
cp .env.example .env.local
```

Put your Anthropic API key in `.env.local` and restart the dev server.

## Layout

| Path | What it is |
|---|---|
| `src/app/page.tsx` | Courses and "add a course" |
| `src/app/course` | Study plan: exams, up next, course map |
| `src/app/learn` | A session: try first, learn, practice, teach back, with the tutor |
| `src/app/review` | Spaced review queue across courses |
| `src/app/teach` | Instructor settings |
| `src/app/api/*` | Model calls: course map, lesson, questions, grading, tutor |
| `src/lib/mastery.ts` | Mastery, FSRS scheduling, exam readiness, what to study next |
| `src/lib/modes.ts` | The five explanation formats |
| `src/lib/store.ts` | Browser-local state |
| `src/lib/demo-course.ts` | Hand-written demo content |

All progress is stored in the browser's local storage. There are no accounts yet.
