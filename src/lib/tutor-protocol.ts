// The few fixed strings and limits the tutor panel and the server must agree on.
export const MAX_HINTS = 3;
export const MIN_ATTEMPT_CHARS = 15;
// How many guarded replies one sitting of a question can draw, hints included.
export const MAX_GUARDED_TURNS = 12;

const ATTEMPT = /^My attempt:\s*/i;
export const attemptMessage = (text: string) => `My attempt: ${text.trim()}`;
// True for a message that states an attempt long enough to count.
export const isAttempt = (content: string) => ATTEMPT.test(content.trim()) && content.trim().replace(ATTEMPT, "").length >= MIN_ATTEMPT_CHARS;

export const hintMessage = (level: number) => `Hint ${level}, please.`;
export const isHintRequest = (content: string) => /^Hint [1-3], please\.$/.test(content.trim());
