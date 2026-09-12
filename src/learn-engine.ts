import { Card, gradeAnswer } from "./lib";

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
  didntKnow?: Record<string, number>;
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
  accents?: boolean,
): "CORRECT" | "CLOSE" | "INCORRECT" {
  return gradeAnswer(input, expected, grading, accents);
}
export function answerLearn(
  state: WaveState,
  outcome: boolean | "DIDNT_KNOW",
): WaveState {
  const question = state.queue[0];
  if (!question) return state;
  const correct = outcome === true;
  const didntKnow = { ...state.didntKnow };
  if (outcome === "DIDNT_KNOW")
    didntKnow[question.cardId] = (didntKnow[question.cardId] || 0) + 1;
  const mastery = { ...state.mastery },
    mistakes = { ...state.mistakes };
  mastery[question.cardId] = correct
    ? question.kind === "typed"
      ? "Mastered"
      : "Familiar"
    : outcome === "DIDNT_KNOW" && mastery[question.cardId] === "New"
      ? "New"
      : "Learning";
  if (!correct)
    mistakes[question.cardId] =
      (mistakes[question.cardId] || 0) + (outcome === "DIDNT_KNOW" ? 2 : 1);
  const queue = state.queue.slice(1);
  // A skipped recognition must be recognized again before its typed recall.
  if (outcome === "DIDNT_KNOW" && question.kind === "choice") {
    const typed = queue.findIndex(
      (q) => q.cardId === question.cardId && q.kind === "typed",
    );
    if (typed >= 0) queue.splice(typed, 1);
  }
  return {
    ...state,
    queue,
    mastery,
    mistakes,
    didntKnow,
    checkpoint: queue.length === 0,
  };
}
export const learnComplete = (state: WaveState) =>
  !state.queue.length &&
  state.introduced >= state.ids.length &&
  (state.wave.length === 0 ||
    state.ids.every((id) => state.mastery[id] === "Mastered"));
export function continueWave(state: WaveState): WaveState {
  // Reinforce only concepts still weak; recognized concepts must pass recall.
  const weak = state.wave.filter(
    (id) =>
      state.mastery[id] !== "Mastered" && (state.didntKnow?.[id] || 0) < 3,
  );
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
        audio: card.answerAudio,
        answer: card.question,
        answerImage: card.questionImage,
        answerAudio: card.questionAudio,
      }
    : {
        prompt: card.question,
        image: card.questionImage,
        audio: card.questionAudio,
        answer: card.answer,
        answerImage: card.answerImage,
        answerAudio: card.answerAudio,
      };
}
