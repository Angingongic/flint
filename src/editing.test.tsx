// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  renderHook,
  act,
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import {
  duplicateKind,
  resolveDuplicates,
  resolvedStars,
  trashVictims,
  moveFolder,
  useUndoState,
  editableTarget,
} from "./editing";
import { duplicateCandidates } from "./DuplicateReview";
import { cropBounds } from "./ImageCrop";
import { LibraryView } from "./LibraryView";
import { newCard, type Deck } from "./lib";
vi.mock("./native", () => ({
  exportDeckText: vi.fn(),
  mediaUrl: vi.fn(async (name: string) => name),
}));
afterEach(cleanup);
const card = {
  ...newCard("Café au lait", "Coffee with milk"),
  id: "a",
  repetitions: 9,
  questionImage: "photo.png",
};
const deck: Deck = {
  id: "a",
  title: "One",
  subject: "Language",
  color: "#f63",
  cards: [card],
  meta: { folder: "Old", starredCards: ["a"] },
};
describe("0.1.4 editing safety", () => {
  it("detects Unicode/case/whitespace duplicates and useful near matches without conflating different images", () => {
    const equivalent = {
      ...card,
      id: "b",
      question: "  CAFE\u0301  AU LAIT ",
      answer: "COFFEE WITH MILK",
    };
    expect(duplicateKind(card, equivalent)).toBe("exact");
    expect(duplicateKind(card, { ...card, question: "Café au laits" })).toBe(
      "near",
    );
    expect(
      duplicateKind(card, { ...card, questionImage: "different.png" }),
    ).toBeNull();
    expect(
      duplicateCandidates([card, equivalent, { ...equivalent, id: "c" }]).map(
        (c) => c.target.id,
      ),
    ).toEqual(["a", "a"]);
  });
  it("keeps, skips and replaces only explicit duplicate choices while preserving identity/history/stars", () => {
    const incoming = {
      ...card,
      id: "b",
      question: "CAFÉ AU LAIT",
      repetitions: 0,
    };
    expect(resolveDuplicates([card, incoming], [])).toHaveLength(2);
    expect(
      resolveDuplicates(
        [card, incoming],
        [{ cardId: "b", targetId: "a", action: "skip" }],
      ),
    ).toEqual([card]);
    const choices = [
      { cardId: "b", targetId: "a", action: "replace" as const },
    ];
    const result = resolveDuplicates([card, incoming], choices);
    expect(result).toEqual([{ ...card, question: incoming.question }]);
    expect(resolvedStars(["b"], result, choices)).toEqual(["a"]);
  });
  it("undo restores real card content, media, deletion, stars, bulk additions and order", () => {
    const original = [card, { ...card, id: "b", question: "Tea" }];
    const { result } = renderHook(() => useUndoState(original));
    const changes = [
      (old: typeof original) =>
        old.map((c) => ({ ...c, question: "Edited", answerImage: "new.webp" })),
      (old: typeof original) => old.slice(1),
      (old: typeof original) => [...old].reverse(),
      (old: typeof original) => [...old, { ...card, id: "c" }],
    ];
    for (const change of changes) {
      act(() => result.current[1](change));
      act(() => result.current[2]());
      expect(result.current[0]).toEqual(original);
    }
  });
  it("bounds and positions crops without touching the original", () => {
    expect(cropBounds(1000, 500, 1, 50, 50, 1)).toEqual({
      sx: 250,
      sy: 0,
      sw: 500,
      sh: 500,
    });
    expect(cropBounds(1000, 500, 2, 100, 100, 1)).toEqual({
      sx: 750,
      sy: 250,
      sw: 250,
      sh: 250,
    });
  });
  it("expires after exactly seven days and retains only five newest sets across serialization", () => {
    const now = Date.parse("2026-09-09T12:00:00Z");
    const decks = Array.from({ length: 6 }, (_, i) => ({
      ...deck,
      id: String(i),
      meta: { deletedAt: new Date(now - i * 1000).toISOString() },
    }));
    expect(trashVictims(JSON.parse(JSON.stringify(decks)), now)).toEqual(["5"]);
    expect(
      trashVictims(
        [
          {
            ...deck,
            meta: { deletedAt: new Date(now - 7 * 86400000).toISOString() },
          },
        ],
        now,
      ),
    ).toEqual([deck.id]);
    expect(
      trashVictims(
        [
          {
            ...deck,
            meta: { deletedAt: new Date(now - 7 * 86400000 + 1).toISOString() },
          },
        ],
        now,
      ),
    ).toEqual([]);
  });
  it("moves metadata only, preserving cards and study data", () => {
    const result = moveFolder([deck], [deck.id], " New ");
    expect(result[0].meta).toEqual({ ...deck.meta, folder: "New" });
    expect(result[0].cards).toBe(deck.cards);
    expect(moveFolder(result, [deck.id], "")[0].meta?.folder).toBe("");
  });
  it("guards normal typing including descendants of contenteditable fields", () => {
    const view = render(
      <>
        <input aria-label="Text" />
        <div contentEditable suppressContentEditableWarning>
          <span>Typing</span>
        </div>
        <button>Action</button>
      </>,
    );
    expect(editableTarget(screen.getByRole("textbox"))).toBe(true);
    expect(editableTarget(screen.getByText("Typing"))).toBe(true);
    expect(editableTarget(screen.getByRole("button"))).toBe(false);
    view.unmount();
  });
  it("requires confirmation for drag-created folders, supports rename and warns before deleting all member sets", async () => {
    const batch = vi.fn();
    function Library() {
      const [decks, setDecks] = useState([
        deck,
        { ...deck, id: "b", title: "Two", meta: {} },
      ]);
      return (
        <LibraryView
          decks={decks}
          globalQuery=""
          create={() => {}}
          start={() => {}}
          actions={{
            update: async () => {},
            duplicate: async () => {},
            export: async () => {},
            edit: () => {},
            batch: async (changed) => {
              batch(changed);
              setDecks((old) =>
                old.map((d) => changed.find((c) => c.id === d.id) || d),
              );
            },
          }}
        />
      );
    }
    render(<Library />);
    const wrappers = document.querySelectorAll(".deck-drop-wrap"),
      dataTransfer = { setData: vi.fn(), effectAllowed: "" };
    fireEvent.dragStart(wrappers[0], { dataTransfer });
    fireEvent.drop(wrappers[1], { dataTransfer });
    expect(batch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Folder name" }), {
      target: { value: "Together" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create folder" }));
    await screen.findByRole("button", { name: "Rename folder Together" });
    expect(batch.mock.calls[0][0]).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", { name: "Rename folder Together" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Folder name" }), {
      target: { value: "Renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rename folder" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete folder Renamed" }),
    );
    expect(screen.getByText(/All 2 sets in this folder/)).toBeTruthy();
    expect(batch).toHaveBeenCalledTimes(2);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete folder and move sets to Trash",
      }),
    );
    await waitFor(() => expect(batch).toHaveBeenCalledTimes(3));
    expect(batch.mock.calls[2][0].every((d: Deck) => d.meta?.deletedAt)).toBe(
      true,
    );
    expect(screen.queryByRole("button", { name: "Due" })).toBeNull();
  });
});
