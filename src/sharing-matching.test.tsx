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
import { Matching, pairItems } from "./Matching";
import { makeTest, testCorrect } from "./test-engine";
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
  const [pairs, setPairs] = useState<Record<string, string>>({});
  return (
    <Matching
      left={cards.map((c) => ({ id: c.id, text: c.question }))}
      right={cards.map((c) => ({ id: c.id, text: c.answer }))}
      pairs={pairs}
      onChange={setPairs}
    />
  );
}
describe("matching", () => {
  it("reassigns partners one-to-one", () => {
    expect(pairItems({ a: "a", b: "b" }, "a", "b")).toEqual({ a: "b" });
  });
  it("supports keyboard pairing, changing and unpairing without leaking correctness", async () => {
    const user = userEvent.setup();
    render(<Board />);
    const left = within(screen.getByRole("group", { name: "Terms" }));
    const right = within(screen.getByRole("group", { name: "Definitions" }));
    left.getByRole("button", { name: /café/ }).focus();
    await user.keyboard("{Enter}");
    right.getByRole("button", { name: /country/ }).focus();
    await user.keyboard(" ");
    expect(screen.getByText("Pair 1: café ↔ country")).toBeTruthy();
    expect(screen.queryByText(/✓ Correct|✕ Incorrect/)).toBeNull();
    fireEvent.click(left.getByRole("button", { name: /café/ }));
    fireEvent.click(right.getByRole("button", { name: /coffee/ }));
    expect(screen.getByText("Pair 1: café ↔ coffee")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unpair 1" }));
    expect(screen.queryByText("Pair 1: café ↔ coffee")).toBeNull();
    const first = left.getAllByRole("button")[0];
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(left.getAllByRole("button")[1]);
  });
  it("grades every pair separately, with a shared candidate pool", () => {
    const questions = makeTest(cards, 3, ["matching"], "both");
    expect(questions.every((q) => q.prompt === q.card.question)).toBe(true);
    for (const q of questions) {
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
    expect(screen.queryByRole("combobox")).toBeNull();
    const left = within(screen.getByRole("group", { name: "Terms" })),
      right = within(screen.getByRole("group", { name: "Definitions" }));
    for (const card of cards) {
      fireEvent.click(
        left.getByRole("button", { name: new RegExp(card.question) }),
      );
      fireEvent.click(
        right.getByRole("button", { name: new RegExp(card.answer) }),
      );
    }
    expect(screen.queryByText("✓ Correct")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Submit test" }));
    await screen.findByText("100%");
    expect(recordTestAttempt).toHaveBeenCalledWith(
      deck.id,
      3,
      3,
      expect.arrayContaining([
        expect.objectContaining({ kind: "matching", correct: true }),
      ]),
    );
    expect(screen.getByText("You matched: café ↔ coffee")).toBeTruthy();
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
