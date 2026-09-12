import { Card } from "./lib";
import { shuffle, sides, grade } from "./learn-engine";
export type TestKind = "choice" | "written" | "boolean" | "matching";
export type TestQuestion = {
  card: Card;
  kind: TestKind;
  prompt: string;
  promptImage?: string | null;
  promptAudio?: string | null;
  answer: string;
  answerImage?: string | null;
  answerAudio?: string | null;
  choices: {
    id: string;
    text: string;
    image?: string | null;
    audio?: string | null;
  }[];
  claim?: string;
  claimImage?: string | null;
  claimAudio?: string | null;
  truth?: boolean;
  /** Matching is one question containing independently scored rows. */
  matchRows?: TestQuestion[];
  initialOrder?: string[];
};
const textKey = (text: string) =>
  text.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
export const cardKey = (card: Card) =>
  JSON.stringify([
    textKey(card.question),
    textKey(card.answer),
    card.questionImage || "",
    card.answerImage || "",
    card.questionAudio || "",
    card.answerAudio || "",
  ]);
export function matchingGroupSize(
  remaining: number,
  boards = Math.floor(remaining / 3),
): number {
  return remaining < 3 || boards < 1
    ? 0
    : Math.min(6, Math.floor(remaining / boards));
}
export function shuffledAnswerOrder(ids: string[]): string[] {
  const order = shuffle(ids);
  // A coincidentally solved shuffle is not a meaningful starting question.
  if (ids.length > 1 && order.every((id, i) => id === ids[i]))
    order.push(order.shift()!);
  return order;
}
export const testRows = (questions: TestQuestion[]) =>
  questions.flatMap((q) => q.matchRows || [q]);
export function makeTest(
  cards: Card[],
  count: number,
  kinds: TestKind[],
  direction: "terms" | "definitions" | "both",
): TestQuestion[] {
  if (!kinds.length || !Number.isInteger(count) || count < 1) return [];
  const seen = new Set<string>(),
    ids = new Set<string>();
  const eligible = cards.filter((card) => {
    const key = cardKey(card);
    if (seen.has(key) || ids.has(card.id)) return false;
    seen.add(key);
    ids.add(card.id);
    return true;
  });
  const selected = shuffle(eligible);
  const make = (card: Card, kind: TestKind, index: number): TestQuestion => {
    const reverse =
      direction === "terms" ||
      (kind !== "matching" && direction === "both" && index % 2 === 0);
    const side = sides(card, reverse);
    if (!side.answer.trim() && kind === "written") kind = "choice";
    const options = shuffle([
      card,
      ...shuffle(eligible.filter((c) => c.id !== card.id)).slice(
        0,
        kind === "matching" ? 7 : 3,
      ),
    ]).map((c) => {
      const s = sides(c, reverse);
      return {
        id: c.id,
        text: s.answer,
        image: s.answerImage,
        audio: s.answerAudio,
      };
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
      promptAudio: side.audio,
      answer: side.answer,
      answerImage: side.answerImage,
      answerAudio: side.answerAudio,
      choices: options,
      claim: claimed.text,
      claimImage: claimed.image,
      claimAudio: claimed.audio,
      truth: claimed.id === card.id,
    };
  };
  const questions: TestQuestion[] = [];
  const pool = [...selected];
  const singles = kinds.filter((kind) => kind !== "matching");
  const target = Math.min(count, eligible.length);
  let boards = !kinds.includes("matching")
    ? 0
    : singles.length
      ? Math.min(
          Math.ceil(target / kinds.length),
          Math.floor((eligible.length - target) / 2),
        )
      : Math.min(count, Math.floor(eligible.length / 3));
  const singleSlots = singles.length ? target - boards : 0;
  while (boards > 0) {
    // Remove ambiguity inside each group: identical visible sides cannot be graded uniquely.
    const unique: Card[] = [],
      deferred: Card[] = [];
    const prompts = new Set<string>(),
      answers = new Set<string>();
    for (const card of pool) {
      const side = sides(card, direction === "terms");
      const p = JSON.stringify([
          textKey(side.prompt),
          side.image || "",
          side.audio || "",
        ]),
        a = JSON.stringify([
          textKey(side.answer),
          side.answerImage || "",
          side.answerAudio || "",
        ]);
      if (prompts.has(p) || answers.has(a)) {
        deferred.push(card);
        continue;
      }
      prompts.add(p);
      answers.add(a);
      unique.push(card);
    }
    const size = Math.min(
      unique.length,
      matchingGroupSize(pool.length - singleSlots, boards),
    );
    if (size < 3) break;
    const group = unique.splice(0, size);
    pool.splice(0, pool.length, ...unique, ...deferred);
    const rows = group.map((card, index) => make(card, "matching", index));
    const choices = rows.map((q) => ({
      id: q.card.id,
      text: q.answer,
      image: q.answerImage,
      audio: q.answerAudio,
    }));
    rows.forEach((row) => (row.choices = choices));
    boards--;
    questions.push({
      ...rows[0],
      matchRows: rows,
      initialOrder: shuffledAnswerOrder(rows.map((q) => q.card.id)),
    });
  }
  if (singles.length) {
    while (pool.length && questions.length < target) {
      questions.push(
        make(
          pool.shift()!,
          singles[questions.length % singles.length],
          questions.length,
        ),
      );
    }
  }
  return questions;
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
