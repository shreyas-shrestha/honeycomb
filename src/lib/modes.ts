import type { ModeId } from "./types";

export interface Mode {
  id: ModeId;
  name: string;
  blurb: string;
  bestFor: string;
  // Instruction handed to the model when it writes a lesson in this mode.
  brief: string;
}

// These are explanation formats a learner picks per topic, not fixed "learning
// styles". Matching instruction to a diagnosed style has no good evidence
// behind it; choosing a format that fits the content and your current level does.
export const MODES: Mode[] = [
  {
    id: "walkthrough",
    name: "Worked example",
    blurb: "See one solved step by step, then finish the next one yourself.",
    bestFor: "New material, procedures, problem types",
    brief:
      "Teach through worked examples with fading. Open with two or three sentences on the core idea. Then give one fully worked example where every step states the reason for the step, not just the algebra. Then give a second, similar problem with the last one or two steps left for the learner, marked 'Your turn'. Do not solve the 'Your turn' steps.",
  },
  {
    id: "socratic",
    name: "Question-led",
    blurb: "Get to the idea through a sequence of questions you answer.",
    bestFor: "When you half know it and want it to stick",
    brief:
      "Teach as a ladder of five to seven questions that lead the learner to construct the idea themselves, starting from what the prerequisites give them. After each question put the answer inside a collapsed block using the HTML form <details><summary>Check</summary>answer</details> so the learner commits to a guess first. End with a two-sentence statement of the idea.",
  },
  {
    id: "visual",
    name: "Picture it",
    blurb: "Tables, traces and analogies first, formal statement second.",
    bestFor: "Structures, processes, anything spatial",
    brief:
      "Lead with a concrete picture: a small traced example in a Markdown table, a state-by-state trace, or a text diagram in a code block. Place the words that explain a picture directly beside it. Use one everyday analogy and say where the analogy breaks. Only after the picture give the formal definition or formula.",
  },
  {
    id: "derive",
    name: "Derive it",
    blurb: "Build the result from definitions so you know why it is true.",
    bestFor: "Proofs, formulas you keep forgetting",
    brief:
      "Derive the result from definitions and prerequisites. State what is assumed, then build up in numbered steps, each justified. Pause twice with a short 'Why does this step work?' question whose answer sits in a <details><summary>Check</summary>answer</details> block. Finish with the result and the one condition under which it fails.",
  },
  {
    id: "recap",
    name: "Fast recap",
    blurb: "A dense one-screen summary for things you mostly know.",
    bestFor: "Night-before review, refreshing old topics",
    brief:
      "Write a dense recap that fits on one screen: the definitions, the key formulas or invariants, a table of cases or complexities where it applies, and the three mistakes students most often make on exams. No motivation, no long prose.",
  },
];

export const modeById = (id: ModeId) => MODES.find((m) => m.id === id) ?? MODES[0];
