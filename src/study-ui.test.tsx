// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import { App } from "./App";
import { Flashcards, WaveLearn, WorksheetTest } from "./Study";
import { newCard, Deck } from "./lib";
import {
  loadStudySession,
  saveStudySession,
  recordTestAttempt,
  reviewNative,
} from "./native";
vi.mock("./native", () => ({
  inTauri: () => false,
  loadNativeDecks: vi.fn(async () => null),
  saveNativeDeck: vi.fn(async () => {}),
  updateDeckDetails: vi.fn(async () => {}),
  exportDeckText: vi.fn(async () => {}),
  reviewNative: vi.fn(async () => {}),
  mediaUrl: vi.fn(async (name: string) => name || ""),
  saveMediaBytes: vi.fn(),
  extractDocument: vi.fn(),
  createBackup: vi.fn(),
  restoreBackup: vi.fn(),
  loadStudySession: vi.fn(async (id: string, mode: string) =>
    JSON.parse(localStorage.getItem(id + mode) || "null"),
  ),
  saveStudySession: vi.fn(async (id: string, mode: string, state: unknown) =>
    localStorage.setItem(id + mode, JSON.stringify(state)),
  ),
  recordTestAttempt: vi.fn(async () => {}),
}));
const deck: Deck = {
  id: "biology-ui",
  title: "Biology",
  subject: "",
  color: "#ed6b3a",
  cards: Array.from({ length: 12 }, (_, i) => ({
    ...newCard("Term " + i, "Definition " + i),
    id: "c" + i,
  })),
};
const colors: Deck = {
  ...deck,
  id: "colors-motion",
  title: "Colors",
  cards: [
    "Red",
    "Blue",
    "Green",
    "Yellow",
    "Purple",
    "Orange",
    "Pink",
    "Brown",
    "Black",
    "White",
    "Gray",
    "Cyan",
    "Magenta",
    "Teal",
    "Navy",
    "Lime",
    "Gold",
    "Silver",
    "Coral",
    "Indigo",
  ].map((name, i) => ({ ...newCard(name, "Color " + name), id: "color-" + i })),
};
beforeEach(() => {
  window.scrollTo = vi.fn();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("study interactions", () => {
  it("persists cover selection, searches metadata, and supports trash, undo and restore", async () => {
    localStorage.setItem(
      "flint-decks",
      JSON.stringify([
        { ...colors, meta: { folder: "Art class", tags: ["chromatic"] } },
      ]),
    );
    const view = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    const search = screen.getByRole("textbox", { name: "Search your sets" });
    fireEvent.change(search, { target: { value: "chromatic" } });
    expect(screen.getByRole("button", { name: "Open Colors" })).toBeTruthy();
    fireEvent.change(search, { target: { value: "no match" } });
    expect(screen.queryByRole("button", { name: "Open Colors" })).toBeNull();
    fireEvent.change(search, { target: { value: "Art class" } });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose preset" }));
    fireEvent.click(screen.getByRole("button", { name: "Spectrum Gradient" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Open Colors" });
    expect(JSON.parse(localStorage.getItem("flint-decks")!)[0].coverImage).toBe(
      "flint:preset/spectrum",
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Colors" }));
    fireEvent.click(screen.getByLabelText("More actions for Colors"));
    fireEvent.click(screen.getByRole("button", { name: "Delete set" }));
    const modal = screen.getByRole("dialog");
    fireEvent.click(within(modal).getByRole("button", { name: "Delete set" }));
    await screen.findByRole("button", { name: "Undo" });
    expect(screen.queryByRole("button", { name: "Open Colors" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await screen.findByRole("button", { name: "Open Colors" });
    fireEvent.click(screen.getByRole("button", { name: "Open Colors" }));
    fireEvent.click(screen.getByLabelText("More actions for Colors"));
    fireEvent.click(screen.getByRole("button", { name: "Delete set" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete set",
      }),
    );
    await screen.findByRole("button", { name: "Trash" });
    fireEvent.click(screen.getByRole("button", { name: "Trash" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem("flint-decks")!)[0].meta.deletedAt,
      ).toBeNull(),
    );
    view.unmount();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(screen.getByRole("button", { name: "Open Colors" })).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem("flint-decks")!)[0].cards,
    ).toHaveLength(20);
  });
  it("offers every test type, flag navigation and explicit instant feedback without duplicate result writes", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(
      <WorksheetTest deck={colors} done={() => {}} studyMissed={() => {}} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "True / False" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Matching" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Feedback" }), {
      target: { value: "instant" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate test" }));
    fireEvent.click(screen.getByRole("button", { name: "Flag question 1" }));
    expect(
      screen
        .getByRole("button", { name: "Flag question 1" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Go to question 4" }));
    expect(document.activeElement?.tagName).toBe("SELECT");
    const first = document.querySelector<HTMLElement>(".worksheet-question")!;
    fireEvent.click(within(first).getAllByRole("radio")[0]);
    expect(within(first).queryByText(/Your answer:/)).toBeNull();
    fireEvent.click(
      within(first).getByRole("button", { name: "Check answer" }),
    );
    expect(
      (
        within(first)
          .getAllByRole("radio")[0]
          .closest("fieldset") as HTMLFieldSetElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Submit test" }));
    const force = screen.getByRole("button", { name: "Submit anyway" });
    fireEvent.click(force);
    fireEvent.click(force);
    await screen.findByText("This attempt is saved in your study history.");
    expect(recordTestAttempt).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Retake test" })).toBeTruthy();
  });
  it("respects reduced motion and leaves editable arrow keys alone", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    render(
      <>
        <textarea aria-label="Notes" />
        <Flashcards deck={colors} done={() => {}} />
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Notes" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(screen.getByText("1 / 20")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Flip card" }).className,
    ).not.toContain("is-flipped");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() =>
      expect(document.querySelector(".viewer-ghost")).toBeNull(),
    );
    expect(screen.getByText("2 / 20")).toBeTruthy();
  });
  it("focuses the first unanswered question and grades a completed mixed worksheet", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(
      <WorksheetTest deck={deck} done={() => {}} studyMissed={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate test" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit test" }));
    fireEvent.click(screen.getByRole("button", { name: "Go to unanswered" }));
    expect(document.activeElement?.tagName).toBe("INPUT");
    const rows = document.querySelectorAll<HTMLElement>(".worksheet-question");
    rows.forEach((row) => {
      const title = within(row).getByRole("heading").textContent!;
      const answer = "Definition " + title.split(" ").at(-1);
      const radio = within(row).queryByRole("radio", { name: answer });
      if (radio) fireEvent.click(radio);
      else
        fireEvent.change(within(row).getByRole("textbox"), {
          target: { value: answer },
        });
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit test" }));
    await screen.findByText("100%");
    expect(screen.getByText("10 correct · 0 incorrect")).toBeTruthy();
  });
  it("creates five cards with images, replaces and removes attachments, and preserves them after remount", async () => {
    const view = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.change(screen.getByPlaceholderText("Set title"), {
      target: { value: "Image workflow" },
    });
    for (let i = 0; i < 4; i++)
      fireEvent.click(screen.getByRole("button", { name: /Add card/ }));
    screen
      .getAllByPlaceholderText("Enter a term or question")
      .forEach((input, i) =>
        fireEvent.change(input, { target: { value: "Term " + i } }),
      );
    screen
      .getAllByPlaceholderText("Enter a definition or answer")
      .forEach((input, i) =>
        fireEvent.change(input, { target: { value: "Definition " + i } }),
      );
    const image = new File(["test image"], "cell.png", { type: "image/png" });
    const attachments = document.querySelectorAll<HTMLInputElement>(
      ".attachment input[type=file]",
    );
    for (const index of [0, 1, 2, 3])
      fireEvent.change(attachments[index], { target: { files: [image] } });
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Replace" })).toHaveLength(
        4,
      ),
    );
    fireEvent.change(attachments[1], {
      target: {
        files: [new File(["replacement"], "cell.webp", { type: "image/webp" })],
      },
    });
    await waitFor(() =>
      expect(document.querySelectorAll(".attachment-thumb img")).toHaveLength(
        4,
      ),
    );
    const firstAnswer = screen.getAllByLabelText("answer image attachment")[0];
    fireEvent.click(
      within(firstAnswer).getByRole("button", { name: "Remove" }),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "View larger" })[0]);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Create" }).at(-1)!);
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem("flint-decks") || "[]")[0].cards,
      ).toHaveLength(5),
    );
    const saved = JSON.parse(localStorage.getItem("flint-decks") || "[]")[0];
    expect(saved.coverImage).toMatch(/^data:image\/png/);
    expect(saved.cards[0].answerImage).toBeNull();
    expect(saved.cards[0].questionImage).toMatch(/^data:image\/webp/);
    view.unmount();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getAllByPlaceholderText("Enter a term or question"),
    ).toHaveLength(5);
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Replace" })).toHaveLength(
        3,
      ),
    );
  });
  it("opens a set overview and every mode exits to the same set", async () => {
    localStorage.setItem("flint-decks", JSON.stringify([deck]));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    fireEvent.click(screen.getByRole("button", { name: "Study" }));
    expect(screen.getByText("What would you like to do?")).toBeTruthy();
    for (const name of ["Flashcards →", "Learn →", "Test →"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
      fireEvent.click(screen.getByRole("button", { name: "← Back to set" }));
      expect(screen.getByText("What would you like to do?")).toBeTruthy();
    }
  });
  it("flips and navigates without recall rating controls", () => {
    render(<Flashcards deck={deck} done={() => {}} />);
    const card = screen.getByRole("button", { name: "Flip card" });
    fireEvent.keyDown(window, { code: "Space", key: " " });
    expect(card.className).toContain("is-flipped");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2 / 12")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 12")).toBeTruthy();
    expect(screen.queryByText("Again")).toBeNull();
    expect(screen.queryByText("Rate your recall")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Shuffle" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(screen.getByText("1 / 12")).toBeTruthy();
  });
  it("renders a ten-question worksheet, warns on blanks, saves results only on submit, and sends missed concepts to Learn", async () => {
    const studyMissed = vi.fn();
    render(
      <WorksheetTest deck={deck} done={() => {}} studyMissed={studyMissed} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate test" }));
    expect(document.querySelectorAll(".worksheet-question")).toHaveLength(10);
    expect(recordTestAttempt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Submit test" }));
    expect(screen.getByText("10 questions are unanswered.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Submit anyway" }));
    await waitFor(() => expect(screen.getByText("0%")).toBeTruthy());
    expect(recordTestAttempt).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Study missed terms" }));
    expect(studyMissed.mock.calls[0][0].id).toBe(deck.id);
    expect(studyMissed.mock.calls[0][0].cards).toHaveLength(10);
  });
  it("runs four MC then four typed, requeues typed B, and resumes the persisted queue", async () => {
    const view = render(<WaveLearn deck={deck} done={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    for (let i = 0; i < 4; i++) {
      await screen.findByText("Definition " + i);
      fireEvent.click(screen.getByRole("button", { name: "Term " + i }));
      fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    }
    expect(await screen.findByText("Now recall them yourself")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    for (let i = 0; i < 4; i++) {
      fireEvent.change(
        await screen.findByRole("textbox", { name: "Your answer" }),
        { target: { value: i === 1 ? "wrong" : "Term " + i } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
      fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
      await waitFor(() =>
        expect(
          screen.queryByText(i === 1 ? "Not quite" : "Correct"),
        ).toBeNull(),
      );
    }
    expect(
      await screen.findByText("4 terms practiced · 3 stronger · 1 need work"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Definition 1");
    view.unmount();
    render(<WaveLearn deck={deck} done={() => {}} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue Learn" }),
    );
    expect(screen.getByText("Definition 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Term 1" })).toBeTruthy();
  });
  it("keeps the 20-card Colors viewer correct under rapid flip and navigation input", async () => {
    render(<Flashcards deck={colors} done={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
    fireEvent.keyDown(window, { code: "Space", key: " " });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(
      screen.getByRole("button", { name: "Flip card" }).className,
    ).not.toContain("is-flipped");
    for (let i = 0; i < 21; i++)
      fireEvent.keyDown(window, { code: "Space", key: " " });
    expect(
      screen.getByRole("button", { name: "Flip card" }).className,
    ).toContain("is-flipped");
    for (let i = 0; i < 25; i++)
      fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("20 / 20")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Flip card" }).className,
    ).not.toContain("is-flipped");
    for (let i = 0; i < 25; i++)
      fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 20")).toBeTruthy();
    expect(reviewNative).not.toHaveBeenCalled();
    expect(saveStudySession).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.querySelector(".viewer-ghost")).toBeNull(),
    );
  });
  it("shows immediate MC feedback during a delayed save and ignores double answers and exit timers", async () => {
    const view = render(<WaveLearn deck={colors} done={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    await screen.findByRole("button", { name: "Red" });
    let release!: () => void;
    vi.mocked(saveStudySession).mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const initial = vi.mocked(saveStudySession).mock.calls.length;
    const choice = screen.getByRole("button", { name: "Red" });
    fireEvent.click(choice);
    fireEvent.click(choice);
    expect(screen.getByText("Correct")).toBeTruthy();
    expect(choice.className).toContain("answer-correct");
    expect(vi.mocked(saveStudySession).mock.calls.length).toBe(initial + 1);
    expect(
      (screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    release();
    await waitFor(() => expect(reviewNative).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(reviewNative).toHaveBeenCalledOnce();
    expect(vi.mocked(saveStudySession).mock.calls.length).toBe(initial + 1);
  });
  it("runs the Colors wave with wrong MC and typed feedback, without duplicate typed submissions", async () => {
    render(<WaveLearn deck={colors} done={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    for (const name of ["Red", "Blue", "Green", "Yellow"]) {
      await screen.findByText("Color " + name);
      const correct = screen.getByRole("button", { name });
      const choice =
        name === "Blue"
          ? document.querySelector<HTMLButtonElement>(
              ".choice-grid button:not([disabled])",
            )!
          : correct;
      const wrong =
        name === "Blue"
          ? Array.from(
              document.querySelectorAll<HTMLButtonElement>(
                ".choice-grid button",
              ),
            ).find((b) => b !== correct)!
          : choice;
      fireEvent.click(wrong);
      fireEvent.click(wrong);
      if (name === "Blue")
        expect(screen.getByText("Correct answer: Blue")).toBeTruthy();
      await waitFor(() =>
        expect(
          (
            screen.getByRole("button", {
              name: "Continue",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(false),
      );
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    }
    await screen.findByText("Now recall them yourself");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    for (const name of ["Red", "Blue", "Green", "Yellow"]) {
      await screen.findByText("Color " + name);
      const input = screen.getByRole("textbox", { name: "Your answer" });
      fireEvent.change(input, {
        target: { value: name === "Blue" ? "wrong" : name },
      });
      const form = input.closest("form")!;
      fireEvent.submit(form);
      fireEvent.submit(form);
      fireEvent.keyDown(input, { key: "Enter" });
      if (name === "Blue") {
        expect((input as HTMLInputElement).value).toBe("wrong");
        expect(screen.getByText("Correct answer: Blue")).toBeTruthy();
        expect(screen.getByText("You'll see this one again.")).toBeTruthy();
      }
      await waitFor(() =>
        expect(
          (
            screen.getByRole("button", {
              name: "Continue",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(false),
      );
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() =>
        expect(
          screen.queryByText(name === "Blue" ? "Not quite" : "Correct"),
        ).toBeNull(),
      );
    }
    expect(
      await screen.findByText("4 terms practiced · 3 stronger · 1 need work"),
    ).toBeTruthy();
    expect(reviewNative).toHaveBeenCalledTimes(8);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Color Blue");
    expect(screen.getByRole("button", { name: "Blue" })).toBeTruthy();
  });
  it("keeps large editable card sides and saves ten cards without resetting existing review history", async () => {
    const existing = {
      ...deck,
      cards: [
        {
          ...deck.cards[0],
          repetitions: 8,
          accuracy: 80,
          status: "Review" as const,
        },
      ],
    };
    localStorage.setItem("flint-decks", JSON.stringify([existing]));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    for (let i = 0; i < 9; i++)
      fireEvent.click(screen.getByRole("button", { name: /Add card/ }));
    const questions = screen.getAllByPlaceholderText(
        "Enter a term or question",
      ),
      answers = screen.getAllByPlaceholderText("Enter a definition or answer");
    expect(questions).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      fireEvent.change(questions[i], { target: { value: "Question " + i } });
      fireEvent.change(answers[i], { target: { value: "Answer " + i } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("flint-decks") || "[]");
      expect(saved[0].cards).toHaveLength(10);
      expect(saved[0].cards[0].repetitions).toBe(8);
    });
  });
});
