# Honeycomb: a learning harness for Georgia Tech courses

Working name "Honeycomb". Independent student project, not affiliated with or endorsed by Georgia Tech (see [Branding](#branding-and-legal)).

## 1. Why build this

Students already learn with Claude and ChatGPT, but a chat box is a poor harness for learning: it has no model of the course, no memory of what you got wrong, no schedule, and it hands over answers. The best-known study on this (Bastani et al., PNAS 2025, about 1,000 students) found plain chat access raised practice scores 48% and then **lowered exam scores 17%** once it was taken away. A tutor version that gave hints instead of answers removed the harm.

Wondering (YC S26) shows the "Duolingo for anything" shape works as a product, but it is built for curious adults: 3-minute lessons from a topic or a link, content generated from model knowledge, streaks and XP. It has no syllabus ingestion, no exam dates, no mastery model, and no instructor side.

Honeycomb's unit is **the course you are enrolled in**, with its syllabus, its exam dates, its professor's emphasis and its AI policy. Narrowing to Georgia Tech is what makes that possible: a few dozen courses cover most of the pain (CS 1332, CS 2110, MATH 1554, PHYS 2212), and each one runs every term with a similar structure.

| | Chat (Claude, ChatGPT) | Wondering | NotebookLM / StudyFetch | Honeycomb |
|---|---|---|---|---|
| Unit | A conversation | A topic | A document | Your course section |
| Knows your syllabus and exam dates | No | No | Partly | Yes |
| Tracks what you know | No | Review queue only | No | Per-topic mastery, decay over time |
| Decides what to study next | No | Fixed roadmap | No | Deadline-aware, prerequisite-aware |
| Gives answers before you try | Yes | n/a | Yes | No by default; instructor-set |
| Instructor controls | No | No | No | Help level, emphasis, notation, off-limits work |

## 2. What the research says to build

Sources are listed in section 9.

Built:

- **Attempt first.** A committed answer comes before any hint or solution (Bastani 2025; Kestin 2025).
- **Hints, not answers.** Nudge, then next step, then worked step; full solution last. Level is set per course by the instructor.
- **Retrieval is the default activity.** Every session opens with a question before the lesson and closes with practice (Roediger & Karpicke 2006; Dunlosky 2013 rates practice testing and spacing "high utility", rereading and summarising "low").
- **Spaced review with FSRS** (`ts-fsrs`, target retention 0.9). FSRS predicts recall better than older schedulers on about 10k Anki collections.
- **Prerequisite graph.** Topics wait until prerequisites are half learned; the planner sends you back to the weak prerequisite.
- **No diagnosed "learning styles".** Matching instruction to a visual/auditory/kinesthetic type is not supported (Pashler 2008; Clinton-Lisell 2024). What is supported: words plus a relevant picture for everyone, format chosen by content, adapting to prior knowledge, and learner choice for motivation. Honeycomb offers five **explanation modes** the learner picks per topic (worked example, question-led, picture it, derive it, fast recap).
- **Teach it back.** Each topic ends with explaining it in your own words, graded against the topic's objectives (self-explanation and learning-by-teaching literature).
- **Confidence before feedback.** You rate how sure you are before seeing the answer; Honeycomb shows your calibration, because feeling of learning is a poor guide to actual learning (Deslauriers 2019).
- **Interleaved review** across topics and courses (Rohrer 2015).

Not built yet:

- **Fade scaffolds by expertise.** Worked examples help novices and hurt experts (Kalyuga 2003). Next: pick the default mode from mastery.
- **Ground content in the professor's materials**, with citations to the slide or page. Kestin's tutor had expert-written solutions in the prompt; free generation is the main accuracy risk.
- **Measure mastery only on unassisted, delayed items.** Today any practice answer counts; hinted answers should count for less.
- **Light, forgiving streaks** tied to completed retrieval, tested against delayed scores, not engagement. Evidence for streaks is about retention of users, not of knowledge, so this is deliberately left out of v0.

## 3. Product

### Student

1. **Add a course.** Search the Georgia Tech catalog and pick the course. Paste or upload the syllabus (PDF) and Honeycomb extracts units, topics, prerequisites between topics, exam dates and coverage, grade weights, and the syllabus's AI policy. With no syllabus it searches the web for the course's public syllabus, builds the plan from that, and shows its sources.
2. **Course map.** Topics grouped by unit with a mastery bar each; readiness for each exam with a countdown; "Up next" with a stated reason ("On an exam in 9 days", "Due for review").
3. **Session on one topic** (about 15 minutes):
   - *Try first*: one question before any teaching.
   - *Learn*: an interactive lesson worked through one step at a time (quick checks, step-through traces, put-in-order, fill-the-blanks, matching, explain-it-yourself), or a written explanation in the format you choose.
   - *Practice*: mixed multiple-choice and free-response, confidence before reveal, feedback on what was missed.
   - *Teach back*: explain it to a classmate; graded against objectives.
   - A tutor panel is available throughout and follows the course's help level.
4. **Daily review.** Due topics from all courses, interleaved, one question each.
5. **Studio.** Build or reshape the interactive lesson for any topic: draft it with AI, reorder and trim the steps, add your own, and preview it as a student.

### Instructor

- **Help level**: hints only / guided / full solutions after an attempt.
- **Emphasis, notation and conventions** ("we use 0-indexed heaps", "expect loop-invariant proofs").
- **Off-limits work** (graded homework, projects): the tutor will discuss concepts but not solve them.
- **Allowed explanation modes**.
- **Publish a class**: the instructor's course, lessons and questions go out under a class code that students join with.
- **Class insights**: average mastery per topic across students who joined, weakest first. Joining tells the student this is shared; no individual student is shown.

## 4. Architecture

Current build:

- **Next.js 16 (App Router), TypeScript, Tailwind 4.** Pages: `/` (landing, or your courses), `/course` (study plan), `/learn` (session), `/review`, `/studio` (lesson builder), `/teach` (classes).
- **Accounts**: email and password. Passwords are hashed with scrypt; the session is a random token in an httpOnly cookie, stored hashed. Every signed-in route checks the session and refuses cross-site requests; AI routes and sign-in are rate limited.
- **Data**: SQLite (`data/honeycomb.db`) holding users, sessions, each learner's saved state as one JSON document with a revision counter, classes, and memberships. The browser keeps a copy in memory and saves changes back; a stale save is refused so two tabs cannot overwrite each other.
- **Classes**: an instructor publishes a course bundle (map, lessons, questions) and gets a class code. Students join with the code. The tutor rules are stored on the class and found on the server from the student's membership (by class, or by course code if the request leaves the class out), so the browser does not get to pick them. A student who rewrites requests to name a different course gets the defaults. Instructors see topic-level averages across the class, and only for topics at least three students have practiced.
- **Interactive lessons**: a lesson is a list of typed blocks (text, check, trace, order, fill, match, reveal) rendered by one player component. The model writes them as structured output; anything it returns is validated before it is saved, and published lessons are validated again on the server because other students' browsers render them.
- **AI**: OpenAI Node SDK (Responses API), default model `gpt-6.1-sol`; structured outputs (Zod) for course maps, interactive lessons, questions and grading; streaming for written lessons and the tutor; the built-in web search tool to find a course's public syllabus when the student has none. Change the model with `HONEYCOMB_MODEL`.
- **Course lookup**: live search over the public Georgia Tech catalog (title, description, prerequisites, this term's instructors), fetched server-side and cached in memory.
- **Learning model** (`src/lib/mastery.ts`): per-topic mastery (moving average of scores, penalising confident errors), an FSRS card per topic, readiness = mastery × predicted recall, exam readiness = weighted mean over covered topics.
- **Sample content**: a hand-written CS 1332 course with interactive lessons, written lessons and questions for four topics, usable with no API key.

Still to build:

- Email verification, password reset, and verifying that an instructor account belongs to the instructor of record (Georgia Tech SSO is the real answer).
- A managed Postgres database and object storage for a hosted deployment; rate limits that work across processes.
- Uploading slides and past exams, with answers that cite the page.
- Pushing a class update to students who already joined, and merging it with their progress.
- A second-pass check of every generated lesson and question, and a flag button for students.

## 5. Course data

- **Catalog**: GT Scheduler's crawler publishes per-term JSON at `https://gt-scheduler.github.io/crawler-v2/<term>.json` (`index.json` lists terms): course code, title, description, prerequisite tree, sections, instructors. The crawler code is AGPL-3.0 and the data licence is unstated, so consume the published JSON, credit it, and ask the maintainers (Bits of Good) before depending on it. The app reads the latest term's file for its course search.
- **Syllabus**: uploaded by the student. This is the dependable path.
- **Canvas**: the API can read courses, syllabus body, modules, files and assignments. Instructure's API policy forbids asking users to paste personal tokens into a third-party app, so real integration means OAuth with a developer key from Georgia Tech, or LTI 1.3. GT's LTI process requires 1EdTech certification, security and accessibility review, and a request at least three months before the term. That is a year-two goal, reached through a faculty sponsor.
- **Course Critique**: grade distributions; no supported public API. Skip for now.

## 6. Roadmap

| Phase | Goal | Scope |
|---|---|---|
| **0. Prototype** (this repo) | Prove the loop feels better than chat | Accounts, catalog search, syllabus or web to course map, interactive lessons and Studio, sessions, FSRS review, tutor guardrails, classes with join codes and server-enforced rules, sample course |
| **1. Private beta, 4 to 6 weeks** | 30 students in 2 courses use it through one exam | Hosted database, email verification, upload slides and past exams with cited answers, pre-generated and checked question pools for CS 1332 and MATH 1554, exam-cram plan, mobile layout |
| **2. One semester** | Evidence it works | Compare exam scores of users vs matched non-users with a professor's cooperation; exam-style mock exams with rubric grading; study groups sharing a course map (never files); per-user FSRS fitting |
| **3. Instructor pilot** | 2 to 3 faculty adopt it | Instructor-verified content, real class insights with consent, Canvas via LTI 1.3, OIT AI-tool review |
| **4. Expand** | Other campuses | The same course-based model, one campus at a time |

Success measure for phases 1 and 2: delayed performance (exam scores, unassisted review accuracy after 7+ days), not minutes in the app.

## 7. Risks

- **Wrong content on high-stakes material.** Mitigate with grounding in uploaded materials, citations, second-pass checking, flagging, and instructor-verified pools for the top courses.
- **Academic integrity.** Per-course help levels, off-limits lists, attempt-first, and showing the syllabus's AI policy inside the app. GT guidance has instructors set AI rules per syllabus and treats undisclosed use as a possible Honor Code issue; Honeycomb should make disclosure easy (export of what help was given).
- **Course materials are copyrighted by faculty.** Uploads stay private to the uploader; no cross-user sharing of files; takedown path. This is the Course Hero failure mode and GT names it explicitly.
- **Student data.** Students volunteering their own data is one footing; instructor-required use triggers FERPA "school official" contracts and OIT review. Collect the minimum, never GTID or grades from official systems, until there is an agreement.
- **Cost.** A full session is several model calls. Cache lessons and question pools per course section so the hundredth CS 1332 student costs little.
- **Incumbents.** ChatGPT Edu and Copilot are institution-provided; Jill Watson answers course questions inside Canvas. None of them track what each student knows or schedule review.

## 8. Branding and legal

Georgia Tech's registered marks include "Georgia Tech", "Buzz", "Yellow Jackets", "Ramblin' Wreck" and the interlocking GT, and it claims "Tech", "Jackets" and the gold, white and navy colour scheme at common law. Use on personal or commercial sites needs written approval, except factual statements.

So: the product name, domain and logo contain none of those; the palette is ink and white with a honey accent, not Tech Gold and navy; the copy says "built for Georgia Tech courses" as a statement of fact, with a non-affiliation line in the footer. Contact gtlicensing@gatech.edu before any use beyond that.

## 9. Sources

- Bastani et al. 2025, "Generative AI without guardrails can harm learning", PNAS 122(26).
- Kestin et al. 2025, "AI tutoring outperforms in-class active learning", Scientific Reports 15:17458.
- Roediger & Karpicke 2006, Psychological Science 17(3).
- Dunlosky et al. 2013, Psychological Science in the Public Interest 14(1).
- Pashler et al. 2008, PSPI 9(3); Clinton-Lisell & Litzinger 2024, Frontiers in Psychology.
- Kalyuga et al. 2003, Educational Psychologist; Renkl & Atkinson 2003.
- Rohrer et al. 2015, Journal of Educational Psychology.
- Deslauriers et al. 2019, PNAS 116(39).
- Oreopoulos et al. 2026, NBER w35621 (mastery gating alone did not improve delayed learning).
- Sailer & Homner 2020, Educational Psychology Review 32 (gamification effects are small).
- FSRS benchmark: github.com/open-spaced-repetition/srs-benchmark.
- Wondering: wondering.app, ycombinator.com/companies/wondering, App Store listing.
- GT: brand.gatech.edu/our-look/use-of-name, policies.gatech.edu/node/2333, generalcounsel.gatech.edu/legal-affairs/responsible-use-course-materials, sites.gatech.edu/dlt-blog (LTI vetting), github.com/gt-scheduler/crawler.

Several citations were taken from abstracts or secondary summaries during research and should be re-read before being quoted publicly.
