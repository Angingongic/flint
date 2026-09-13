import { SingleCardEditor } from "./SingleCardEditor";
import { TestView } from "./TestView";
// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  renderHook,
  act,
} from "@testing-library/react";
import { useState } from "react";
import { newCard, type Deck, isValidCardDraft } from "./lib";
import { makeTest } from "./test-engine";
import { folderPath, allFolderPaths, relocateFolder } from "./folders";
import { useUndoState, duplicateKind } from "./editing";
import { LibraryView, formatStorage } from "./LibraryView";
import { AudioPlayer } from "./Audio";
import { VideoPlayer } from "./Video";
import { AudioRecorder } from "./AudioRecorder";
import { mediaMime } from "./PortableSet";
import { saveMediaBytes, saveVideoBytes, saveAudioBytes } from "./native";
const deck: Deck = {
  id: "media",
  title: "Multimedia",
  subject: "",
  color: "#f63",
  cards: [newCard("Front", "Back")],
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
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event("pause"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("stores original GIF, video and recorded audio bytes in browser preview", async () => {
  const gif = await saveMediaBytes(
    new File(["GIF89a"], "animation.gif", { type: "image/gif" }),
  );
  expect(gif).toBe("data:image/gif;base64,R0lGODlh");
  expect(
    await saveVideoBytes(
      new File(["movie"], "clip.mp4", { type: "video/mp4" }),
    ),
  ).toBe("data:video/mp4;base64,bW92aWU=");
  expect(
    await saveAudioBytes(
      new File(["voice"], "recording.webm", { type: "audio/webm" }),
    ),
  ).toBe("data:audio/webm;base64,dm9pY2U=");
});
it("uses the correct GIF/video/recording MIME in shared previews", () => {
  expect(mediaMime("x.gif")).toBe("image/gif");
  expect(mediaMime("x.mp4")).toBe("video/mp4");
  expect(mediaMime("x.webm", true)).toBe("audio/webm");
  expect(mediaMime("x.webm")).toBe("video/webm");
});
it("preserves recall direction and produces no blank video-only choices", () => {
  const cards = Array.from({ length: 5 }, (_, i) => ({
    ...newCard("", ""),
    questionVideo: "front" + i + ".mp4",
    answerVideo: "back" + i + ".webm",
  }));
  expect(cards.every(isValidCardDraft)).toBe(true);
  for (const direction of ["terms", "definitions"] as const) {
    const questions = makeTest(cards, 5, ["choice"], direction);
    expect(questions).toHaveLength(5);
    for (const q of questions) {
      expect(q.promptVideo).toBe(
        direction === "terms" ? q.card.answerVideo : q.card.questionVideo,
      );
      expect(q.choices.every((c) => !!c.video)).toBe(true);
    }
  }
  expect(duplicateKind(cards[0], cards[1])).toBe(null);
});
it("never autoplays Test-style players and stops the previous player", async () => {
  const view = render(
    <>
      <AudioPlayer name="a.mp3" label="Prompt" />
      <VideoPlayer name="v.mp4" label="Video prompt" />
    </>,
  );
  await waitFor(() =>
    expect(view.container.querySelector("video")?.getAttribute("src")).toBe(
      "v.mp4",
    ),
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Play Prompt" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Play Prompt" }));
  await screen.findByRole("button", { name: "Pause Prompt" });
  const audio = view.container.querySelector("audio")!;
  audio.currentTime = 4;
  fireEvent.play(view.container.querySelector("video")!);
  expect(audio.currentTime).toBe(0);
  expect(screen.getByRole("button", { name: "Play Prompt" })).toBeTruthy();
  view.unmount();
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});
it("resets an old video side and does not play hidden media", async () => {
  const view = render(<VideoPlayer name="v.mp4" autoplay />);
  await waitFor(() =>
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled(),
  );
  const el = view.container.querySelector("video")!;
  el.currentTime = 9;
  view.rerender(<VideoPlayer name="v.mp4" autoplay active={false} />);
  expect(el.currentTime).toBe(0);
  const count = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
  fireEvent.play(el);
  expect(vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length).toBe(
    count,
  );
});
it("handles microphone denial without creating a recording", async () => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi
        .fn()
        .mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
    },
  });
  vi.stubGlobal("MediaRecorder", class {});
  const use = vi.fn();
  render(<AudioRecorder onUse={use} close={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
  await screen.findByText(/Microphone permission denied/);
  expect(use).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Use recording" })).toBeNull();
  vi.unstubAllGlobals();
});
it("extends Undo with Redo and invalidates redo after a fresh edit", () => {
  const hook = renderHook(() => useUndoState("initial"));
  act(() => hook.result.current[1]("changed"));
  act(() => hook.result.current[2]());
  expect(hook.result.current[0]).toBe("initial");
  expect(hook.result.current[5]).toBe(true);
  act(() => hook.result.current[4]());
  expect(hook.result.current[0]).toBe("changed");
  act(() => hook.result.current[2]());
  act(() => hook.result.current[1]("new"));
  expect(hook.result.current[5]).toBe(false);
});
it("moves a complete nested tree and prevents cycles/collisions", () => {
  const decks = [
    { ...deck, meta: { folder: "Biology/Unit 1/Cells" } },
    { ...deck, id: "other", meta: { folder: "Spanish" } },
  ];
  expect(allFolderPaths(decks)).toEqual([
    "Biology",
    "Biology/Unit 1",
    "Biology/Unit 1/Cells",
    "Spanish",
  ]);
  expect(
    relocateFolder(decks, "Biology/Unit 1", "Spanish")[0].meta?.folder,
  ).toBe("Spanish/Unit 1/Cells");
  expect(relocateFolder(decks, "Biology/Unit 1", "")[0].meta?.folder).toBe(
    "Unit 1/Cells",
  );
  expect(() => relocateFolder(decks, "Biology", "Biology/Unit 1")).toThrow(
    /descendants/,
  );
  expect(() => relocateFolder(decks, "Biology", "", "Spanish")).toThrow(
    /already/,
  );
  expect(() => folderPath("Biology//Cells")).toThrow();
});
it("navigates three folder levels and sends New Set the current location", () => {
  const create = vi.fn();
  render(
    <LibraryView
      decks={[{ ...deck, meta: { folder: "Biology/Unit 1/Cells" } }]}
      start={() => {}}
      create={create}
      actions={{
        update: vi.fn(),
        edit: vi.fn(),
        duplicate: vi.fn(),
        export: vi.fn(),
      }}
      globalQuery=""
    />,
  );
  for (const path of ["Biology", "Biology/Unit 1", "Biology/Unit 1/Cells"])
    fireEvent.click(
      screen.getByRole("button", { name: "Open folder " + path }),
    );
  fireEvent.click(screen.getByRole("button", { name: "New set" }));
  expect(create).toHaveBeenCalledWith("Biology/Unit 1/Cells");
  fireEvent.click(screen.getByRole("button", { name: "/ Unit 1" }));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Unit 1");
});
it("formats meaningful binary storage sizes", () => {
  expect(formatStorage(1024)).toBe("1 KiB");
  expect(formatStorage(0)).toBe("0 B");
  expect(formatStorage(1024 ** 3)).toBe("1 GiB");
});
it.each([
  { ctrlKey: true, shiftKey: true, key: "z" },
  { ctrlKey: true, key: "y" },
  { metaKey: true, shiftKey: true, key: "z" },
])("redos a card edit with %j", async (chord) => {
  render(
    <SingleCardEditor
      card={deck.cards[0]}
      starred={false}
      save={async () => {}}
      close={() => {}}
    />,
  );
  const front = screen.getByRole("textbox", { name: "Front" });
  fireEvent.change(front, { target: { value: "Revised" } });
  fireEvent.keyDown(front, { ctrlKey: true, key: "z" });
  expect((front as HTMLTextAreaElement).value).toBe("Front");
  fireEvent.keyDown(front, chord);
  expect((front as HTMLTextAreaElement).value).toBe("Revised");
});
it("Test number keys select only visible choices and ignore editable targets", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 600,
    bottom: 300,
    width: 600,
    height: 300,
    toJSON: () => ({}),
  });
  render(
    <TestView
      deck={{
        ...deck,
        cards: Array.from({ length: 4 }, (_, i) =>
          newCard("Term " + i, "Answer " + i),
        ),
      }}
      done={() => {}}
      studyMissed={() => {}}
    />,
  );
  fireEvent.click(screen.getByLabelText("Written"));
  fireEvent.click(screen.getByRole("button", { name: "Generate test" }));
  const choices = screen.getAllByRole("radio");
  fireEvent.keyDown(window, { key: "2" });
  expect((choices[1] as HTMLInputElement).checked).toBe(true);
  fireEvent.keyDown(choices[0], { key: "1" });
  expect((choices[1] as HTMLInputElement).checked).toBe(true);
});
