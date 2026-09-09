import { Card } from "./lib";
import { shuffle, sides, grade } from "./learn-engine";
export type TestKind = "choice" | "written" | "boolean" | "matching";
export type TestQuestion = {
  card: Card;
  kind: TestKind;
  prompt: string;
  promptImage?: string | null;
  answer: string;
  answerImage?: string | null;
  choices: { id: string; text: string; image?: string | null }[];
  claim?: string;
  claimImage?: string | null;
  truth?: boolean;
};
export function makeTest(
  cards: Card[],
  count: number,
  kinds: TestKind[],
  direction: "terms" | "definitions" | "both",
): TestQuestion[] {
  if (!kinds.length || count < 1) return [];
  return shuffle(cards)
    .slice(0, count)
    .map((card, index) => {
      const reverse =
        direction === "terms" ||
        (kinds[index % kinds.length] !== "matching" &&
          direction === "both" &&
          index % 2 === 0);
      const side = sides(card, reverse);
      let kind = kinds[index % kinds.length];
      if (!side.answer.trim() && kind === "written") kind = "choice";
      const options = shuffle([
        card,
        ...shuffle(cards.filter((c) => c.id !== card.id)).slice(
          0,
          kind === "matching" ? 7 : 3,
        ),
      ]).map((c) => {
        const s = sides(c, reverse);
        return { id: c.id, text: s.answer, image: s.answerImage };
      });
      const claimed =
        Math.random() < 0.5
          ? options.find((o) => o.id === card.id)!
          : options.find((o) => o.id !== card.id) || options[0];
      return {
        card,
        kind,
        prompt: side.prompt,
        promptImage: side.image,
        answer: side.answer,
        answerImage: side.answerImage,
        choices: options,
        claim: claimed.text,
        claimImage: claimed.image,
        truth: claimed.id === card.id,
      };
    })
    .map((question, _, all) =>
      question.kind !== "matching"
        ? question
        : {
            ...question,
            choices: all
              .filter((q) => q.kind === "matching")
              .map((q) => ({
                id: q.card.id,
                text: q.answer,
                image: q.answerImage,
              })),
          },
    );
}
export function testCorrect(q: TestQuestion, value: string | undefined) {
  if (!value?.trim()) return false;
  return q.kind === "written"
    ? grade(value, q.answer) !== "INCORRECT"
    : q.kind === "boolean"
      ? value === String(q.truth)
      : value === q.card.id;
}
export function testAnswer(q: TestQuestion, value: string | undefined) {
  return !value
    ? "Unanswered"
    : q.kind === "written"
      ? value
      : q.kind === "boolean"
        ? value === "true"
          ? "True"
          : "False"
        : q.choices.find((c) => c.id === value)?.text || "Image selection";
}
export const testLabels: Record<TestKind, string> = {
  choice: "Multiple choice",
  written: "Written",
  boolean: "True / False",
  matching: "Matching",
};
