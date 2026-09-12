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
      6,
      ["choice", "written", "boolean", "matching"],
      "definitions",
    );
    expect(test.filter((q) => q.kind === "matching")).toHaveLength(1);
    expect(test.find((q) => q.kind === "matching")?.matchRows).toHaveLength(3);
    expect(test).toHaveLength(6);
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
        expect(test).toHaveLength(Math.floor(n / 3));
        expect(new Set(testRows(test).map((q) => q.card.id)).size).toBe(
          testRows(test).length,
        );
        if (n >= 3) expect(testRows(test)).toHaveLength(n);
        for (const group of test.filter((q) => q.kind === "matching")) {
          expect(group.matchRows!.length).toBeGreaterThanOrEqual(3);
          expect(group.matchRows!.length).toBeLessThanOrEqual(6);
          expect(group.initialOrder).not.toEqual(
            group.matchRows!.map((q) => q.card.id),
          );
          expect(new Set(group.initialOrder).size).toBe(
            group.matchRows!.length,
          );
        }
        if (n === 6)
          expect(test.map((q) => q.matchRows?.length)).toEqual([3, 3]);
        if (n < 3) expect(test).toEqual([]);
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
    expect(testRows(test)).toHaveLength(3);
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
it.each([
  [30, 10, 3],
  [40, 10, 4],
  [50, 10, 5],
  [60, 10, 6],
  [24, 8, 3],
])(
  "distributes %i cards into %i actual matching questions",
  (available, boards, pairs) => {
    const pool = Array.from({ length: available }, (_, i) =>
      newCard("Front " + i, "Back " + i),
    );
    const result = makeTest(pool, 10, ["matching"], "definitions");
    expect(result).toHaveLength(boards);
    expect(result.every((q) => q.matchRows?.length === pairs)).toBe(true);
  },
);
it("fills requested slots with enabled non-matching types without tiny boards", () => {
  const pool = Array.from({ length: 24 }, (_, i) =>
    newCard("Front " + i, "Back " + i),
  );
  const result = makeTest(pool, 10, ["matching", "written"], "definitions");
  expect(result).toHaveLength(10);
  expect(
    result
      .filter((q) => q.kind === "matching")
      .every((q) => q.matchRows!.length >= 3 && q.matchRows!.length <= 6),
  ).toBe(true);
  expect(
    makeTest(pool.slice(0, 2), 2, ["matching", "written"], "definitions").every(
      (q) => q.kind === "written",
    ),
  ).toBe(true);
});
