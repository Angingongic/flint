// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Matching, moveAnswer } from "./Matching";
import { makeTest, testCorrect, testRows } from "./test-engine";
import { TestView } from "./TestView";
import { newCard, type Deck } from "./lib";
import { PortableSets, importConflicts } from "./PortableSet";
import { invoke } from "@tauri-apps/api/core";
import { recordTestAttempt } from "./native";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => "sample.flint"),
}));
vi.mock("./native", () => ({
  inTauri: () => true,
  mediaUrl: vi.fn(async (name: string) => name || ""),
  recordTestAttempt: vi.fn(async () => {}),
}));
const cards = [
  { ...newCard("café", "coffee"), id: "a" },
  { ...newCard("țară", "country"), id: "b" },
  { ...newCard("chat", "cat"), id: "c" },
];
const deck: Deck = {
  id: "shared",
  title: "Languages",
  subject: "French",
  color: "#f63",
  cards,
  coverImage: "flint:preset/ember",
  meta: { tags: ["Unicode"] },
};
beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === "opened_sets"
      ? []
      : command === "preview_flint"
        ? { token: "preview-token", deck, media: {} }
        : command === "import_flint"
          ? { ...deck, id: "new-id" }
          : undefined,
  );
});
afterEach(() => cleanup());
function Board() {
  const [order, setOrder] = useState(["b", "c", "a"]);
  return (
    <Matching
      left={cards.map((c) => ({ id: c.id, text: c.question }))}
      right={cards.map((c) => ({ id: c.id, text: c.answer }))}
      order={order}
      onChange={setOrder}
    />
  );
}
describe("matching", () => {
  it("reorders answers one-to-one and bounds movement", () => {
    expect(moveAnswer(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveAnswer(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
  it("supports keyboard reordering with fixed prompts and no correctness leak", async () => {
    const user = userEvent.setup();
    render(<Board />);
    const before = Array.from(document.querySelectorAll(".match-prompt")).map(
      (el) => el.textContent,
    );
    screen.getByRole("button", { name: /Move coffee/ }).focus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(
      screen.getByRole("button", { name: /Move coffee; row 1/ }),
    ).toBeTruthy();
    expect(screen.queryByText(/✓ Correct|✕ Incorrect/)).toBeNull();
    expect(
      Array.from(document.querySelectorAll(".match-prompt")).map(
        (el) => el.textContent,
      ),
    ).toEqual(before);
  });
  it("grades every pair separately, with a shared candidate pool", () => {
    const questions = makeTest(cards, 3, ["matching"], "both");
    expect(questions.every((q) => q.prompt === q.card.question)).toBe(true);
    expect(questions).toHaveLength(1);
    for (const q of testRows(questions)) {
      expect(q.choices).toHaveLength(3);
      expect(testCorrect(q, q.card.id)).toBe(true);
      expect(testCorrect(q, "missing")).toBe(false);
    }
  });
  it("saves real matching pairs through the Test submission flow", async () => {
    render(<TestView deck={deck} done={() => {}} studyMissed={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Multiple choice" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Written" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Matching" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate test" }));
    expect(
      within(
        screen.getByRole("region", { name: "Match terms and definitions" }),
      ).queryByRole("combobox"),
    ).toBeNull();
    const prompts = Array.from(
      document.querySelectorAll(".match-prompt span"),
    ).map((el) => el.textContent);
    for (let row = 0; row < prompts.length; row++) {
      const card = cards.find((c) => c.question === prompts[row])!;
      let button = screen.getByRole("button", {
        name: new RegExp(`Move ${card.answer};`),
      });
      let index = screen
        .getAllByRole("button", { name: /^Move .*; row/ })
        .indexOf(button);
      while (index > row) {
        fireEvent.keyDown(button, { key: "ArrowUp" });
        button = screen.getByRole("button", {
          name: new RegExp(`Move ${card.answer};`),
        });
        index--;
      }
    }
    expect(screen.queryByText("✓ Correct")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Submit test" }));
    await screen.findByText("100%");
    expect(recordTestAttempt).toHaveBeenCalledWith(
      deck.id,
      1,
      1,
      expect.arrayContaining([
        expect.objectContaining({ kind: "matching", correct: true }),
      ]),
    );
    expect(screen.getAllByText("✓ Correct")).toHaveLength(3);
  });
});
describe("portable import preview", () => {
  it("detects name and ID conflicts without treating accents as equivalent names", () => {
    expect(importConflicts(deck, [deck])).toEqual({ id: true, name: true });
    expect(
      importConflicts({ ...deck, id: "other", title: "languages" }, [deck])
        .name,
    ).toBe(true);
  });
  it("requires preview confirmation and imports only the preview token", async () => {
    const added = vi.fn();
    render(
      <PortableSets decks={[deck]} onImported={added} onBusy={() => {}} />,
    );
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("opened_sets"));
    window.dispatchEvent(new Event("flint-import"));
    await screen.findByRole("button", { name: "Import as new set" });
    expect(screen.getByText(/same name and ID/)).toBeTruthy();
    expect(added).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some(([command]) => command === "import_flint"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Import as new set" }));
    await waitFor(() =>
      expect(added).toHaveBeenCalledWith(
        expect.objectContaining({ id: "new-id" }),
      ),
    );
    expect(invoke).toHaveBeenCalledWith("import_flint", {
      token: "preview-token",
    });
  });
  it("cancels a preview without saving", async () => {
    render(<PortableSets decks={[]} onImported={() => {}} onBusy={() => {}} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("opened_sets"));
    window.dispatchEvent(new Event("flint-import"));
    await screen.findByRole("button", { name: "Import as new set" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("cancel_flint", {
        token: "preview-token",
      }),
    );
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some(([command]) => command === "import_flint"),
    ).toBe(false);
  });
});
