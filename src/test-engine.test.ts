import { describe, it, expect } from "vitest";
import { makeTest, testCorrect, testAnswer, testRows } from "./test-engine";
import { newCard } from "./lib";
const cards = [
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Purple",
  "Orange",
  "Black",
  "White",
].map((n) => newCard(n, "Color " + n));
describe("fixed test generation", () => {
  it("generates every requested question type with stable correct choices and grades them", () => {
    const test = makeTest(
      cards,
      8,
      ["choice", "written", "boolean", "matching"],
      "definitions",
    );
    expect(test.filter((q) => q.kind === "matching")).toHaveLength(1);
    expect(test.find((q) => q.kind === "matching")?.matchRows).toHaveLength(2);
    expect(new Set(testRows(test).map((q) => q.card.id)).size).toBe(8);
    for (const q of testRows(test)) {
      const answer =
        q.kind === "written"
          ? q.answer
          : q.kind === "boolean"
            ? String(q.truth)
            : q.card.id;
      expect(testCorrect(q, answer)).toBe(true);
      expect(testCorrect(q, undefined)).toBe(false);
      expect(q.choices.some((c) => c.id === q.card.id)).toBe(true);
      expect(testAnswer(q, undefined)).toBe("Unanswered");
    }
  });
  it("never emits a singleton, avoids remainders and duplicate cards across many random tests", () => {
    for (let n = 1; n <= 40; n++)
      for (let trial = 0; trial < 20; trial++) {
        const pool = Array.from({ length: n }, (_, i) =>
          newCard(`Term ${i}`, `Answer ${i}`),
        );
        const test = makeTest(pool, n, ["matching"], "definitions");
        expect(testRows(test)).toHaveLength(n);
        expect(new Set(testRows(test).map((q) => q.card.id)).size).toBe(n);
        for (const group of test.filter((q) => q.kind === "matching")) {
          expect(group.matchRows!.length).toBeGreaterThanOrEqual(
            n === 2 ? 2 : 3,
          );
          expect(group.matchRows!.length).toBeLessThanOrEqual(5);
          expect(group.initialOrder).not.toEqual(
            group.matchRows!.map((q) => q.card.id),
          );
          expect(new Set(group.initialOrder).size).toBe(
            group.matchRows!.length,
          );
        }
        if (n === 6)
          expect(test.map((q) => q.matchRows?.length)).toEqual([3, 3]);
        if (n === 1) expect(test[0].kind).not.toBe("matching");
      }
  });
  it("deduplicates normalized cards and keeps ambiguous sides out of each matching group", () => {
    const pool = [
      newCard("Café", "coffee"),
      newCard(" cafe\u0301 ", "COFFEE"),
      newCard("Coffee", "coffee"),
      newCard("Tea", "tea"),
      newCard("Water", "water"),
    ];
    const test = makeTest(pool, 5, ["matching"], "definitions");
    expect(testRows(test)).toHaveLength(4);
    for (const q of test.filter((q) => q.matchRows))
      expect(
        new Set(q.matchRows!.map((row) => row.answer.toLowerCase())).size,
      ).toBe(q.matchRows!.length);
  });
  it("supports terms and mixed directions without altering source cards", () => {
    const before = JSON.stringify(cards);
    const terms = makeTest(cards, 4, ["written"], "terms");
    for (const q of terms) {
      expect(q.prompt).toBe(q.card.answer);
      expect(q.answer).toBe(q.card.question);
    }
    const both = makeTest(cards, 4, ["choice"], "both");
    expect(both[0].prompt).toBe(both[0].card.answer);
    expect(both[1].prompt).toBe(both[1].card.question);
    expect(JSON.stringify(cards)).toBe(before);
  });
  it("keeps image-only answers usable and handles a single-card true/false test", () => {
    const image = { ...cards[0], answer: "", answerImage: "image.png" };
    expect(makeTest([image], 1, ["written"], "definitions")[0].kind).toBe(
      "choice",
    );
    const q = makeTest([cards[0]], 1, ["boolean"], "definitions")[0];
    expect(q.truth).toBe(true);
    expect(testCorrect(q, "true")).toBe(true);
  });
});
