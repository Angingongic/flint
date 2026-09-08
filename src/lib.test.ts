import { describe, it, expect } from "vitest";
import {
  checkAnswer,
  parseCards,
  parseDelimited,
  findDuplicates,
  dueCards,
  weakCards,
  newCard,
  Deck,
  seed,
  canCreateDeck,
  isValidCardDraft,
  parseCardsDetailed,
} from "./lib";
describe("fresh install", () =>
  it("contains no production demo decks", () => expect(seed).toEqual([])));
describe("answer matching", () => {
  it("matches exact answers", () =>
    expect(checkAnswer("ATP", "ATP")).toBe(true));
  it("keeps exact mode case-sensitive", () =>
    expect(checkAnswer("atp", "ATP", "exact")).toBe(false));
  it("rejects different exact content", () =>
    expect(checkAnswer("ATP", "ADP")).toBe(false));
  it("ignores capitalization", () =>
    expect(checkAnswer("Mitochondria", "mitochondria")).toBe(true));
  it("ignores punctuation", () =>
    expect(checkAnswer("cell membrane!", "cell membrane")).toBe(true));
  it("allows a minor typo", () =>
    expect(checkAnswer("photosythesis", "photosynthesis", "typo")).toBe(true));
  it("rejects major typos", () =>
    expect(checkAnswer("photo", "photosynthesis", "typo")).toBe(false));
});
describe("imports", () => {
  it("parses tabs and generic separators", () =>
    expect(
      parseCards("Nucleus\tContains DNA\nRibosome - Makes proteins"),
    ).toHaveLength(2));
  it("cleans numbering and detects common separators", () =>
    expect(
      parseCards(
        "1. Mitochondria — Produces ATP\n2) Nucleus: Contains DNA\nRibosome | Makes proteins\nGolgi; Packages proteins",
      ),
    ).toHaveLength(4));
  it("detects alternating-line pairs", () =>
    expect(
      parseCards("Mitochondria\nProduces ATP\nNucleus\nContains DNA"),
    ).toHaveLength(2));
  it.each([
    ["tabs", "Mitochondria\tProduces ATP\nNucleus\tContains DNA"],
    ["colon", "Mitochondria: Produces ATP\nNucleus: Contains DNA"],
    ["dash", "Mitochondria - Produces ATP\nNucleus - Contains DNA"],
    ["pipe", "Mitochondria | Produces ATP\nNucleus | Contains DNA"],
    ["semicolon", "Mitochondria; Produces ATP\nNucleus; Contains DNA"],
    [
      "multiple spaces",
      "Mitochondria    Produces ATP\nNucleus    Contains DNA",
    ],
  ])("confidently detects %s", (format, input) => {
    const result = parseCardsDetailed(input);
    expect(result.format).toBe(format);
    expect(result.cards).toHaveLength(2);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });
  it("recognizes question-answer alternating lines", () => {
    const result = parseCardsDetailed(
      "What does the mitochondria do?\nProduces ATP\nWhere is DNA stored?\nThe nucleus",
    );
    expect(result.format).toBe("question-answer lines");
    expect(result.cards).toHaveLength(2);
  });
  it("handles hundreds of Quizlet-style tab rows without loss", () => {
    const input = Array.from(
      { length: 500 },
      (_, index) => `Term ${index}\tDefinition ${index}`,
    ).join("\n");
    expect(parseCardsDetailed(input).cards).toHaveLength(500);
  });
  it("uses a confidence fallback instead of importing malformed content", () => {
    const result = parseCardsDetailed(
      "Heading\nlonely malformed note\nthird line",
    );
    expect(result.format).toBeNull();
    expect(result.cards).toEqual([]);
  });
  it("does not import malformed lines", () =>
    expect(parseCards("heading only")).toEqual([]));
  it("parses quoted CSV", () =>
    expect(parseDelimited('"term, one","definition, one"\nterm2,def2')).toEqual(
      [
        ["term, one", "definition, one"],
        ["term2", "def2"],
      ],
    ));
  it("parses TSV", () =>
    expect(parseDelimited("term\tdefinition", "\t")[0]).toEqual([
      "term",
      "definition",
    ]));
  it("marks duplicate pairs only", () =>
    expect(
      findDuplicates([
        { question: "Cell!", answer: "Unit" },
        { question: "cell", answer: "unit" },
        { question: "cell", answer: "different" },
      ]),
    ).toEqual([false, true, false]));
});
describe("create validation", () => {
  const complete = { question: "Mitochondria", answer: "Produces ATP" };
  it("enables creation for a title and one valid card", () =>
    expect(canCreateDeck("Biology", [complete])).toBe(true));
  it("rejects whitespace-only titles", () =>
    expect(canCreateDeck("   ", [complete])).toBe(false));
  it("rejects incomplete and empty cards", () => {
    expect(isValidCardDraft({ question: "Term", answer: "" })).toBe(false);
    expect(canCreateDeck("Biology", [{ question: "", answer: "" }])).toBe(
      false,
    );
  });
  it("accepts intentionally image-only card sides", () =>
    expect(
      canCreateDeck("Anatomy", [
        { questionImage: "q.png", answerImage: "a.png" },
      ]),
    ).toBe(true));
});
describe("queues", () => {
  const past = newCard("past", "a"),
    future = newCard("future", "b");
  past.dueAt = "2020-01-01T00:00:00Z";
  past.lapses = 4;
  future.dueAt = "2099-01-01T00:00:00Z";
  const decks: Deck[] = [
    { id: "d", title: "D", subject: "", color: "#fff", cards: [future, past] },
  ];
  it("includes overdue but not future cards", () =>
    expect(dueCards(decks, new Date("2025-01-01"))).toEqual([past]));
  it("prioritizes repeated failures", () =>
    expect(weakCards(decks)[0]).toBe(past));
});
