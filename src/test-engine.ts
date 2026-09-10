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
  ]);
export function matchingGroupSize(remaining: number): number {
  if (remaining < 2) return 0;
  if (remaining <= 4) return remaining;
  // Prefer normal groups on both sides of the split; never leave a singleton.
  const sizes = [3, 4, 5].filter(
    (n) => remaining - n !== 1 && remaining - n !== 2,
  );
  return sizes[Math.floor(Math.random() * sizes.length)];
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
  const selected = shuffle(eligible).slice(0, count);
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
  };
  const questions: TestQuestion[] = [],
    pool: Card[] = [];
  selected.forEach((card, index) => {
    const kind = kinds[index % kinds.length];
    if (kind === "matching") pool.push(card);
    else questions.push(make(card, kind, index));
  });
  const fallback = (card: Card) =>
    make(
      card,
      kinds.find((kind) => kind === "written" || kind === "choice") ||
        (sides(card, direction === "terms").answer.trim()
          ? "written"
          : "choice"),
      questions.length,
    );
  while (pool.length) {
    // Remove ambiguity inside each group: identical visible sides cannot be graded uniquely.
    const unique: Card[] = [],
      deferred: Card[] = [];
    const prompts = new Set<string>(),
      answers = new Set<string>();
    for (const card of pool) {
      const side = sides(card, direction === "terms");
      const p = JSON.stringify([textKey(side.prompt), side.image || ""]),
        a = JSON.stringify([textKey(side.answer), side.answerImage || ""]);
      if (prompts.has(p) || answers.has(a)) {
        deferred.push(card);
        continue;
      }
      prompts.add(p);
      answers.add(a);
      unique.push(card);
    }
    const size = matchingGroupSize(unique.length);
    if (!size) {
      questions.push(...pool.map(fallback));
      break;
    }
    const group = unique.splice(0, size);
    pool.splice(0, pool.length, ...unique, ...deferred);
    const rows = group.map((card, index) => make(card, "matching", index));
    const choices = rows.map((q) => ({
      id: q.card.id,
      text: q.answer,
      image: q.answerImage,
    }));
    rows.forEach((row) => (row.choices = choices));
    questions.push({
      ...rows[0],
      matchRows: rows,
      initialOrder: shuffledAnswerOrder(rows.map((q) => q.card.id)),
    });
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
