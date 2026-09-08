import { describe, it, expect } from "vitest";
import { newCard } from "./lib";
import {
  beginLearn,
  answerLearn,
  continueWave,
  grade,
  learnProgress,
} from "./learn-engine";
describe("wave engine", () => {
  it("does not treat different numbers or short answers as spelling mistakes", () => {
    expect(grade("Term 2", "Term 1")).toBe("INCORRECT");
    expect(grade("ADP", "ATP")).toBe("INCORRECT");
  });
  const cards = Array.from({ length: 12 }, (_, i) => ({
    ...newCard("Term " + i, "Answer " + i),
    id: String(i),
  }));
  it("introduces four concepts as MC then recalls those same four before introducing E", () => {
    let state = beginLearn(cards);
    expect(state.queue.map((q) => q.cardId + ":" + q.kind)).toEqual([
      "0:choice",
      "1:choice",
      "2:choice",
      "3:choice",
      "0:typed",
      "1:typed",
      "2:typed",
      "3:typed",
    ]);
    for (let i = 0; i < 8; i++) state = answerLearn(state, true);
    expect(state.checkpoint).toBe(true);
    expect(learnProgress(state)).toBe(33);
    state = continueWave(state);
    expect(state.queue[0]).toMatchObject({ cardId: "4", kind: "choice" });
  });
  it("reintroduces a missed typed B as recognition then recall without repeating mastered peers", () => {
    let state = beginLearn(cards);
    for (let i = 0; i < 8; i++) state = answerLearn(state, i !== 5);
    expect(state.mastery["1"]).toBe("Learning");
    state = continueWave(state);
    expect(state.queue.map((q) => q.cardId + ":" + q.kind)).toEqual([
      "1:choice",
      "1:typed",
    ]);
    state = answerLearn(answerLearn(state, true), true);
    state = continueWave(state);
    expect(state.queue[0].cardId).toBe("4");
  });
  it("serializes exact pending queue, progress and mastery across exit/reopen", () => {
    let state = beginLearn(cards);
    state = answerLearn(state, true);
    state = answerLearn(state, false);
    const restored = JSON.parse(JSON.stringify(state));
    expect(restored).toEqual(state);
    expect(answerLearn(restored, true)).toEqual(answerLearn(state, true));
  });
  it("progress depends on mastery and a recognition answer does not graduate a concept", () => {
    const state = answerLearn(beginLearn(cards), true);
    expect(state.mastery["0"]).toBe("Familiar");
    expect(learnProgress(state)).toBe(4);
  });
  it("distinguishes correct, close and wrong while accepting case punctuation and hyphens", () => {
    expect(grade(" CELL-membrane! ", "cell membrane")).toBe("CORRECT");
    expect(grade("mitochndria", "mitochondria")).toBe("CLOSE");
    expect(grade("ribosome", "mitochondria")).toBe("INCORRECT");
    expect(grade("ATP", "atp", "strict")).toBe("INCORRECT");
  });
});
