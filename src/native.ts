import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Card, Deck } from "./lib";
import { normalizeCover } from "./covers";
import { trashVictims } from "./editing";
export const inTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const nativeCard = (c: Card) => ({
  ...c,
  dueAt: c.dueAt || new Date().toISOString(),
  intervalDays: c.intervalDays || 0,
  ease: c.ease || 2.5,
  repetitions: c.repetitions || 0,
  lapses: c.lapses || 0,
  lastReviewed: c.lastReviewed || null,
  sourceName: c.sourceName || null,
  sourceLocation: c.sourceLocation || null,
  questionImage: c.questionImage || null,
  answerImage: c.answerImage || null,
  questionAudio: c.questionAudio || null,
  answerAudio: c.answerAudio || null,
});
export async function exportFlint(deck: Deck) {
  if (!inTauri())
    throw new Error(
      "Use the Flint desktop app to export a portable .flint file. Text export is available in the browser.",
    );
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    defaultPath: deck.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") + ".flint",
    filters: [{ name: "Flint study set", extensions: ["flint"] }],
  });
  if (path)
    await invoke("export_flint", {
      path,
      deck: {
        ...normalizeCover(deck),
        favorite: !!deck.favorite,
        lastStudied: deck.lastStudied || null,
        cards: deck.cards.map(nativeCard),
      },
    });
}
export async function loadNativeDecks() {
  if (!inTauri()) return null;
  await invoke("cleanup_trash");
  const decks = await invoke<Deck[]>("list_decks");
  return decks.map((d) => ({
    ...normalizeCover(d),
    cards: d.cards.map((c) => ({
      ...c,
      due: new Date(c.dueAt || 0) <= new Date(),
    })),
  }));
}
export async function updateDeckBatch(decks: Deck[]) {
  if (inTauri())
    await invoke("update_decks_details", {
      decks: decks.map((deck) => ({
        ...normalizeCover(deck),
        favorite: !!deck.favorite,
        lastStudied: deck.lastStudied || null,
        cards: deck.cards.map(nativeCard),
      })),
    });
}
export async function pruneTrash(decks: Deck[]) {
  if (inTauri()) {
    await invoke("cleanup_trash");
    const persisted = await invoke<Deck[]>("list_decks");
    const ids = new Set(persisted.map((d) => d.id));
    return decks.filter((d) => ids.has(d.id));
  }
  const removed = trashVictims(decks);
  return decks.filter((d) => !removed.includes(d.id));
}
export async function permanentlyRemoveDeck(id: string) {
  if (inTauri()) await invoke("permanently_remove", { id });
}
export async function saveNativeDeck(deck: Deck, source?: string) {
  if (!inTauri()) return;
  await invoke("save_deck", {
    deck: {
      ...normalizeCover(deck),
      favorite: !!deck.favorite,
      lastStudied: deck.lastStudied || null,
      coverImage: normalizeCover(deck).coverImage,
      cards: deck.cards.map(nativeCard),
    },
    source: source || null,
  });
}
export async function updateDeckDetails(deck: Deck) {
  if (inTauri())
    await invoke("update_deck_details", {
      deck: {
        ...deck,
        favorite: !!deck.favorite,
        lastStudied: deck.lastStudied || null,
        coverImage: normalizeCover(deck).coverImage,
        cards: deck.cards.map(nativeCard),
      },
    });
}
export async function exportDeckText(deck: Deck) {
  const text = deck.cards
    .map((c) =>
      [c.question, c.answer]
        .map((x) => x.replace(/[\t\r\n]+/g, " "))
        .join("\t"),
    )
    .join("\n");
  const filename = deck.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") + ".tsv";
  if (inTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: filename,
      filters: [{ name: "Tab-separated text", extensions: ["tsv"] }],
    });
    if (path) await invoke("export_text", { path, text });
  } else {
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/tab-separated-values;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export async function reviewNative(
  card: Card,
  rating: string,
  correct: boolean,
  responseTimeMs: number,
  userAnswer: string,
) {
  if (!inTauri()) return;
  return invoke("record_review", {
    input: { cardId: card.id, rating, correct, responseTimeMs, userAnswer },
  });
}
export async function extractDocument(path: string) {
  return invoke<string>("extract_document", { path });
}
export async function createBackup(path: string) {
  return invoke("create_backup", { path });
}
export async function restoreBackup(path: string) {
  return invoke("restore_backup", { path });
}
export async function importMedia(path: string) {
  return invoke<string>("import_media", { path });
}
export async function saveMediaBytes(file: File) {
  const extension = (
    { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<
      string,
      string
    >
  )[file.type];
  if (!extension) throw new Error("Unsupported image type");
  return invoke<string>("save_media_bytes", {
    data: Array.from(new Uint8Array(await file.arrayBuffer())),
    extension,
  });
}
export async function mediaUrl(name?: string | null) {
  if (!name) return "";
  if (!inTauri()) return name;
  return convertFileSrc(await invoke<string>("media_path", { name }));
}
export async function saveAudioBytes(file: File) {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (
    !extension ||
    !["mp3", "m4a", "wav", "ogg"].includes(extension) ||
    file.size > 25 * 1024 * 1024
  )
    throw Error("Choose MP3, M4A, WAV or OGG audio up to 25 MB");
  if (inTauri())
    return invoke<string>("save_audio_bytes", {
      data: Array.from(new Uint8Array(await file.arrayBuffer())),
      extension,
    });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
export async function saveStudySession(
  deckId: string,
  mode: string,
  state: unknown,
) {
  if (inTauri())
    await invoke("save_study_session", {
      deckId,
      mode,
      stateJson: JSON.stringify(state),
    });
  else
    localStorage.setItem(
      `flint-session-${deckId}-${mode}`,
      JSON.stringify(state),
    );
}
export async function loadStudySession<T>(deckId: string, mode: string) {
  const value = inTauri()
    ? await invoke<string | null>("load_study_session", { deckId, mode })
    : localStorage.getItem(`flint-session-${deckId}-${mode}`);
  return value ? (JSON.parse(value) as T) : null;
}
export async function recordTestAttempt(
  deckId: string,
  score: number,
  total: number,
  result: unknown,
) {
  if (inTauri())
    await invoke("record_test_attempt", {
      deckId,
      score,
      total,
      resultJson: JSON.stringify(result),
    });
  else {
    const history = JSON.parse(
      localStorage.getItem("flint-test-history") || "[]",
    );
    localStorage.setItem(
      "flint-test-history",
      JSON.stringify([
        ...history,
        { deckId, score, total, result, createdAt: new Date().toISOString() },
      ]),
    );
  }
}
