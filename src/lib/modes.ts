import type { ModeId } from "./types";

export interface Mode {
  id: ModeId;
  name: string;
  blurb: string;
  // Instruction handed to the model when it writes a lesson in this mode.
  brief: string;
}

// Formats the learner picks per topic. Why these are not "learning styles": docs/PLAN.md, section 2.
export const MODES: Mode[] = [
  {
    id: "walkthrough",
    name: "Worked example",
    blurb: "One problem solved step by step, then a similar one you finish. Use it for new material.",
    brief:
      "Teach through worked examples with fading. Open with two or three sentences on the core idea. Then give one fully worked example where every step states the reason for the step, not just the algebra. Then give a second, similar problem with the last one or two steps left for the learner, marked 'Your turn'. Do not solve the 'Your turn' steps.",
  },
  {
    id: "socratic",
    name: "Question-led",
    blurb: "A series of questions that lead you to the idea. Use it when you half know the topic.",
    brief:
      "Teach as a ladder of five to seven questions that lead the learner to construct the idea themselves, starting from what the prerequisites give them. After each question put the answer inside a collapsed block written exactly like this, with a blank line after the summary line and a blank line before the closing tag so the answer renders as Markdown:\n\n<details>\n<summary>Check</summary>\n\nanswer\n\n</details>\n\nThis makes the learner commit to a guess first. End with a two-sentence statement of the idea.",
  },
  {
    id: "visual",
    name: "Picture it",
    blurb: "Starts with a table or a trace and gives the formal definition after.",
    brief:
      "Lead with a concrete picture: a small traced example in a Markdown table, a state-by-state trace, or a text diagram in a code block. Place the words that explain a picture directly beside it. Use one everyday analogy and say where the analogy breaks. Only after the picture give the formal definition or formula.",
  },
  {
    id: "derive",
    name: "Derive it",
    blurb: "Builds the result from the definitions. Use it for proofs and formulas you keep forgetting.",
    brief:
      "Derive the result from definitions and prerequisites. State what is assumed, then build up in numbered steps, each justified. Pause twice with a short 'Why does this step work?' question whose answer sits in a collapsed block written exactly like this, with a blank line after the summary line and a blank line before the closing tag so the answer renders as Markdown:\n\n<details>\n<summary>Check</summary>\n\nanswer\n\n</details>\n\n Finish with the result and the one condition under which it fails.",
  },
  {
    id: "recap",
    name: "Fast recap",
    blurb: "A one-screen summary for the night before.",
    brief:
      "Write a dense recap that fits on one screen: the definitions, the key formulas or invariants, a table of cases or complexities where it applies, and the three mistakes students most often make on exams. No motivation, no long prose.",
  },
];

export const modeById = (id: ModeId) => MODES.find((m) => m.id === id) ?? MODES[0];
