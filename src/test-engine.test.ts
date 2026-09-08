import { describe, it, expect } from "vitest";
import { makeTest, testCorrect, testAnswer } from "./test-engine";
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
    expect(test.map((q) => q.kind)).toEqual([
      "choice",
      "written",
      "boolean",
      "matching",
      "choice",
      "written",
      "boolean",
      "matching",
    ]);
    expect(new Set(test.map((q) => q.card.id)).size).toBe(8);
    for (const q of test) {
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
