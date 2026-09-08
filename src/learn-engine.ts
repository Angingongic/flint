import { Card, checkAnswer, normalize, levenshtein } from "./lib";

export type Question = {
  cardId: string;
  kind: "choice" | "typed";
  reverse: boolean;
};
export type Mastery = "New" | "Learning" | "Familiar" | "Mastered";
export type LearnOptions = {
  waveSize: number;
  direction: "terms" | "definitions" | "mixed";
  grading: "normal" | "strict" | "lenient";
};
export type WaveState = {
  version: 1;
  ids: string[];
  options: LearnOptions;
  introduced: number;
  wave: string[];
  queue: Question[];
  mastery: Record<string, Mastery>;
  mistakes: Record<string, number>;
  checkpoint: boolean;
  rounds: number;
};
export const defaultOptions: LearnOptions = {
  waveSize: 4,
  direction: "terms",
  grading: "normal",
};
export function waveQuestions(
  ids: string[],
  options: LearnOptions,
  round: number,
): Question[] {
  const make = (kind: Question["kind"]) =>
    ids.map((cardId, index) => ({
      cardId,
      kind,
      reverse:
        options.direction === "terms" ||
        (options.direction === "mixed" && (index + round) % 2 === 0),
    }));
  return [...make("choice"), ...make("typed")];
}
export function beginLearn(cards: Card[], options = defaultOptions): WaveState {
  const ids = cards.map((c) => c.id),
    wave = ids.slice(0, options.waveSize);
  return {
    version: 1,
    ids,
    options,
    introduced: wave.length,
    wave,
    queue: waveQuestions(wave, options, 0),
    mastery: Object.fromEntries(ids.map((id) => [id, "New"])),
    mistakes: {},
    checkpoint: false,
    rounds: 0,
  };
}
export function grade(
  input: string,
  expected: string,
  grading: LearnOptions["grading"] = "normal",
): "CORRECT" | "CLOSE" | "INCORRECT" {
  if (!input.trim() || !expected.trim()) return "INCORRECT";
  if (grading === "strict")
    return checkAnswer(input, expected, "exact") ? "CORRECT" : "INCORRECT";
  const clean = (s: string) =>
    s.replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
  if (checkAnswer(clean(input), clean(expected), "ignore")) return "CORRECT";
  if (
    (input.match(/\d+/g) || []).join() !== (expected.match(/\d+/g) || []).join()
  )
    return "INCORRECT";
  if (normalize(expected).length < 5) return "INCORRECT";
  if (grading === "lenient")
    return levenshtein(normalize(clean(input)), normalize(clean(expected))) <=
      Math.max(1, Math.floor(normalize(expected).length * 0.15))
      ? "CLOSE"
      : "INCORRECT";
  return checkAnswer(clean(input), clean(expected), "typo")
    ? "CLOSE"
    : "INCORRECT";
}
export function answerLearn(state: WaveState, correct: boolean): WaveState {
  const question = state.queue[0];
  if (!question) return state;
  const mastery = { ...state.mastery },
    mistakes = { ...state.mistakes };
  mastery[question.cardId] = correct
    ? question.kind === "typed"
      ? "Mastered"
      : "Familiar"
    : "Learning";
  if (!correct)
    mistakes[question.cardId] = (mistakes[question.cardId] || 0) + 1;
  const queue = state.queue.slice(1);
  return { ...state, queue, mastery, mistakes, checkpoint: queue.length === 0 };
}
export function continueWave(state: WaveState): WaveState {
  // Reinforce only concepts still weak; recognized concepts must pass recall.
  const weak = state.wave.filter((id) => state.mastery[id] !== "Mastered");
  const wave = weak.length
    ? weak
    : state.ids.slice(
        state.introduced,
        state.introduced + state.options.waveSize,
      );
  const rounds = state.rounds + 1;
  return {
    ...state,
    wave,
    rounds,
    introduced: state.introduced + (weak.length ? 0 : wave.length),
    queue: waveQuestions(wave, state.options, rounds),
    checkpoint: false,
  };
}
export function learnProgress(state: WaveState): number {
  const weights = { New: 0, Learning: 0.15, Familiar: 0.5, Mastered: 1 };
  return state.ids.length
    ? Math.round(
        (state.ids.reduce((n, id) => n + weights[state.mastery[id]], 0) /
          state.ids.length) *
          100,
      )
    : 0;
}
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function sides(card: Card, reverse: boolean) {
  return reverse
    ? {
        prompt: card.answer,
        image: card.answerImage,
        answer: card.question,
        answerImage: card.questionImage,
      }
    : {
        prompt: card.question,
        image: card.questionImage,
        answer: card.answer,
        answerImage: card.answerImage,
      };
}
