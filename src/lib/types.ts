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
  date: string | null; // ISO date, null when the syllabus does not say
  weightPct: number | null;
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
  source: "demo" | "ai";
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
  attempts: number;
  correct: number;
  card: StoredCard | null;
  lastSeen: string | null;
  calibration: { confidence: number; score: number }[];
  taughtBack: boolean;
}

export type HelpLevel = "hints" | "guided" | "full";

export interface InstructorPolicy {
  helpLevel: HelpLevel;
  emphasis: string;
  notation: string;
  offLimits: string;
  allowedModes: ModeId[];
  attemptFirst: boolean;
}

export interface Grade {
  score: number; // 0..1
  verdict: "correct" | "partial" | "incorrect";
  feedback: string;
  missed: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

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
  lastSeen: null,
  calibration: [],
  taughtBack: false,
};
