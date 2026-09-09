// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnswerInput, sessionCharacters } from "./AnswerInput";
import { gradeAnswer, checkAnswer, newCard } from "./lib";
import {
  answerLearn,
  beginLearn,
  continueWave,
  learnComplete,
  learnProgress,
} from "./learn-engine";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
describe("0.1.3 grading", () => {
  it.each(["normal", "strict", "lenient"] as const)(
    "keeps accents independent from %s tolerance",
    (mode) => {
      expect(gradeAnswer("fata", "față", mode, true)).toBe("CLOSE");
      expect(gradeAnswer("fata", "față", mode, false)).toBe("INCORRECT");
      expect(gradeAnswer("cafe\u0301", "café", mode, false)).toBe("CORRECT");
    },
  );
  it("persists the shared preference and preserves numbers", () => {
    expect(checkAnswer("tara", "țară", "exact")).toBe(true);
    localStorage.setItem("flint-ignore-accents", "false");
    expect(checkAnswer("tara", "țară", "typo")).toBe(false);
    expect(gradeAnswer("formula 12", "formula 13")).toBe("INCORRECT");
  });
  it("detects normalized characters across all session cards", () => {
    expect(
      sessionCharacters([newCard("cafe\u0301", "țară"), newCard("é", "î")]),
    ).toEqual(["é", "î", "ă", "ț"]);
    expect(sessionCharacters([newCard("plain", "text")])).toEqual([]);
  });
  it("inserts at the selection instead of appending", () => {
    let value = "cafe";
    render(
      <AnswerInput
        cards={[newCard("café", "coffee")]}
        value={value}
        onValue={(next) => {
          value = next;
        }}
        aria-label="Answer"
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    input.setSelectionRange(3, 4);
    fireEvent.select(input);
    fireEvent.click(screen.getByRole("button", { name: "Insert é" }));
    expect(value).toBe("café");
  });
});
describe("Learn session lifecycle", () => {
  it("separates skipped answers and bounds reinforcement", () => {
    const cards = [newCard("a", "b")];
    let state = beginLearn(cards);
    for (let i = 0; i < 3; i++) {
      state = answerLearn(state, "DIDNT_KNOW");
      expect(learnProgress(state)).toBe(0);
      state = continueWave(state);
    }
    expect(state.didntKnow?.[cards[0].id]).toBe(3);
    expect(state.mistakes[cards[0].id]).toBe(6);
    expect(learnComplete(state)).toBe(true);
  });
  it("reintroduces recognition before recall and restarts at zero without mutating cards", () => {
    const cards = [newCard("a", "b")];
    const before = JSON.stringify(cards);
    let state = answerLearn(beginLearn(cards), true);
    state = continueWave(answerLearn(state, "DIDNT_KNOW"));
    expect(state.queue.map((q) => q.kind)).toEqual(["choice", "typed"]);
    state = answerLearn(answerLearn(state, true), true);
    expect(learnComplete(state)).toBe(true);
    expect(learnProgress(beginLearn(cards))).toBe(0);
    expect(JSON.stringify(cards)).toBe(before);
  });
});
