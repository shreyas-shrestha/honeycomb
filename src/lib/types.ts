export type ModeId = "walkthrough" | "socratic" | "visual" | "derive" | "recap";

export interface Unit {
  id: string;
  title: string;
  when?: string; // "Weeks 1-2" as written in the syllabus
}

export interface Topic {
  id: string;
  unitId: string;
  title: string;
  summary: string;
  objectives: string[];
  prereqs: string[]; // topic ids
  examIds: string[];
  weight: number; // 1 (minor) .. 3 (heavily tested)
}

export interface Exam {
  id: string;
  title: string;
  date: string | null; // local ISO date, null when the source does not say
  weightPct: number | null;
}

export interface Source {
  title: string;
  url: string;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  instructor: string;
  term: string;
  units: Unit[];
  topics: Topic[];
  exams: Exam[];
  grading: { name: string; pct: number }[];
  aiPolicy: string; // what the syllabus says about AI / collaboration
  basis: "syllabus" | "web" | "demo"; // what the course map was built from
  sources: Source[]; // web pages used when there was no syllabus
  createdAt: string;
}

export interface Question {
  id: string;
  topicId: string;
  kind: "mcq" | "free";
  prompt: string;
  choices: string[];
  answerIndex: number;
  solution: string;
  rubric: string[];
  difficulty: number;
}

export interface StoredCard {
  due: string;
  last_review?: string;
  [k: string]: unknown;
}

export interface TopicState {
  mastery: number; // 0..1
  attempts: number; // scored practice and review answers; teach-backs are not counted
  correct: number;
  card: StoredCard | null;
  calibration: { confidence: number; score: number }[];
}

export type HelpLevel = "hints" | "guided" | "full";

export const HELP_LEVELS: { id: HelpLevel; name: string; detail: string }[] = [
  { id: "hints", name: "Hints only", detail: "One hint at a time. Never a final answer; if a student stays stuck, the tutor works a different problem of the same type." },
  { id: "guided", name: "Guided help", detail: "Hints first, then the stuck step, with the next step handed back. A full solution only after a real attempt." },
  { id: "full", name: "Full solutions", detail: "Complete solutions are allowed once the student says what they tried, followed by a check question." },
];

export interface InstructorPolicy {
  helpLevel: HelpLevel;
  emphasis: string;
  notation: string;
  offLimits: string;
  allowedModes: ModeId[];
  attemptFirst: boolean;
}

export type Verdict = "correct" | "partial" | "incorrect";

export interface Grade {
  score: number; // 0..1
  feedback: string;
  missed: string[];
}

// The one place a score becomes a verdict, so labels and scheduling agree.
export const PASS_SCORE = 0.8;
export const verdictFor = (score: number): Verdict => (score >= PASS_SCORE ? "correct" : score >= 0.4 ? "partial" : "incorrect");

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// What the model is told about the topic being studied.
export interface TopicContext {
  courseCode: string;
  courseTitle: string;
  instructor?: string;
  topicTitle: string;
  topicSummary: string;
  objectives: string[];
  prereqTitles: string[];
  mastery?: number;
}

// Streamed replies are plain text. A failure after streaming has begun is sent
// as this marker followed by the message, so the client never mistakes an error
// for content.
export const STREAM_ERROR = "\u001e";

export const DEFAULT_POLICY: InstructorPolicy = {
  helpLevel: "guided",
  emphasis: "",
  notation: "",
  offLimits: "",
  allowedModes: ["walkthrough", "socratic", "visual", "derive", "recap"],
  attemptFirst: true,
};

export const EMPTY_TOPIC_STATE: TopicState = {
  mastery: 0,
  attempts: 0,
  correct: 0,
  card: null,
  calibration: [],
};
