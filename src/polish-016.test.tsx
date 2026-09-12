import { mouseDrag } from "./test-drag";
// @vitest-environment jsdom
import { useState } from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
  waitFor,
} from "@testing-library/react";
import { newCard, type Deck } from "./lib";
import { Flashcards, WaveLearn } from "./Study";
import { TestView } from "./TestView";
import { LibraryView } from "./LibraryView";
import { App } from "./App";
import { scopedDeck } from "./StudyScope";
import { swapSides, useUndoState } from "./editing";
import {
  loadLibraryPreferences,
  saveLibraryPreferences,
  reorderItems,
} from "./library-order";

const deck: Deck = {
  id: "one",
  title: "One",
  subject: "",
  color: "#f63",
  cards: [
    newCard("First", "Back one"),
    newCard("Second", "Back two"),
    newCard("Third", "Back three"),
  ],
};
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Library({
  initial = [
    deck,
    { ...deck, id: "two", title: "Two" },
    { ...deck, id: "three", title: "Three", meta: { folder: "Folder" } },
  ],
}: {
  initial?: Deck[];
}) {
  const [decks, setDecks] = useState<Deck[]>(
    () => JSON.parse(localStorage.getItem("qa-decks") || "null") || initial,
  );
  const batch = async (changes: Deck[]) =>
    setDecks((old) => {
      const next = old.map((d) => changes.find((c) => c.id === d.id) || d);
      localStorage.setItem("qa-decks", JSON.stringify(next));
      return next;
    });
  return (
    <LibraryView
      decks={decks}
      globalQuery=""
      start={() => {}}
      create={() => {}}
      actions={{
        update: async (d) => batch([d]),
        batch,
        duplicate: async () => {},
        export: async () => {},
        edit: () => {},
      }}
    />
  );
}
const transfer = () => ({ setData: vi.fn(), effectAllowed: "" });
describe("Library and study polish", () => {
  it("filters stars without copying cards or mutating metadata", () => {
    const original = { ...deck, meta: { starredCards: [deck.cards[1].id] } };
    expect(scopedDeck(original, false)).toBe(original);
    expect(scopedDeck(original, true).cards).toEqual([deck.cards[1]]);
    expect(scopedDeck(original, true).cards[0]).toBe(deck.cards[1]);
    expect(original.cards).toHaveLength(3);
  });
  it.each(["Flashcards", "Learn", "Test"])(
    "offers only starred cards in %s and an empty state",
    async (mode) => {
      const props = {
        deck: { ...deck, meta: { starredCards: [deck.cards[1].id] } },
        done: () => {},
      };
      const view = render(
        mode === "Flashcards" ? (
          <Flashcards {...props} />
        ) : mode === "Learn" ? (
          <WaveLearn {...props} />
        ) : (
          <TestView {...props} studyMissed={() => {}} />
        ),
      );
      if (mode === "Test")
        fireEvent.change(screen.getByLabelText("Study scope"), {
          target: { value: "starred" },
        });
      else {
        fireEvent.click(screen.getByLabelText(mode + " settings"));
        const check = screen.getByLabelText(
          mode === "Learn"
            ? "Practice starred cards only"
            : "Study starred cards only",
        ) as HTMLInputElement;
        if (!check.checked) fireEvent.click(check);
      }
      if (mode === "Flashcards") {
        expect(screen.getByText("1 / 1")).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Second" })).toBeTruthy();
      }
      if (mode === "Test")
        expect(
          (screen.getByLabelText("Number of questions") as HTMLInputElement)
            .max,
        ).toBe("1");
      if (mode === "Learn") {
        fireEvent.click(await screen.findByRole("button", { name: "Start" }));
        await waitFor(() =>
          expect(document.querySelector(".choice-grid")).toBeTruthy(),
        );
        expect(document.querySelectorAll(".choice-grid > div")).toHaveLength(1);
        expect(document.querySelector(".choice-grid")?.textContent).toContain(
          "Second",
        );
      }
      view.unmount();
      render(
        mode === "Flashcards" ? (
          <Flashcards {...props} deck={deck} />
        ) : mode === "Learn" ? (
          <WaveLearn {...props} deck={deck} />
        ) : (
          <TestView {...props} deck={deck} studyMissed={() => {}} />
        ),
      );
      if (mode === "Test")
        fireEvent.change(screen.getByLabelText("Study scope"), {
          target: { value: "starred" },
        });
      else {
        fireEvent.click(screen.getByLabelText(mode + " settings"));
        const check = screen.getByLabelText(
          mode === "Learn"
            ? "Practice starred cards only"
            : "Study starred cards only",
        ) as HTMLInputElement;
        if (!check.checked) fireEvent.click(check);
      }
      expect(screen.getByText("No starred cards yet")).toBeTruthy();
    },
  );
  it("persists manual order and folder appearance independently of automatic sort", () => {
    saveLibraryPreferences({
      order: reorderItems(["one", "two"], "two", "one", false),
      folders: { Folder: { pinned: true, color: "#6aa9dd" } },
      sort: "manual",
    });
    let view = render(<Library />);
    expect(
      Array.from(document.querySelectorAll(".rich-deck h3 button")).map(
        (e) => e.textContent,
      ),
    ).toEqual(["Two", "One"]);
    fireEvent.change(screen.getByLabelText("Sort sets"), {
      target: { value: "name" },
    });
    view.unmount();
    view = render(<Library />);
    fireEvent.change(screen.getByLabelText("Sort sets"), {
      target: { value: "manual" },
    });
    expect(
      Array.from(document.querySelectorAll(".rich-deck h3 button")).map(
        (e) => e.textContent,
      ),
    ).toEqual(["Two", "One"]);
    expect(loadLibraryPreferences().folders.Folder).toEqual({
      pinned: true,
      color: "#6aa9dd",
    });
  });
  it("edge drops reorder instead of creating a folder and survive remount", () => {
    vi.stubGlobal("DragEvent", MouseEvent);
    const view = render(<Library />);
    const wraps = document.querySelectorAll<HTMLElement>(".deck-drop-wrap");
    vi.spyOn(wraps[0], "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 200,
      height: 200,
    } as DOMRect);
    mouseDrag(wraps[1], wraps[0], true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(loadLibraryPreferences().order.slice(-2)).toEqual(["two", "one"]);
    view.unmount();
    render(<Library />);
    expect(document.querySelector(".rich-deck h3 button")?.textContent).toBe(
      "Two",
    );
  });
  it("right-click opens the existing menu, persists set pin and folder color/pin", async () => {
    const view = render(<Library />);
    const card = screen
      .getByRole("button", { name: "Open One" })
      .closest("article")!;
    const menu = card.querySelector("details")!;
    fireEvent.contextMenu(card);
    expect(menu.open).toBe(true);
    fireEvent.click(
      within(screen.getByRole("region", { name: "Item actions" })).getByRole(
        "button",
        { name: "Pin" },
      ),
    );
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("qa-decks")!)[0].meta.pinned).toBe(
        true,
      ),
    );
    const folder = screen
      .getByRole("button", { name: "Open folder Folder" })
      .closest("article")!;
    fireEvent.contextMenu(folder);
    const folderMenu = folder.querySelector("details")!;
    fireEvent.click(
      within(screen.getByRole("region", { name: "Item actions" })).getByRole(
        "button",
        { name: "Pin" },
      ),
    );
    fireEvent.contextMenu(folder);
    fireEvent.change(screen.getByLabelText("Color for folder Folder"), {
      target: { value: "#6aa9dd" },
    });
    expect(loadLibraryPreferences().folders.Folder).toEqual({
      pinned: true,
      color: "#6aa9dd",
    });
    view.unmount();
    render(<Library />);
    expect(screen.getByLabelText("Pinned set")).toBeTruthy();
    expect(screen.getByLabelText("Pinned folder")).toBeTruthy();
  });
  it("moves a set onto a folder without changing its cards", async () => {
    render(<Library />);
    mouseDrag(
      screen
        .getByRole("button", { name: "Open One" })
        .closest(".deck-drop-wrap")!,
      screen
        .getByRole("button", { name: "Open folder Folder" })
        .closest("article")!,
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Open One" })).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open folder Folder" }));
    expect(screen.getByRole("button", { name: "Open One" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("qa-decks")!)[0].cards).toEqual(
      deck.cards,
    );
  });
  it("swaps all media and text through existing Undo", () => {
    const original = {
      ...deck.cards[0],
      questionImage: "front.webp",
      answerImage: "back.png",
      questionAudio: "front.mp3",
      answerAudio: "back.wav",
    };
    function Editor() {
      const [card, set, undo] = useUndoState(original);
      return (
        <>
          <output>{JSON.stringify(card)}</output>
          <button onClick={() => set(swapSides)}>⇄</button>
          <button onClick={undo}>Undo</button>
        </>
      );
    }
    render(<Editor />);
    fireEvent.click(screen.getByText("⇄"));
    const changed = JSON.parse(document.querySelector("output")!.textContent!);
    expect(changed).toMatchObject({
      question: original.answer,
      answer: original.question,
      questionImage: "back.png",
      answerImage: "front.webp",
      questionAudio: "back.wav",
      answerAudio: "front.mp3",
      id: original.id,
    });
    fireEvent.click(screen.getByText("Undo"));
    expect(JSON.parse(document.querySelector("output")!.textContent!)).toEqual(
      original,
    );
  });
  it("wires editor swap and Undo and offers only Image/Audio Insert", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Create" }));
    const front = screen.getAllByPlaceholderText(
      "Add front text",
    )[0] as HTMLTextAreaElement;
    const back = screen.getAllByPlaceholderText(
      "Add back text",
    )[0] as HTMLTextAreaElement;
    fireEvent.change(front, { target: { value: "Front value" } });
    fireEvent.change(back, { target: { value: "Back value" } });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Swap front and back" })[0],
    );
    expect(front.value).toBe("Back value");
    expect(back.value).toBe("Front value");
    fireEvent.click(screen.getByRole("button", { name: "Undo card edit" }));
    expect(front.value).toBe("Front value");
    const insert = screen.getAllByText("+ Insert ▾")[0].closest("details")!;
    fireEvent.click(insert.querySelector("summary")!);
    expect(
      within(insert)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Image", "Audio"]);
  });
  it("renders image/audio Learn choices without blank rectangles or changing recall direction", async () => {
    const mediaDeck = {
      ...deck,
      cards: [
        {
          ...deck.cards[0],
          question: "",
          questionImage: "data:image/png;base64,dGVzdA==",
        },
        {
          ...deck.cards[1],
          question: "",
          questionAudio: "data:audio/wav;base64,dGVzdA==",
        },
        { ...deck.cards[2], question: "   " },
      ],
    };
    render(<WaveLearn deck={mediaDeck} done={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    await waitFor(() =>
      expect(document.querySelectorAll(".choice-grid > div")).toHaveLength(2),
    );
    expect(screen.getByText("Select this audio answer")).toBeTruthy();
    expect(await screen.findByAltText("Choice visual")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Play Choice/ })).toBeTruthy();
  });
});
it("reorders folders and their contained sets independently across remount", async () => {
  vi.stubGlobal("DragEvent", MouseEvent);
  const initial = [
    { ...deck, meta: { folder: "Alpha" } },
    { ...deck, id: "two", title: "Two", meta: { folder: "Alpha" } },
    { ...deck, id: "three", title: "Three", meta: { folder: "Beta" } },
  ];
  let view = render(<Library initial={initial} />);
  const alpha = screen
    .getByRole("button", { name: "Open folder Alpha" })
    .closest("article")!;
  const beta = screen
    .getByRole("button", { name: "Open folder Beta" })
    .closest("article")!;
  vi.spyOn(alpha, "getBoundingClientRect").mockReturnValue({
    top: 0,
    bottom: 200,
    height: 200,
  } as DOMRect);
  mouseDrag(beta, alpha, true);
  expect(loadLibraryPreferences().order).toEqual([
    "folder:Beta",
    "folder:Alpha",
  ]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  fireEvent.click(screen.getByRole("button", { name: "Open folder Alpha" }));
  const cards = document.querySelectorAll<HTMLElement>(".deck-drop-wrap");
  vi.spyOn(cards[0], "getBoundingClientRect").mockReturnValue({
    top: 0,
    bottom: 200,
    height: 200,
  } as DOMRect);
  mouseDrag(cards[1], cards[0], true);
  view.unmount();
  view = render(<Library initial={initial} />);
  expect(document.querySelector(".folder-open h3")?.textContent?.trim()).toBe(
    "Beta",
  );
  fireEvent.click(screen.getByRole("button", { name: "Open folder Alpha" }));
  expect(document.querySelector(".rich-deck h3 button")?.textContent).toBe(
    "Two",
  );
});
