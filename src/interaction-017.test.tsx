// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { ItemMenu, menuPosition } from "./ItemMenu";
import {
  ImageDestination,
  ImageField,
  useImageDragFeedback,
} from "./ImageField";
import { SingleCardEditor } from "./SingleCardEditor";
import { StudyScope } from "./StudyScope";
import { CoverPicker } from "./covers";
import { App } from "./App";
import { newCard, type Deck, type Card, gradeAnswer } from "./lib";

const deck: Deck = {
  id: "qa017",
  title: "QA",
  subject: "",
  color: "#f63",
  cards: [newCard("Front", "Back"), newCard("Other", "Other back")],
};
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([
  [500, 300, 500, 300],
  [1270, 710, 1042, 372],
  [-10, -10, 8, 8],
  [1270, 200, 1042, 200],
])("clamps a shared menu at %s,%s", (x, y, left, top) => {
  expect(menuPosition(x, y, 230, 340, 1280, 720)).toEqual({ left, top });
});
it("uses identical actions for button and cursor anchors without scrolling", () => {
  const action = vi.fn();
  const { container } = render(
    <ItemMenu>
      <summary>More actions</summary>
      <div>
        <button onClick={action}>Edit</button>
        <button disabled>Unavailable</button>
      </div>
    </ItemMenu>,
  );
  fireEvent.click(screen.getByText("More actions"));
  expect(
    screen
      .getByRole("button", { name: "Unavailable" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent(
    container.querySelector("details")!,
    new CustomEvent("flint-menu", { detail: { x: 1200, y: 700 } }),
  );
  expect(screen.getByRole("region", { name: "Item actions" }).textContent).toBe(
    "EditUnavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(action).toHaveBeenCalledTimes(2);
  expect(window.scrollTo).not.toHaveBeenCalled();
});
it("cancels a single-card draft, and saves swapped media only for that card", async () => {
  const card = {
    ...deck.cards[0],
    questionImage: "data:image/png;base64,YQ==",
    answerAudio: "data:audio/wav;base64,Yg==",
  };
  const save = vi.fn(async (_card: Card, _starred: boolean) => {}),
    close = vi.fn();
  const view = render(
    <SingleCardEditor card={card} starred={false} save={save} close={close} />,
  );
  fireEvent.change(screen.getByLabelText("Front"), {
    target: { value: "Discard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(save).not.toHaveBeenCalled();
  view.unmount();
  render(
    <SingleCardEditor card={card} starred={false} save={save} close={close} />,
  );
  fireEvent.click(screen.getByLabelText("Star editor card"));
  fireEvent.click(screen.getByLabelText("Swap front and back"));
  fireEvent.click(screen.getByRole("button", { name: "Save card" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]).toEqual([
    expect.objectContaining({
      id: card.id,
      question: "Back",
      answer: "Front",
      answerImage: card.questionImage,
      questionAudio: card.answerAudio,
    }),
    true,
  ]);
  expect(deck.cards[1].question).toBe("Other");
  expect(card.question).toBe("Front");
});
it("scopes and persists Learn accents without changing the legacy global preference", () => {
  localStorage.setItem("flint-ignore-accents", "false");
  const view = render(
    <StudyScope deck={deck} mode="Learn" done={() => {}}>
      {(_, accents) => (
        <output>{gradeAnswer("cafe", "café", "normal", accents)}</output>
      )}
    </StudyScope>,
  );
  fireEvent.click(screen.getByLabelText("Learn settings"));
  expect(screen.getByLabelText("Ignore accents").getAttribute("type")).toBe(
    "checkbox",
  );
  expect(document.querySelector("output")?.textContent).toBe("INCORRECT");
  fireEvent.click(screen.getByLabelText("Ignore accents"));
  expect(localStorage.getItem("flint-learn-ignore-accents")).toBe("true");
  expect(localStorage.getItem("flint-ignore-accents")).toBe("false");
  expect(document.querySelector("output")?.textContent).toBe("CLOSE");
  view.unmount();
  render(
    <StudyScope deck={deck} mode="Flashcards" done={() => {}}>
      {() => null}
    </StudyScope>,
  );
  fireEvent.click(screen.getByLabelText("Flashcards settings"));
  expect(screen.queryByText("Ignore accents")).toBeNull();
});
it("removes accent tolerance from global Settings", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  expect(screen.queryByText("Ignore accents")).toBeNull();
});
it("derives Flint Originals from the current preset rather than stale state", () => {
  const view = render(<CoverPicker deck={deck} onChange={() => {}} />);
  expect(screen.getByText("FLINT ORIGINALS")).toBeTruthy();
  view.rerender(
    <CoverPicker
      deck={{ ...deck, coverImage: "data:image/png;base64,YQ==" }}
      onChange={() => {}}
    />,
  );
  expect(screen.queryByText("FLINT ORIGINALS")).toBeNull();
  view.rerender(<CoverPicker deck={deck} onChange={() => {}} />);
  expect(screen.getByText("FLINT ORIGINALS")).toBeTruthy();
});
it("routes an image drop exactly once to its destination and clears global feedback", async () => {
  const changed = vi.fn();
  function Targets() {
    useImageDragFeedback();
    return (
      <>
        <ImageDestination>
          <ImageField label="Front" onChange={changed} />
        </ImageDestination>
        <ImageDestination>
          <ImageField
            label="Back"
            onChange={() => {
              throw Error("Wrong destination");
            }}
          />
        </ImageDestination>
      </>
    );
  }
  render(<Targets />);
  const file = new File(["image"], "qa.png", { type: "image/png" });
  const dataTransfer = {
    items: [{ kind: "file", type: file.type }],
    files: [file],
  };
  fireEvent.dragEnter(window, { dataTransfer });
  expect(document.body.classList.contains("editor-image-drag")).toBe(true);
  fireEvent.drop(screen.getByLabelText("Front attachment"), { dataTransfer });
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
  expect(changed.mock.calls[0][0]).toMatch(/^data:image\/png/);
  expect(document.body.classList.contains("editor-image-drag")).toBe(false);
  fireEvent.dragEnter(window, { dataTransfer });
  fireEvent.dragEnd(window);
  expect(document.body.classList.contains("editor-image-drag")).toBe(false);
});
it("persists only the selected card through App Save and remount, preserving sibling/history/media", async () => {
  const original = {
    ...deck,
    cards: deck.cards.map((c, i) => ({
      ...c,
      repetitions: 7 + i,
      questionAudio: "data:audio/wav;base64,YQ==",
    })),
  };
  localStorage.setItem("flint-decks", JSON.stringify([original]));
  window.history.replaceState(null, "", "#Study/qa017");
  const view = render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit card 1" }));
  fireEvent.change(screen.getByLabelText("Front"), {
    target: { value: "Edited alone" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save card" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Edit card" })).toBeNull(),
  );
  const saved = JSON.parse(localStorage.getItem("flint-decks")!)[0];
  expect(saved.cards[1]).toEqual(original.cards[1]);
  expect(saved.cards[0]).toEqual({
    ...original.cards[0],
    question: "Edited alone",
  });
  view.unmount();
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit card 1" }));
  expect((screen.getByLabelText("Front") as HTMLTextAreaElement).value).toBe(
    "Edited alone",
  );
});
