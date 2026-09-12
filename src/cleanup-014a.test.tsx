import { mouseDrag } from "./test-drag";
// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import { AudioPlayer, AudioField } from "./Audio";
import { App } from "./App";
import { Flashcards } from "./Study";
import { Matching } from "./Matching";
import { TestView } from "./TestView";
import { LibraryView } from "./LibraryView";
import { newCard, isValidCardDraft, type Deck } from "./lib";
import { makeTest } from "./test-engine";
import { recordTestAttempt } from "./native";
vi.mock("./native", async (original) => ({
  ...(await original<typeof import("./native")>()),
  recordTestAttempt: vi.fn(async () => {}),
}));
const deck: Deck = {
  id: "set",
  title: "Audio study",
  subject: "Languages",
  color: "#f63",
  cards: Array.from({ length: 5 }, (_, i) => ({
    ...newCard("Term " + i, "Definition " + i),
    id: "c" + i,
  })),
};
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
    async function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("play"));
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event("pause"));
  });
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("0.1.4a completion", () => {
  it("counts a five-pair matching board as one question in navigation, progress, results and persisted score", async () => {
    render(<TestView deck={deck} done={() => {}} studyMissed={() => {}} />);
    for (const name of ["Multiple choice", "Written", "Matching"])
      fireEvent.click(screen.getByRole("checkbox", { name }));
    fireEvent.click(screen.getByRole("button", { name: "Generate test" }));
    expect(
      screen.getByRole("heading", { name: "Test · 1 question" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /Go to question/ }),
    ).toHaveLength(1);
    expect(screen.getByText("1 / 1 question answered")).toBeTruthy();
    for (let i = 1; i <= 5; i++)
      expect(screen.getByLabelText("Row " + i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Submit test" }));
    await waitFor(() => expect(recordTestAttempt).toHaveBeenCalled());
    expect(vi.mocked(recordTestAttempt).mock.calls[0][2]).toBe(1);
    expect(vi.mocked(recordTestAttempt).mock.calls[0][3]).toHaveLength(5);
  });
  it("reorders the entire answer using pointer drag, preserving fixed prompts", () => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    function Board() {
      const [order, setOrder] = useState(["b", "c", "a"]);
      return (
        <Matching
          left={deck.cards
            .slice(0, 3)
            .map((c, i) => ({ id: ["a", "b", "c"][i], text: c.question }))}
          right={[
            { id: "a", text: "A" },
            { id: "b", text: "B" },
            { id: "c", text: "C" },
          ]}
          order={order}
          onChange={setOrder}
        />
      );
    }
    render(<Board />);
    const rows = document.querySelectorAll<HTMLElement>(
      ".match-row:not(.match-heading)",
    );
    rows.forEach((row, i) =>
      vi
        .spyOn(row, "getBoundingClientRect")
        .mockReturnValue({ top: i * 100, bottom: (i + 1) * 100 } as DOMRect),
    );
    const answer = document.querySelector<HTMLElement>('[data-answer-id="a"]')!;
    fireEvent.pointerDown(answer, { button: 0, clientY: 250 });
    fireEvent.pointerMove(answer, { clientY: 50 });
    fireEvent.pointerUp(answer, { clientY: 50 });
    expect(screen.getByRole("button", { name: /Move A; row 1/ })).toBeTruthy();
    expect(
      Array.from(document.querySelectorAll(".match-prompt span")).map(
        (e) => e.textContent,
      ),
    ).toEqual(["Term 0", "Term 1", "Term 2"]);
    vi.unstubAllGlobals();
  });
  it("shows folders inline, hides their sets at root, opens folder contents, and moves sets out", async () => {
    function Library() {
      const [decks, setDecks] = useState([
        { ...deck, meta: { folder: "Languages" } },
        { ...deck, id: "root", title: "Root" },
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
            batch: async (changes) =>
              setDecks((old) =>
                old.map((d) => changes.find((c) => c.id === d.id) || d),
              ),
          }}
        />
      );
    }
    render(<Library />);
    expect(
      screen.queryByRole("button", { name: "Open Audio study" }),
    ).toBeNull();
    expect(
      document.querySelector(".rich-deck-grid")?.firstElementChild?.className,
    ).toContain("folder-card");
    fireEvent.click(
      screen.getByRole("button", { name: "Open folder Languages" }),
    );
    expect(
      screen.getByRole("button", { name: "Open Audio study" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Root" })).toBeNull();
    mouseDrag(
      document.querySelector(".deck-drop-wrap")!,
      screen.getByRole("button", { name: "Library / Languages" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Open Audio study" }),
      ).toBeNull(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Library / Languages" }),
    );
    expect(
      screen.getByRole("button", { name: "Open Audio study" }),
    ).toBeTruthy();
  });
  it("requires irreversible confirmation before permanent removal", async () => {
    const remove = vi.fn(async () => {});
    render(
      <LibraryView
        decks={[{ ...deck, meta: { deletedAt: new Date().toISOString() } }]}
        globalQuery=""
        start={() => {}}
        create={() => {}}
        actions={{
          remove,
          update: async () => {},
          duplicate: async () => {},
          export: async () => {},
          edit: () => {},
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Trash" }));
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Permanently remove" }));
    expect(remove).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/cannot be undone/)).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Permanently remove" }),
    );
    await waitFor(() => expect(remove).toHaveBeenCalledWith(deck.id));
  });
  it("removes redundant nav items, distinguishes Home from Library, and exposes keyboard help in Settings", async () => {
    localStorage.setItem(
      "flint-decks",
      JSON.stringify(
        Array.from({ length: 8 }, (_, i) => ({
          ...deck,
          id: "d" + i,
          title: "Set " + i,
        })),
      ),
    );
    render(<App />);
    const nav = within(screen.getByRole("navigation"));
    expect(nav.queryByRole("button", { name: "Study" })).toBeNull();
    expect(nav.queryByRole("button", { name: "Commands" })).toBeNull();
    expect(screen.getByText("CONTINUE STUDYING")).toBeTruthy();
    expect(document.querySelectorAll(".rich-deck").length).toBeLessThan(8);
    fireEvent.click(nav.getByRole("button", { name: "Library" }));
    expect(document.querySelectorAll(".rich-deck")).toHaveLength(8);
    fireEvent.click(nav.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    expect(
      screen.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeTruthy();
  });
  it("accepts image/audio-only sides and generates nonblank media questions", () => {
    const audio = {
      ...newCard("", ""),
      questionAudio: "front.mp3",
      answerImage: "back.png",
    };
    expect(isValidCardDraft(audio)).toBe(true);
    expect(
      isValidCardDraft({
        ...audio,
        answerImage: null,
        answerAudio: "back.wav",
      }),
    ).toBe(true);
    const q = makeTest([audio], 1, ["written"], "definitions")[0];
    expect(q.promptAudio).toBe("front.mp3");
    expect(q.choices[0].image).toBe("back.png");
    expect(q.kind).toBe("choice");
  });
  it("plays only one audio at a time, resets on side change and stops on unmount without autoplay", async () => {
    const view = render(
      <>
        <AudioPlayer name="first.mp3" label="First" />
        <AudioPlayer name="second.mp3" label="Second" />
      </>,
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Play First" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play First" }));
    await screen.findByRole("button", { name: "Pause First" });
    fireEvent.click(screen.getByRole("button", { name: "Play Second" }));
    await screen.findByRole("button", { name: "Pause Second" });
    expect(screen.getByRole("button", { name: "Play First" })).toBeTruthy();
    view.unmount();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
  it("stops flashcard audio on navigation and renders image-only faces without text placeholders", async () => {
    const mediaDeck = {
      ...deck,
      cards: [
        {
          ...deck.cards[0],
          question: "",
          questionAudio: "front.mp3",
          answer: "",
          answerImage: "back.png",
        },
        deck.cards[1],
      ],
    };
    render(<Flashcards deck={mediaDeck} done={() => {}} />);
    await screen.findByRole("button", { name: "Play Front audio" });
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Play Front audio" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Play Front audio" }));
    await screen.findByRole("button", { name: "Pause Front audio" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Pause Front audio" }),
    ).toBeNull();
  });
  it("uploads and removes an audio attachment without requiring text", async () => {
    function Field() {
      const [audio, setAudio] = useState<string | null>(null);
      return (
        <AudioField label="question audio" value={audio} onChange={setAudio} />
      );
    }
    render(<Field />);
    fireEvent.change(screen.getByLabelText("Upload question audio"), {
      target: {
        files: [
          new File(["RIFF0000WAVE"], "example.wav", { type: "audio/wav" }),
        ],
      },
    });
    await screen.findByRole("button", { name: "Remove question audio" });
    expect(screen.getByText("example.wav")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove question audio" }),
    );
    expect(screen.queryByRole("group", { name: "question audio" })).toBeNull();
  });
});
